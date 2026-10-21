import { clerkClient, getAuth } from "@clerk/express";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import {
  createTipCheckoutSession,
  getStripeCheckoutSession,
  StripePaymentError,
} from "../lib/stripePayments";
import {
  auditLogsTable,
  companiesTable,
  companyMembersTable,
  db,
  payoutsTable,
  tipsTable,
  workersTable,
} from "@workspace/db";
import {
  generateTemporaryPassword,
  getActiveWorkerForRequest,
  hashWorkerPassword,
  issueTemporaryWorkerPassword,
  normalizePhoneNumber,
  revokeWorkerSessions,
} from "../lib/workerAuth";
import {
  CreateCompanyPayoutBody,
  CreateCompanyProfileBody,
  CreateCompanyWorkerBody,
  CreateCompanyWorkerResponse,
  CreateCompanyPayoutResponse,
  CreateCompanyProfileResponse,
  CreateTipCheckoutBody,
  CreateTipCheckoutResponse,
  GetCompanyDashboardResponse,
  GetCompanyReportQueryParams,
  GetCompanyReportResponse,
  GetPublicWorkerParams,
  GetPublicWorkerResponse,
  GetTipStatusParams,
  GetTipStatusResponse,
  GetWorkerBadgeResponse,
  GetWorkerDashboardResponse,
  IssueWorkerTemporaryPasswordResponse,
  ListCompanyPayoutsResponse,
  ListCompanyTransactionsResponse,
  ListCompanyWorkersResponse,
  ListWorkerPayoutsResponse,
  ListWorkerTransactionsResponse,
  UpdateCompanyPayoutStatusBody,
  UpdateCompanyPayoutStatusParams,
  UpdateCompanyPayoutStatusResponse,
  UpdateCompanyWorkerBody,
  UpdateCompanyWorkerParams,
  UpdateCompanyWorkerResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const successfulTipStatuses = ["succeeded", "demo"] as const;
const isDevelopment = process.env.NODE_ENV !== "production";

function currentUserId(req: Request, res: Response): string | null {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return userId;
}

async function companyMembership(userId: string) {
  const [membership] = await db
    .select()
    .from(companyMembersTable)
    .where(eq(companyMembersTable.clerkUserId, userId))
    .limit(1);
  return membership ?? null;
}

async function workerForUser(userId: string) {
  let [worker] = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.clerkUserId, userId))
    .limit(1);
  if (worker) return worker;

  // Worker access is linked only through backend-owned Clerk invitation metadata
  // and a verified primary email; a browser-supplied worker id is never trusted.
  const user = await clerkClient.users.getUser(userId);
  const workerId = user.publicMetadata.workerId;
  const primaryEmail = user.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  );
  if (
    typeof workerId !== "string" ||
    !primaryEmail ||
    primaryEmail.verification?.status !== "verified"
  ) {
    return null;
  }

  [worker] = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.id, workerId))
    .limit(1);
  if (
    !worker ||
    worker.status !== "invited" ||
    worker.email?.toLowerCase() !== primaryEmail.emailAddress.toLowerCase()
  ) {
    return null;
  }

  const [linked] = await db
    .update(workersTable)
    .set({ clerkUserId: userId, status: "active" })
    .where(and(eq(workersTable.id, worker.id), sql`${workersTable.clerkUserId} IS NULL`))
    .returning();
  if (!linked) return null;
  await writeAudit(worker.companyId, userId, "worker.invitation.accepted", "worker", worker.id);
  return linked;
}

async function currentWorker(req: Request, res: Response) {
  const sessionWorker = await getActiveWorkerForRequest(req);
  if (sessionWorker) return sessionWorker;
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const worker = await workerForUser(userId);
  if (!worker) {
    res.status(403).json({ error: "No worker profile is linked to this account" });
    return null;
  }
  return worker;
}

async function writeAudit(
  companyId: string | null,
  actorClerkUserId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
) {
  await db.insert(auditLogsTable).values({
    companyId,
    actorClerkUserId,
    action,
    entityType,
    entityId,
    details,
  });
}

function makeUrl(req: Request, path: string): string {
  const host =
    req.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    req.get("host") ??
    "localhost";
  const protocol =
    req.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  let basePath = "";
  const referer = req.get("referer");
  if (referer) {
    try {
      const referringPage = new URL(referer);
      if (referringPage.origin === origin) {
        const suffix = ["/company/workers", "/worker/qr"].find((value) =>
          referringPage.pathname.endsWith(value),
        );
        if (suffix) basePath = referringPage.pathname.slice(0, -suffix.length);
      }
    } catch {
      // Fall back to the root URL for malformed or cross-origin referrers.
    }
  }
  return new URL(`${basePath}${path}`, origin).toString();
}

async function sumTipsForWorkers(
  workerIds: string[],
  statuses: readonly ("succeeded" | "demo" | "pending" | "failed" | "cancelled")[],
  range?: { from: Date; to: Date },
): Promise<number> {
  if (!workerIds.length) return 0;
  const filters = [
    inArray(tipsTable.workerId, workerIds),
    inArray(tipsTable.status, [...statuses]),
  ];
  if (range) {
    filters.push(gte(tipsTable.createdAt, range.from));
    filters.push(lt(tipsTable.createdAt, range.to));
  }
  const [row] = await db
    .select({ amount: sql<number>`coalesce(sum(${tipsTable.amountFils}), 0)` })
    .from(tipsTable)
    .where(and(...filters));
  return Number(row?.amount ?? 0);
}

async function sumPayoutsForWorkers(
  workerIds: string[],
  status?: "pending" | "paid",
  range?: { month: string },
): Promise<number> {
  if (!workerIds.length) return 0;
  const filters = [inArray(payoutsTable.workerId, workerIds)];
  if (status) filters.push(eq(payoutsTable.status, status));
  if (range) filters.push(eq(payoutsTable.month, range.month));
  const [row] = await db
    .select({ amount: sql<number>`coalesce(sum(${payoutsTable.amountFils}), 0)` })
    .from(payoutsTable)
    .where(and(...filters));
  return Number(row?.amount ?? 0);
}

function monthRange(month: string) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const kuwaitOffsetMs = 3 * 60 * 60 * 1000;
  const from = new Date(Date.UTC(year, monthNumber - 1, 1) - kuwaitOffsetMs);
  const to = new Date(Date.UTC(year, monthNumber, 1) - kuwaitOffsetMs);
  return { from, to };
}

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuwait",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

function toTransaction(
  row: {
    id: string;
    workerId: string;
    workerName: string;
    amountFils: number;
    currency: string;
    status: "pending" | "succeeded" | "failed" | "cancelled" | "demo";
    rating: number | null;
    createdAt: Date;
    isDemo: boolean;
  },
) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function toPayout(row: {
  id: string;
  workerId: string;
  workerName: string;
  amountFils: number;
  month: string;
  status: "pending" | "paid";
  recordedAt: Date;
  note: string | null;
  isDemo: boolean;
}) {
  return { ...row, recordedAt: row.recordedAt.toISOString() };
}

async function seedDemoCompany(companyId: string, actorId: string) {
  if (!isDevelopment) return;
  const existing = await db
    .select({ id: workersTable.id })
    .from(workersTable)
    .where(eq(workersTable.companyId, companyId))
    .limit(1);
  if (existing.length) return;

  const demoWorkers = [
    { name: "Ahmed Al-Mutairi", arabicName: "أحمد المطيري", role: "Service host", branch: "Salmiya" },
    { name: "Noor Al-Sabah", arabicName: "نور الصباح", role: "Barista", branch: "Sharq" },
    { name: "Sami Rahman", arabicName: "سامي رحمن", role: "Guest services", branch: "Salmiya" },
  ];
  const workers = await db
    .insert(workersTable)
    .values(
      demoWorkers.map((item) => ({
        companyId,
        slug: `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 6)}`,
        name: item.name,
        arabicName: item.arabicName,
        role: item.role,
        branch: item.branch,
        status: "active" as const,
        isDemo: true,
      })),
    )
    .returning();

  const values = [250, 500, 500, 1000, 2000, 750, 1000, 250, 1500, 500, 2000, 1000];
  const now = Date.now();
  const demoTips = workers.flatMap((worker, workerIndex) =>
    values.slice(workerIndex, workerIndex + 6).map((amountFils, itemIndex) => ({
      reference: `demo_${randomUUID()}`,
      workerId: worker.id,
      amountFils,
      currency: "KWD",
      status: "demo" as const,
      rating: [4, 5, 5, 5, 4, 5][itemIndex] ?? 5,
      isDemo: true,
      createdAt: new Date(now - (itemIndex + workerIndex * 2) * 86400000),
    })),
  );
  await db.insert(tipsTable).values(demoTips);
  await db.insert(payoutsTable).values([
    {
      companyId,
      workerId: workers[0]!.id,
      amountFils: 2000,
      month: currentMonth(),
      status: "paid",
      note: "Sample payroll record",
      recordedByClerkUserId: actorId,
      isDemo: true,
    },
    {
      companyId,
      workerId: workers[1]!.id,
      amountFils: 1000,
      month: currentMonth(),
      status: "pending",
      note: "Sample pending record",
      recordedByClerkUserId: actorId,
      isDemo: true,
    },
  ]);
}

async function companyTransactionRows(companyId: string, limit = 1000) {
  return db
    .select({
      id: tipsTable.id,
      workerId: tipsTable.workerId,
      workerName: workersTable.name,
      amountFils: tipsTable.amountFils,
      currency: tipsTable.currency,
      status: tipsTable.status,
      rating: tipsTable.rating,
      createdAt: tipsTable.createdAt,
      isDemo: tipsTable.isDemo,
    })
    .from(tipsTable)
    .innerJoin(workersTable, eq(tipsTable.workerId, workersTable.id))
    .where(eq(workersTable.companyId, companyId))
    .orderBy(desc(tipsTable.createdAt))
    .limit(limit);
}

async function companyPayoutRows(companyId: string, workerIds?: string[]) {
  const filters = [eq(payoutsTable.companyId, companyId)];
  if (workerIds) filters.push(inArray(payoutsTable.workerId, workerIds));
  return db
    .select({
      id: payoutsTable.id,
      workerId: payoutsTable.workerId,
      workerName: workersTable.name,
      amountFils: payoutsTable.amountFils,
      month: payoutsTable.month,
      status: payoutsTable.status,
      recordedAt: payoutsTable.recordedAt,
      note: payoutsTable.note,
      isDemo: payoutsTable.isDemo,
    })
    .from(payoutsTable)
    .innerJoin(workersTable, eq(payoutsTable.workerId, workersTable.id))
    .where(and(...filters))
    .orderBy(desc(payoutsTable.recordedAt));
}

async function ensureLandingDemoWorker() {
  if (!isDevelopment) return;
  const slug = "ahmed-almutairi";
  const [existing] = await db
    .select({ id: workersTable.id })
    .from(workersTable)
    .where(eq(workersTable.slug, slug))
    .limit(1);
  if (existing) return;

  let [company] = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(and(eq(companiesTable.name, "SANAD Demo"), eq(companiesTable.isDemo, true)))
    .limit(1);
  if (!company) {
    [company] = await db
      .insert(companiesTable)
      .values({ name: "SANAD Demo", isDemo: true })
      .returning({ id: companiesTable.id });
  }
  if (!company) return;
  const [worker] = await db
    .insert(workersTable)
    .values({
      companyId: company.id,
      slug,
      name: "Ahmed Al-Mutairi",
      arabicName: "أحمد المطيري",
      role: "Service host",
      branch: "Salmiya",
      status: "active",
      isDemo: true,
    })
    .onConflictDoNothing()
    .returning({ id: workersTable.id });
  if (!worker) return;
  await db.insert(tipsTable).values([
    {
      reference: `demo_${randomUUID()}`,
      workerId: worker.id,
      amountFils: 1000,
      currency: "KWD",
      status: "demo",
      rating: 5,
      isDemo: true,
    },
    {
      reference: `demo_${randomUUID()}`,
      workerId: worker.id,
      amountFils: 2000,
      currency: "KWD",
      status: "demo",
      rating: 5,
      isDemo: true,
      createdAt: new Date(Date.now() - 86400000),
    },
  ]);
}

router.get("/public/workers/:slug", async (req, res): Promise<void> => {
  const params = GetPublicWorkerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  let [row] = await db
    .select({
      id: workersTable.id,
      slug: workersTable.slug,
      name: workersTable.name,
      arabicName: workersTable.arabicName,
      role: workersTable.role,
      branch: workersTable.branch,
      photoUrl: workersTable.photoUrl,
      companyName: companiesTable.name,
    })
    .from(workersTable)
    .innerJoin(companiesTable, eq(workersTable.companyId, companiesTable.id))
    .where(and(eq(workersTable.slug, params.data.slug), eq(workersTable.status, "active")))
    .limit(1);
  if (!row && params.data.slug === "ahmed-almutairi" && isDevelopment) {
    await ensureLandingDemoWorker();
    [row] = await db
      .select({
        id: workersTable.id,
        slug: workersTable.slug,
        name: workersTable.name,
        arabicName: workersTable.arabicName,
        role: workersTable.role,
        branch: workersTable.branch,
        photoUrl: workersTable.photoUrl,
        companyName: companiesTable.name,
      })
      .from(workersTable)
      .innerJoin(companiesTable, eq(workersTable.companyId, companiesTable.id))
      .where(and(eq(workersTable.slug, params.data.slug), eq(workersTable.status, "active")))
      .limit(1);
  }
  if (!row) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
  res.json(GetPublicWorkerResponse.parse(row));
});

router.post("/tips/checkout", async (req, res): Promise<void> => {
  const body = CreateTipCheckoutBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [worker] = await db
    .select({
      id: workersTable.id,
      slug: workersTable.slug,
      name: workersTable.name,
      status: workersTable.status,
      isDemo: workersTable.isDemo,
    })
    .from(workersTable)
    .where(eq(workersTable.slug, body.data.workerSlug))
    .limit(1);
  if (!worker || worker.status !== "active") {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  const tipId = randomUUID();
  const [tip] = await db
    .insert(tipsTable)
    .values({
      id: tipId,
      reference: `sanad_${tipId}`,
      workerId: worker.id,
      amountFils: body.data.amountFils,
      currency: "KWD",
      rating: body.data.rating ?? null,
      status: "pending",
      isDemo: false,
    })
    .returning({ id: tipsTable.id });
  if (!tip) {
    res.status(500).json({ error: "Could not create the tip record" });
    return;
  }

  try {
    const session = await createTipCheckoutSession({
      tipId: tip.id,
      workerId: worker.id,
      workerSlug: worker.slug,
      workerName: worker.name,
      amountFils: body.data.amountFils,
    });
    if (!session.id || !session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    await db
      .update(tipsTable)
      .set({
        reference: session.id,
        stripeCheckoutSessionId: session.id,
        isDemo: !session.livemode,
      })
      .where(eq(tipsTable.id, tip.id));

    res.json(
      CreateTipCheckoutResponse.parse({
        tipId: tip.id,
        paymentMode: "stripe",
        status: "pending",
        checkoutUrl: session.url,
        message: session.livemode
          ? "Stripe checkout is ready. The payment settles to SANAD's connected Stripe account."
          : "Stripe test mode is active. No real charge will be made.",
      }),
    );
  } catch (error) {
    const liveAccountNeedsSetup =
      error instanceof StripePaymentError &&
      error.code === "live_charges_disabled";
    const currencyUnsupported =
      error instanceof StripePaymentError &&
      error.code === "unsupported_currency";
    await db
      .update(tipsTable)
      .set({ status: "failed", isDemo: worker.isDemo })
      .where(and(eq(tipsTable.id, tip.id), eq(tipsTable.status, "pending")));
    logger.error(
      {
        tipId: tip.id,
        stripeStatus: error instanceof StripePaymentError ? error.status : undefined,
      },
      "Could not create SANAD Stripe checkout",
    );
    res.status(liveAccountNeedsSetup ? 503 : currencyUnsupported ? 422 : 502).json({
      error: liveAccountNeedsSetup
        ? "Live Stripe payments are not enabled for this account. No payment was made."
        : currencyUnsupported
          ? "This Stripe account cannot accept KWD yet. Add a KWD bank account in Stripe settings. No payment was made."
        : "Stripe checkout is unavailable. No payment was made.",
    });
  }
});

router.get("/tips/:tipId", async (req, res): Promise<void> => {
  const params = GetTipStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({
      id: tipsTable.id,
      status: tipsTable.status,
      amountFils: tipsTable.amountFils,
      currency: tipsTable.currency,
      isDemo: tipsTable.isDemo,
      stripeCheckoutSessionId: tipsTable.stripeCheckoutSessionId,
      workerName: workersTable.name,
      companyName: companiesTable.name,
    })
    .from(tipsTable)
    .innerJoin(workersTable, eq(tipsTable.workerId, workersTable.id))
    .innerJoin(companiesTable, eq(workersTable.companyId, companiesTable.id))
    .where(eq(tipsTable.id, params.data.tipId))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Tip not found" });
    return;
  }

  let status = row.status;
  let isDemo = row.isDemo;
  if (status === "pending" && row.stripeCheckoutSessionId) {
    let session;
    try {
      session = await getStripeCheckoutSession(row.stripeCheckoutSessionId);
    } catch (error) {
      logger.error(
        {
          tipId: row.id,
          stripeStatus:
            error instanceof StripePaymentError ? error.status : undefined,
        },
        "Could not verify SANAD Stripe checkout",
      );
      res.status(503).json({ error: "Payment status is temporarily unavailable" });
      return;
    }

    const sessionMatchesTip =
      session.id === row.stripeCheckoutSessionId &&
      session.client_reference_id === row.id &&
      session.metadata?.tip_id === row.id;
    const paidAmountMatches =
      session.amount_total === row.amountFils &&
      session.currency?.toUpperCase() === row.currency.toUpperCase();

    if (!sessionMatchesTip) {
      logger.error({ tipId: row.id }, "Stripe session did not match SANAD tip");
      res.status(502).json({ error: "Payment status could not be verified" });
      return;
    }

    let paymentIntentId: string | null = null;
    if (typeof session.payment_intent === "string") {
      paymentIntentId = session.payment_intent;
    } else if (session.payment_intent) {
      paymentIntentId = session.payment_intent.id;
    }

    if (
      session.status === "complete" &&
      session.payment_status === "paid"
    ) {
      if (!paidAmountMatches) {
        logger.error({ tipId: row.id }, "Stripe amount did not match SANAD tip");
        res.status(502).json({ error: "Payment amount could not be verified" });
        return;
      }
      status = session.livemode ? "succeeded" : "demo";
      isDemo = !session.livemode;
    } else if (session.status === "expired") {
      status = "cancelled";
      isDemo = !session.livemode;
    }

    if (status !== row.status || isDemo !== row.isDemo) {
      await db
        .update(tipsTable)
        .set({
          status,
          isDemo,
          stripePaymentIntentId: paymentIntentId,
        })
        .where(and(eq(tipsTable.id, row.id), eq(tipsTable.status, "pending")));
    }
  }

  res.json(
    GetTipStatusResponse.parse({
      tipId: row.id,
      status,
      amountFils: row.amountFils,
      currency: row.currency,
      isDemo,
      workerName: row.workerName,
      companyName: row.companyName,
    }),
  );
});

router.get("/worker/dashboard", async (req, res): Promise<void> => {
  const worker = await currentWorker(req, res);
  if (!worker) return;
  const [company] = await db
    .select({ name: companiesTable.name })
    .from(companiesTable)
    .where(eq(companiesTable.id, worker.companyId))
    .limit(1);
  const [received, paid, monthTips, avgRating] = await Promise.all([
    sumTipsForWorkers([worker.id], successfulTipStatuses),
    sumPayoutsForWorkers([worker.id], "paid"),
    sumTipsForWorkers([worker.id], successfulTipStatuses, monthRange(currentMonth())),
    db
      .select({ rating: sql<number | null>`avg(${tipsTable.rating})` })
      .from(tipsTable)
      .where(and(eq(tipsTable.workerId, worker.id), inArray(tipsTable.status, [...successfulTipStatuses]))),
  ]);
  const [recent] = await Promise.all([
    db
      .select({
        id: tipsTable.id,
        workerId: tipsTable.workerId,
        workerName: workersTable.name,
        amountFils: tipsTable.amountFils,
        currency: tipsTable.currency,
        status: tipsTable.status,
        rating: tipsTable.rating,
        createdAt: tipsTable.createdAt,
        isDemo: tipsTable.isDemo,
      })
      .from(tipsTable)
      .innerJoin(workersTable, eq(tipsTable.workerId, workersTable.id))
      .where(eq(tipsTable.workerId, worker.id))
      .orderBy(desc(tipsTable.createdAt))
      .limit(6),
  ]);
  const monthlyRows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${tipsTable.createdAt}), 'YYYY-MM')`,
      amountFils: sql<number>`coalesce(sum(${tipsTable.amountFils}), 0)`,
    })
    .from(tipsTable)
    .where(and(eq(tipsTable.workerId, worker.id), inArray(tipsTable.status, [...successfulTipStatuses])))
    .groupBy(sql`date_trunc('month', ${tipsTable.createdAt})`)
    .orderBy(sql`date_trunc('month', ${tipsTable.createdAt})`);
  const totalTipsFils = received;
  const workerData = {
    id: worker.id,
    slug: worker.slug,
    name: worker.name,
    arabicName: worker.arabicName,
    email: worker.email,
    phoneNumber: worker.phoneNumber,
    role: worker.role,
    branch: worker.branch,
    status: worker.status,
    totalTipsFils,
    isDemo: worker.isDemo,
  };
  res.json(
    GetWorkerDashboardResponse.parse({
      worker: workerData,
      totalTipsFils,
      pendingTipsFils: Math.max(0, received - paid),
      paidTipsFils: paid,
      monthTipsFils: monthTips,
      averageRating: avgRating[0]?.rating == null ? null : Number(avgRating[0].rating),
      monthly: monthlyRows.map((row) => ({ month: row.month, amountFils: Number(row.amountFils) })),
      recentTransactions: recent.map(toTransaction),
      isDemo: worker.isDemo,
    }),
  );
});

router.get("/worker/transactions", async (req, res): Promise<void> => {
  const worker = await currentWorker(req, res);
  if (!worker) return;
  const rows = await db
    .select({
      id: tipsTable.id,
      workerId: tipsTable.workerId,
      workerName: workersTable.name,
      amountFils: tipsTable.amountFils,
      currency: tipsTable.currency,
      status: tipsTable.status,
      rating: tipsTable.rating,
      createdAt: tipsTable.createdAt,
      isDemo: tipsTable.isDemo,
    })
    .from(tipsTable)
    .innerJoin(workersTable, eq(tipsTable.workerId, workersTable.id))
    .where(eq(tipsTable.workerId, worker.id))
    .orderBy(desc(tipsTable.createdAt));
  res.json(ListWorkerTransactionsResponse.parse(rows.map(toTransaction)));
});

router.get("/worker/payouts", async (req, res): Promise<void> => {
  const worker = await currentWorker(req, res);
  if (!worker) return;
  const rows = await db
    .select({
      id: payoutsTable.id,
      workerId: payoutsTable.workerId,
      workerName: workersTable.name,
      amountFils: payoutsTable.amountFils,
      month: payoutsTable.month,
      status: payoutsTable.status,
      recordedAt: payoutsTable.recordedAt,
      note: payoutsTable.note,
      isDemo: payoutsTable.isDemo,
    })
    .from(payoutsTable)
    .innerJoin(workersTable, eq(payoutsTable.workerId, workersTable.id))
    .where(eq(payoutsTable.workerId, worker.id))
    .orderBy(desc(payoutsTable.recordedAt));
  res.json(ListWorkerPayoutsResponse.parse(rows.map(toPayout)));
});

router.get("/worker/badge", async (req, res): Promise<void> => {
  const worker = await currentWorker(req, res);
  if (!worker) return;
  const [company] = await db
    .select({ name: companiesTable.name })
    .from(companiesTable)
    .where(eq(companiesTable.id, worker.companyId))
    .limit(1);
  res.json(
    GetWorkerBadgeResponse.parse({
      workerId: worker.id,
      workerSlug: worker.slug,
      tippingUrl: makeUrl(req, `/tip/${worker.slug}`),
      workerName: worker.name,
      companyName: company?.name ?? "",
      isDemo: worker.isDemo,
    }),
  );
});

router.post("/company/profile", async (req, res): Promise<void> => {
  const userId = currentUserId(req, res);
  if (!userId) return;
  const body = CreateCompanyProfileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const existingMembership = await companyMembership(userId);
  if (!existingMembership && (await workerForUser(userId))) {
    res.status(403).json({ error: "Worker accounts cannot register company profiles" });
    return;
  }
  let company;
  if (existingMembership) {
    [company] = await db
      .update(companiesTable)
      .set({
        name: body.data.name.trim(),
        registrationNumber: body.data.registrationNumber ?? null,
        contactEmail: body.data.contactEmail?.toLowerCase() ?? null,
      })
      .where(eq(companiesTable.id, existingMembership.companyId))
      .returning();
    await writeAudit(company?.id ?? null, userId, "company.profile.updated", "company", company?.id ?? null);
  } else {
    const [created] = await db
      .insert(companiesTable)
      .values({
        name: body.data.name.trim(),
        registrationNumber: body.data.registrationNumber ?? null,
        contactEmail: body.data.contactEmail?.toLowerCase() ?? null,
        isDemo: isDevelopment,
      })
      .returning();
    if (!created) {
      res.status(500).json({ error: "Could not create company profile" });
      return;
    }
    await db.insert(companyMembersTable).values({
      companyId: created.id,
      clerkUserId: userId,
      role: "company_admin",
      email: body.data.contactEmail?.toLowerCase() ?? null,
    });
    await writeAudit(created.id, userId, "company.profile.created", "company", created.id);
    await seedDemoCompany(created.id, userId);
    company = created;
  }
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.status(201).json(
    CreateCompanyProfileResponse.parse({
      id: company.id,
      name: company.name,
      registrationNumber: company.registrationNumber,
      contactEmail: company.contactEmail,
      isDemo: company.isDemo,
    }),
  );
});

router.get("/company/dashboard", async (req, res): Promise<void> => {
  const userId = currentUserId(req, res);
  if (!userId) return;
  const membership = await companyMembership(userId);
  if (!membership) {
    res.status(404).json({ error: "Register a company profile to continue" });
    return;
  }
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, membership.companyId))
    .limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const workers = await db
    .select({ id: workersTable.id, status: workersTable.status })
    .from(workersTable)
    .where(eq(workersTable.companyId, company.id));
  const workerIds = workers.map((worker) => worker.id);
  const month = currentMonth();
  const [received, paid, monthTips, transactions, monthlyRows] = await Promise.all([
    sumTipsForWorkers(workerIds, successfulTipStatuses),
    sumPayoutsForWorkers(workerIds, "paid"),
    sumTipsForWorkers(workerIds, successfulTipStatuses, monthRange(month)),
    companyTransactionRows(company.id, 6),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${tipsTable.createdAt}), 'YYYY-MM')`,
        amountFils: sql<number>`coalesce(sum(${tipsTable.amountFils}), 0)`,
      })
      .from(tipsTable)
      .innerJoin(workersTable, eq(tipsTable.workerId, workersTable.id))
      .where(and(eq(workersTable.companyId, company.id), inArray(tipsTable.status, [...successfulTipStatuses])))
      .groupBy(sql`date_trunc('month', ${tipsTable.createdAt})`)
      .orderBy(sql`date_trunc('month', ${tipsTable.createdAt})`),
  ]);
  const profile = {
    id: company.id,
    name: company.name,
    registrationNumber: company.registrationNumber,
    contactEmail: company.contactEmail,
    isDemo: company.isDemo,
  };
  res.json(
    GetCompanyDashboardResponse.parse({
      company: profile,
      totalTipsFils: received,
      pendingTipsFils: Math.max(0, received - paid),
      paidOutFils: paid,
      activeWorkers: workers.filter((worker) => worker.status === "active").length,
      monthTipsFils: monthTips,
      monthly: monthlyRows.map((row) => ({ month: row.month, amountFils: Number(row.amountFils) })),
      recentTransactions: transactions.map(toTransaction),
      isDemo: company.isDemo,
    }),
  );
});

router.get("/company/workers", async (req, res): Promise<void> => {
  const userId = currentUserId(req, res);
  if (!userId) return;
  const membership = await companyMembership(userId);
  if (!membership) {
    res.status(404).json({ error: "Company profile not found" });
    return;
  }
  const rows = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.companyId, membership.companyId))
    .orderBy(workersTable.name);
  const values = await Promise.all(
    rows.map(async (worker) => ({
      id: worker.id,
      slug: worker.slug,
      name: worker.name,
      arabicName: worker.arabicName,
      email: worker.email,
      phoneNumber: worker.phoneNumber,
      role: worker.role,
      branch: worker.branch,
      status: worker.status,
      totalTipsFils: await sumTipsForWorkers([worker.id], successfulTipStatuses),
      isDemo: worker.isDemo,
    })),
  );
  res.json(ListCompanyWorkersResponse.parse(values));
});

router.post("/company/workers", async (req, res): Promise<void> => {
  const userId = currentUserId(req, res);
  if (!userId) return;
  const body = CreateCompanyWorkerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const membership = await companyMembership(userId);
  if (!membership) {
    res.status(404).json({ error: "Company profile not found" });
    return;
  }
  const phoneNumber = normalizePhoneNumber(body.data.phoneNumber);
  if (!phoneNumber) {
    res.status(400).json({ error: "Enter a valid phone number, including its country code." });
    return;
  }
  const workerId = randomUUID();
  const temporaryPassword = generateTemporaryPassword();
  const workerPasswordHash = await hashWorkerPassword(temporaryPassword);
  const slug = `${body.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${randomUUID().slice(0, 6)}`;
  let worker: typeof workersTable.$inferSelect | undefined;
  try {
    [worker] = await db
      .insert(workersTable)
      .values({
        id: workerId,
        companyId: membership.companyId,
        slug,
        name: body.data.name.trim(),
        arabicName: body.data.arabicName ?? null,
        phoneNumber,
        workerPasswordHash,
        passwordChangeRequired: true,
        email: null,
        role: body.data.role.trim(),
        branch: body.data.branch ?? null,
        status: "active",
        isDemo: false,
      })
      .returning();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "A worker account already uses this phone number." });
      return;
    }
    throw error;
  }
  if (!worker) {
    res.status(500).json({ error: "Could not create worker profile" });
    return;
  }
  await writeAudit(membership.companyId, userId, "worker.created", "worker", worker.id);
  res.status(201).json(
    CreateCompanyWorkerResponse.parse({
      worker: {
        id: worker.id,
        slug: worker.slug,
        name: worker.name,
        arabicName: worker.arabicName,
        email: worker.email,
        phoneNumber: worker.phoneNumber,
        role: worker.role,
        branch: worker.branch,
        status: worker.status,
        totalTipsFils: 0,
        isDemo: worker.isDemo,
      },
      temporaryPassword,
    }),
  );
});

router.post("/company/workers/:workerId/temporary-password", async (req, res): Promise<void> => {
  const userId = currentUserId(req, res);
  if (!userId) return;
  const params = UpdateCompanyWorkerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const membership = await companyMembership(userId);
  if (!membership) {
    res.status(404).json({ error: "Company profile not found" });
    return;
  }
  const [worker] = await db
    .select()
    .from(workersTable)
    .where(and(eq(workersTable.id, params.data.workerId), eq(workersTable.companyId, membership.companyId)))
    .limit(1);
  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
  if (worker.status !== "active") {
    res.status(409).json({ error: "Activate this worker before issuing a password." });
    return;
  }
  const temporaryPassword = await issueTemporaryWorkerPassword(worker.id);
  await writeAudit(membership.companyId, userId, "worker.password.reset", "worker", worker.id);
  res.json(IssueWorkerTemporaryPasswordResponse.parse({ temporaryPassword }));
});

router.patch("/company/workers/:workerId", async (req, res): Promise<void> => {
  const userId = currentUserId(req, res);
  if (!userId) return;
  const params = UpdateCompanyWorkerParams.safeParse(req.params);
  const body = UpdateCompanyWorkerBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const message = !params.success ? params.error.message : !body.success ? body.error.message : "Invalid request";
    res.status(400).json({ error: message });
    return;
  }
  const membership = await companyMembership(userId);
  if (!membership) {
    res.status(404).json({ error: "Company profile not found" });
    return;
  }
  const [worker] = await db
    .update(workersTable)
    .set({
      ...body.data,
      name: body.data.name?.trim(),
      role: body.data.role?.trim(),
      email: body.data.email?.toLowerCase(),
    })
    .where(and(eq(workersTable.id, params.data.workerId), eq(workersTable.companyId, membership.companyId)))
    .returning();
  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
  if (worker.status === "inactive") await revokeWorkerSessions(worker.id);
  await writeAudit(membership.companyId, userId, "worker.updated", "worker", worker.id, {
    changedFields: Object.keys(body.data),
  });
  res.json(
    UpdateCompanyWorkerResponse.parse({
      id: worker.id,
      slug: worker.slug,
      name: worker.name,
      arabicName: worker.arabicName,
      email: worker.email,
      phoneNumber: worker.phoneNumber,
      role: worker.role,
      branch: worker.branch,
      status: worker.status,
      totalTipsFils: await sumTipsForWorkers([worker.id], successfulTipStatuses),
      isDemo: worker.isDemo,
    }),
  );
});

router.get("/company/transactions", async (req, res): Promise<void> => {
  const userId = currentUserId(req, res);
  if (!userId) return;
  const membership = await companyMembership(userId);
  if (!membership) {
    res.status(404).json({ error: "Company profile not found" });
    return;
  }
  const rows = await companyTransactionRows(membership.companyId);
  res.json(ListCompanyTransactionsResponse.parse(rows.map(toTransaction)));
});

router.get("/company/payouts", async (req, res): Promise<void> => {
  const userId = currentUserId(req, res);
  if (!userId) return;
  const membership = await companyMembership(userId);
  if (!membership) {
    res.status(404).json({ error: "Company profile not found" });
    return;
  }
  const rows = await companyPayoutRows(membership.companyId);
  res.json(ListCompanyPayoutsResponse.parse(rows.map(toPayout)));
});

router.post("/company/payouts", async (req, res): Promise<void> => {
  const userId = currentUserId(req, res);
  if (!userId) return;
  const body = CreateCompanyPayoutBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const membership = await companyMembership(userId);
  if (!membership) {
    res.status(404).json({ error: "Company profile not found" });
    return;
  }
  const [worker] = await db
    .select()
    .from(workersTable)
    .where(and(eq(workersTable.id, body.data.workerId), eq(workersTable.companyId, membership.companyId)))
    .limit(1);
  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
  const earned = await sumTipsForWorkers([worker.id], successfulTipStatuses);
  const existingPayouts = await sumPayoutsForWorkers([worker.id]);
  if (body.data.amountFils > Math.max(0, earned - existingPayouts)) {
    res.status(400).json({ error: "Payout exceeds this worker’s available tip balance" });
    return;
  }
  const [payout] = await db
    .insert(payoutsTable)
    .values({
      companyId: membership.companyId,
      workerId: worker.id,
      amountFils: body.data.amountFils,
      month: body.data.month,
      status: "pending",
      note: body.data.note ?? null,
      recordedByClerkUserId: userId,
      isDemo: worker.isDemo,
    })
    .returning();
  if (!payout) {
    res.status(500).json({ error: "Could not save payout record" });
    return;
  }
  await writeAudit(membership.companyId, userId, "payout.created", "payout", payout.id, {
    workerId: worker.id,
    amountFils: payout.amountFils,
    month: payout.month,
  });
  res.status(201).json(
    CreateCompanyPayoutResponse.parse({
      id: payout.id,
      workerId: worker.id,
      workerName: worker.name,
      amountFils: payout.amountFils,
      month: payout.month,
      status: payout.status,
      recordedAt: payout.recordedAt.toISOString(),
      note: payout.note,
      isDemo: payout.isDemo,
    }),
  );
});

router.patch("/company/payouts/:payoutId", async (req, res): Promise<void> => {
  const userId = currentUserId(req, res);
  if (!userId) return;
  const params = UpdateCompanyPayoutStatusParams.safeParse(req.params);
  const body = UpdateCompanyPayoutStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const message = !params.success ? params.error.message : !body.success ? body.error.message : "Invalid request";
    res.status(400).json({ error: message });
    return;
  }
  const membership = await companyMembership(userId);
  if (!membership) {
    res.status(404).json({ error: "Company profile not found" });
    return;
  }
  const [payout] = await db
    .update(payoutsTable)
    .set({ status: body.data.status })
    .where(and(eq(payoutsTable.id, params.data.payoutId), eq(payoutsTable.companyId, membership.companyId)))
    .returning();
  if (!payout) {
    res.status(404).json({ error: "Payout record not found" });
    return;
  }
  const [worker] = await db
    .select({ name: workersTable.name })
    .from(workersTable)
    .where(eq(workersTable.id, payout.workerId))
    .limit(1);
  await writeAudit(membership.companyId, userId, "payout.status.updated", "payout", payout.id, {
    status: payout.status,
  });
  res.json(
    UpdateCompanyPayoutStatusResponse.parse({
      id: payout.id,
      workerId: payout.workerId,
      workerName: worker?.name ?? "",
      amountFils: payout.amountFils,
      month: payout.month,
      status: payout.status,
      recordedAt: payout.recordedAt.toISOString(),
      note: payout.note,
      isDemo: payout.isDemo,
    }),
  );
});

router.get("/company/reports", async (req, res): Promise<void> => {
  const userId = currentUserId(req, res);
  if (!userId) return;
  const params = GetCompanyReportQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const membership = await companyMembership(userId);
  if (!membership) {
    res.status(404).json({ error: "Company profile not found" });
    return;
  }
  const workers = await db
    .select({ id: workersTable.id })
    .from(workersTable)
    .where(eq(workersTable.companyId, membership.companyId));
  const workerIds = workers.map((worker) => worker.id);
  const range = monthRange(params.data.month);
  const [tipsFils, payouts, transactions] = await Promise.all([
    sumTipsForWorkers(workerIds, successfulTipStatuses, range),
    companyPayoutRows(membership.companyId, workerIds).then((rows) =>
      rows.filter((row) => row.month === params.data.month),
    ),
    companyTransactionRows(membership.companyId).then((rows) =>
      rows.filter((row) => row.createdAt >= range.from && row.createdAt < range.to),
    ),
  ]);
  const paidOutFils = payouts
    .filter((payout) => payout.status === "paid")
    .reduce((total, payout) => total + payout.amountFils, 0);
  const pendingFils = Math.max(0, tipsFils - paidOutFils);
  const report = {
    month: params.data.month,
    tipsFils,
    pendingFils,
    paidOutFils,
    workerCount: new Set(transactions.map((transaction) => transaction.workerId)).size,
    transactionCount: transactions.length,
    isDemo: membership.companyId
      ? (await db
          .select({ isDemo: companiesTable.isDemo })
          .from(companiesTable)
          .where(eq(companiesTable.id, membership.companyId))
          .limit(1))[0]?.isDemo ?? false
      : false,
  };
  res.json(GetCompanyReportResponse.parse(report));
});

export default router;
