import { and, eq, ne } from "drizzle-orm";
import { randomBytes, scrypt as scryptCallback, createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { db, workerAuthSessionsTable, workersTable } from "@workspace/db";

const COOKIE_NAME = "sanad_worker_session";
const ACTIVE_SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const SETUP_SESSION_MS = 20 * 60 * 1000;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PASSWORD_BYTES = 64;

export type WorkerSessionState = "active" | "password_setup";

export function normalizePhoneNumber(value: string): string | null {
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (/^\d{8}$/.test(phone)) phone = `+965${phone}`;
  else if (/^965\d{8}$/.test(phone)) phone = `+${phone}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  return phone;
}

export function generateTemporaryPassword(): string {
  return randomBytes(18).toString("base64url");
}

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, PASSWORD_BYTES, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashWorkerPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyWorkerPassword(
  password: string,
  encodedHash: string | null,
): Promise<boolean> {
  if (!encodedHash) return false;
  const [algorithm, saltText, hashText] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, "base64url");
    if (expected.length !== PASSWORD_BYTES) return false;
    const actual = await derivePassword(password, Buffer.from(saltText, "base64url"));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const item of header.split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=") || null;
  }
  return null;
}

function cookieSecure(req: Request): boolean {
  return process.env.NODE_ENV === "production" ||
    req.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

export function clearWorkerSessionCookie(req: Request, res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(req),
    path: "/",
  });
}

export async function createWorkerSession(
  req: Request,
  res: Response,
  workerId: string,
  state: WorkerSessionState,
): Promise<void> {
  const lifetime = state === "password_setup" ? SETUP_SESSION_MS : ACTIVE_SESSION_MS;
  const expiresAt = new Date(Date.now() + lifetime);
  const token = randomBytes(32).toString("base64url");
  await db.insert(workerAuthSessionsTable).values({
    workerId,
    state,
    tokenHash: tokenHash(token),
    expiresAt,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure(req),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getWorkerSession(req: Request) {
  const token = cookieToken(req);
  if (!token) return null;
  const hash = tokenHash(token);
  const [session] = await db
    .select()
    .from(workerAuthSessionsTable)
    .where(eq(workerAuthSessionsTable.tokenHash, hash))
    .limit(1);
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await db
      .delete(workerAuthSessionsTable)
      .where(eq(workerAuthSessionsTable.id, session.id));
    return null;
  }
  const [worker] = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.id, session.workerId))
    .limit(1);
  if (!worker || worker.status !== "active") {
    await db
      .delete(workerAuthSessionsTable)
      .where(eq(workerAuthSessionsTable.id, session.id));
    return null;
  }
  return { session, worker, tokenHash: hash };
}

export async function getActiveWorkerForRequest(req: Request) {
  const auth = await getWorkerSession(req);
  if (!auth || auth.session.state !== "active" || auth.worker.passwordChangeRequired) {
    return null;
  }
  return auth.worker;
}

export async function destroyWorkerSession(req: Request): Promise<void> {
  const token = cookieToken(req);
  if (!token) return;
  await db
    .delete(workerAuthSessionsTable)
    .where(eq(workerAuthSessionsTable.tokenHash, tokenHash(token)));
}

export async function revokeWorkerSessions(workerId: string): Promise<void> {
  await db
    .delete(workerAuthSessionsTable)
    .where(eq(workerAuthSessionsTable.workerId, workerId));
}

export async function revokeOtherWorkerSessions(
  workerId: string,
  exceptSessionId: string,
): Promise<void> {
  await db
    .delete(workerAuthSessionsTable)
    .where(
      and(
        eq(workerAuthSessionsTable.workerId, workerId),
        ne(workerAuthSessionsTable.id, exceptSessionId),
      ),
    );
}

export async function issueTemporaryWorkerPassword(workerId: string): Promise<string> {
  const temporaryPassword = generateTemporaryPassword();
  const workerPasswordHash = await hashWorkerPassword(temporaryPassword);
  const [worker] = await db
    .update(workersTable)
    .set({ workerPasswordHash, passwordChangeRequired: true })
    .where(and(eq(workersTable.id, workerId), eq(workersTable.status, "active")))
    .returning({ id: workersTable.id });
  if (!worker) throw new Error("Active worker not found");
  await revokeWorkerSessions(workerId);
  return temporaryPassword;
}

export async function upgradeSetupSession(
  req: Request,
  res: Response,
  workerId: string,
  setupSessionId: string,
): Promise<void> {
  await db
    .delete(workerAuthSessionsTable)
    .where(eq(workerAuthSessionsTable.id, setupSessionId));
  await createWorkerSession(req, res, workerId, "active");
}
