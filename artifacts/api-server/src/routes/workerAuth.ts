import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import {
  ChangeWorkerPasswordBody,
  GetWorkerAuthSessionResponse,
  WorkerLoginBody,
  WorkerLogoutResponse,
} from "@workspace/api-zod";
import { db, workersTable } from "@workspace/db";
import {
  clearWorkerSessionCookie,
  createWorkerSession,
  destroyWorkerSession,
  getWorkerSession,
  hashWorkerPassword,
  normalizePhoneNumber,
  revokeOtherWorkerSessions,
  upgradeSetupSession,
  verifyWorkerPassword,
} from "../lib/workerAuth";

const router: IRouter = Router();
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateKeys(req: Request, phone: string) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const ipHash = createHash("sha256").update(ip).digest("hex");
  const phoneHash = createHash("sha256").update(phone).digest("hex");
  return [
    { key: `phone:${ipHash}:${phoneHash}`, limit: 5 },
    { key: `ip:${ipHash}`, limit: 30 },
  ];
}

function isLimited(keys: ReturnType<typeof rateKeys>): boolean {
  const now = Date.now();
  for (const { key, limit } of keys) {
    const item = attempts.get(key);
    if (item && item.resetAt <= now) attempts.delete(key);
    else if (item && item.count >= limit) return true;
  }
  return false;
}

function recordFailure(keys: ReturnType<typeof rateKeys>): void {
  const now = Date.now();
  for (const { key } of keys) {
    const item = attempts.get(key);
    if (!item || item.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    } else {
      item.count += 1;
    }
  }
  if (attempts.size > 10_000) {
    for (const [key, item] of attempts) {
      if (item.resetAt <= now) attempts.delete(key);
    }
  }
}

function clearFailures(keys: ReturnType<typeof rateKeys>): void {
  for (const { key } of keys) attempts.delete(key);
}

router.post("/worker/auth/login", async (req, res): Promise<void> => {
  const parsed = WorkerLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your phone number and password." });
    return;
  }
  const phoneNumber = normalizePhoneNumber(parsed.data.phoneNumber);
  const keys = rateKeys(req, phoneNumber ?? parsed.data.phoneNumber.trim().toLowerCase());
  if (isLimited(keys)) {
    res.status(429).json({ error: "Too many sign-in attempts. Try again later." });
    return;
  }
  const [worker] = phoneNumber
    ? await db
        .select()
        .from(workersTable)
        .where(eq(workersTable.phoneNumber, phoneNumber))
        .limit(1)
    : [];
  const valid =
    !!worker &&
    worker.status === "active" &&
    (await verifyWorkerPassword(parsed.data.password, worker.workerPasswordHash));
  if (!valid || !worker) {
    recordFailure(keys);
    res.status(401).json({ error: "Phone number or password is incorrect." });
    return;
  }
  clearFailures(keys);
  const state = worker.passwordChangeRequired ? "password_setup" : "active";
  await createWorkerSession(req, res, worker.id, state);
  res.json(
    GetWorkerAuthSessionResponse.parse({
      authenticated: true,
      passwordChangeRequired: worker.passwordChangeRequired,
      workerName: worker.name,
    }),
  );
});

router.get("/worker/auth/session", async (req, res): Promise<void> => {
  const auth = await getWorkerSession(req);
  if (!auth) {
    clearWorkerSessionCookie(req, res);
    res.json(
      GetWorkerAuthSessionResponse.parse({
        authenticated: false,
        passwordChangeRequired: false,
        workerName: null,
      }),
    );
    return;
  }
  res.json(
    GetWorkerAuthSessionResponse.parse({
      authenticated: true,
      passwordChangeRequired:
        auth.session.state === "password_setup" || auth.worker.passwordChangeRequired,
      workerName: auth.worker.name,
    }),
  );
});

router.post("/worker/auth/password", async (req, res): Promise<void> => {
  const parsed = ChangeWorkerPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Use a password with at least 12 characters." });
    return;
  }
  const auth = await getWorkerSession(req);
  if (!auth) {
    res.status(401).json({ error: "Sign in to change your password." });
    return;
  }
  const isPasswordSetup =
    auth.session.state === "password_setup" && auth.worker.passwordChangeRequired;
  const isActiveSession =
    auth.session.state === "active" && !auth.worker.passwordChangeRequired;
  if (!isPasswordSetup && !isActiveSession) {
    res.status(401).json({ error: "Your worker session is not active." });
    return;
  }
  if (isActiveSession) {
    if (!parsed.data.currentPassword) {
      res.status(400).json({ error: "Enter your current password." });
      return;
    }
    if (
      !(await verifyWorkerPassword(
        parsed.data.currentPassword,
        auth.worker.workerPasswordHash,
      ))
    ) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }
  }
  if (await verifyWorkerPassword(parsed.data.newPassword, auth.worker.workerPasswordHash)) {
    res.status(400).json({ error: "Choose a password different from your current password." });
    return;
  }
  const workerPasswordHash = await hashWorkerPassword(parsed.data.newPassword);
  const [worker] = await db
    .update(workersTable)
    .set({ workerPasswordHash, passwordChangeRequired: false })
    .where(eq(workersTable.id, auth.worker.id))
    .returning({ id: workersTable.id, name: workersTable.name });
  if (!worker) {
    res.status(404).json({ error: "Worker account not found." });
    return;
  }
  if (isPasswordSetup) {
    await upgradeSetupSession(req, res, worker.id, auth.session.id);
  } else {
    await revokeOtherWorkerSessions(worker.id, auth.session.id);
  }
  res.json(
    GetWorkerAuthSessionResponse.parse({
      authenticated: true,
      passwordChangeRequired: false,
      workerName: worker.name,
    }),
  );
});

router.post("/worker/auth/logout", async (req, res): Promise<void> => {
  await destroyWorkerSession(req);
  clearWorkerSessionCookie(req, res);
  res.json(WorkerLogoutResponse.parse({ success: true }));
});

export default router;
