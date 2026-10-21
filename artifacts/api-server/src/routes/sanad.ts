import { clerkClient, getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import type { Worker } from "@workspace/db";
import {
  createTipCheckoutSession,
  getStripeCheckoutSession,
  StripePaymentError,
} from "../lib/stripePayments";
import {
  averageRatingForWorker,
  companyPayoutRows,
  companyTransactionRows,
  createCompany,
  createCompanyMembership,
  createPayout,
  createTip,
  createTipIdempotently,
  createWorker,
  getCompanyById,
  getCompanyByNameAndDemo,
  getCompanyMembership,
  getPayoutById,
  getPublicWorker,
  getTipById,
  getTipByCheckoutRequestId,
  getTipWithNames,
  getWorkerByClerkUserId,
  getWorkerById,
  getWorkerBySlug,
  getWorkersByCompany,
  linkInvitedWorker,
  monthlyTipsForCompany,
  monthlyTipsForWorker,
  sumPayoutsForWorkers as sumMongoPayoutsForWorkers,
  sumTipsForWorkers as sumMongoTipsForWorkers,
  updateCompany,
  updatePayoutStatus,
  updateTip,
  updateWorker,
  workerPayoutRows,
  workerTransactionRows,
  writeAudit,
} from "../lib/mongoStore";
import {
  convertKwdFilsToUsdCents,
  createTipQuoteToken,
  getCurrentKwdUsdRate,
  TIP_QUOTE_TTL_MS,
  TIP_RATE_SOURCE,
  TipQuoteError,
  verifyTipQuoteToken,
} from "../lib/tipQuote";
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
  CreateTipQuoteBody,
  CreateTipQuoteResponse,
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
  return getCompanyMembership(userId);
}

async function workerForUser(userId: string) {
  let worker = await getWorkerByClerkUserId(userId);
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

  worker = await getWorkerById(workerId);
  if (
    !worker ||
    worker.status !== "invited" ||
    worker.email?.toLowerCase() !== primaryEmail.emailAddress.toLowerCase()
  ) {
    return null;
  }

  const linked = await linkInvitedWorker(worker.id, userId);
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
  return sumMongoTipsForWorkers(workerIds, statuses, range);
}

async function sumPayoutsForWorkers(
  workerIds: string[],
  status?: "pending" | "paid",
  range?: { month: string },
): Promise<number> {
  return sumMongoPayoutsForWorkers(workerIds, status, range?.month);
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
  if ((await getWorkersByCompany(companyId)).length) return;

  const demoWorkers = [
    { name: "Ahmed Al-Mutairi", arabicName: "أحمد المطيري", role: "Service host", branch: "Salmiya" },
    { name: "Noor Al-Sabah", arabicName: "نور الصباح", role: "Barista", branch: "Sharq" },
    { name: "Sami Rahman", arabicName: "سامي رحمن", role: "Guest services", branch: "Salmiya" },
  ];
  const workers = await Promise.all(
    demoWorkers.map((item) =>
      createWorker({
        id: randomUUID(),
        companyId,
        clerkUserId: null,
        clerkInvitationId: null,
        slug: `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 6)}`,
        name: item.name,
        arabicName: item.arabicName,
        email: null,
        phoneNumber: null,
        workerPasswordHash: null,
        passwordChangeRequired: false,
        role: item.role,
        branch: item.branch,
        photoUrl: null,
        status: "active",
        isDemo: true,
      }),
    ),
  );

  const values = [250, 500, 500, 1000, 2000, 750, 1000, 250, 1500, 500, 2000, 1000];
  const now = Date.now();
  const demoTips = workers.flatMap((worker, workerIndex) =>
    values.slice(workerIndex, workerIndex + 6).map((amountFils, itemIndex) => ({
      reference: `demo_${randomUUID()}`,
      workerId: worker.id,
      amountFils,
      processorFeeFils: 0,
      refundedAmountFils: 0,
      currency: "KWD",
      status: "demo" as const,
      rating: [4, 5, 5, 5, 4, 5][itemIndex] ?? 5,
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      isDemo: true,
      createdAt: new Date(now - (itemIndex + workerIndex * 2) * 86400000),
    })),
  );
  await Promise.all(
    demoTips.map((tip) => createTip({ id: randomUUID(), ...tip })),
  );
  await Promise.all([
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
  ].map((payout) => createPayout({
    companyId: payout.companyId,
    workerId: payout.workerId,
    amountFils: payout.amountFils,
    month: payout.month,
    status: payout.status as "pending" | "paid",
    note: payout.note,
    recordedByClerkUserId: payout.recordedByClerkUserId,
    isDemo: payout.isDemo,
  })));
}

async function ensureLandingDemoWorker() {
  if (!isDevelopment) return;
  const slug = "ahmed-almutairi";
  const existing = await getWorkerBySlug(slug);
  if (existing) return;

  let company = await getCompanyByNameAndDemo("SANAD Demo", true);
  if (!company) {
    company = await createCompany({
      name: "SANAD Demo",
      registrationNumber: null,
      contactEmail: null,
      isDemo: true,
    });
  }
  if (!company) return;
  const worker = await createWorker({
      id: randomUUID(),
      companyId: company.id,
      clerkUserId: null,
      clerkInvitationId: null,
      slug,
      name: "Ahmed Al-Mutairi",
      arabicName: "أحمد المطيري",
      email: null,
      phoneNumber: null,
      workerPasswordHash: null,
      passwordChangeRequired: false,
      role: "Service host",
      branch: "Salmiya",
      photoUrl: null,
      status: "active",
      isDemo: true,
    });
  if (!worker) return;
  await Promise.all([
    {
      id: randomUUID(),
      reference: `demo_${randomUUID()}`,
      workerId: worker.id,
      amountFils: 1000,
      processorFeeFils: 0,
      refundedAmountFils: 0,
      currency: "KWD",
      status: "demo" as const,
      rating: 5,
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      isDemo: true,
    },
    {
      id: randomUUID(),
      reference: `demo_${randomUUID()}`,
      workerId: worker.id,
      amountFils: 2000,
      processorFeeFils: 0,
      refundedAmountFils: 0,
      currency: "KWD",
      status: "demo" as const,
      rating: 5,
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      isDemo: true,
      createdAt: new Date(Date.now() - 86400000),
    },
  ].map((tip) => createTip(tip)));
}

router.get("/public/workers/:slug", async (req, res): Promise<void> => {
  const params = GetPublicWorkerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  let row = await getPublicWorker(params.data.slug);
  if (!row && params.data.slug === "ahmed-almutairi" && isDevelopment) {
    await ensureLandingDemoWorker();
    row = await getPublicWorker(params.data.slug);
  }
  if (!row) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
  res.json(GetPublicWorkerResponse.parse(row));
});

router.post("/tips/quote", async (req, res): Promise<void> => {
  const body = CreateTipQuoteBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const worker = await getWorkerBySlug(body.data.workerSlug);
  if (!worker || worker.status !== "active") {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  try {
    const rate = await getCurrentKwdUsdRate();
    const quotedAt = new Date();
    const expiresAt = new Date(quotedAt.getTime() + TIP_QUOTE_TTL_MS);
    const amountFils = body.data.amountFils;
    const rating = body.data.rating ?? null;
    const usdAmountCents = convertKwdFilsToUsdCents(amountFils, rate.rate);
    const { quoteToken } = createTipQuoteToken(
      {
        workerId: worker.id,
        workerSlug: worker.slug,
        amountFils,
        rating,
        usdAmountCents,
        kwdToUsdRate: rate.rate,
        rateSource: TIP_RATE_SOURCE,
        rateUpdatedAt: rate.updatedAt,
        quotedAt: quotedAt.toISOString(),
        expiresAt: expiresAt.getTime(),
      },
      process.env.SESSION_SECRET ?? "",
    );

    res.json(
      CreateTipQuoteResponse.parse({
        workerSlug: worker.slug,
        amountFils,
        currency: "KWD",
        usdAmountCents,
        paymentCurrency: "USD",
        kwdToUsdRate: rate.rate,
        rateSource: TIP_RATE_SOURCE,
        rateUpdatedAt: new Date(rate.updatedAt),
        quotedAt,
        expiresAt,
        quoteToken,
      }),
    );
  } catch (error) {
    if (error instanceof TipQuoteError) {
      const status =
        error.code === "quote_secret_missing"
          ? 503
          : error.code === "rate_unavailable"
            ? 502
            : 400;
      req.log.warn({ code: error.code }, "Could not create SANAD tip quote");
      res.status(status).json({
        error:
          error.code === "quote_secret_missing"
            ? "Currency conversion is not configured. No payment was made."
            : "Currency conversion is unavailable. No payment was made.",
      });
      return;
    }
    req.log.error(
      { errorType: error instanceof Error ? error.name : "UnknownError" },
      "Could not create SANAD tip quote",
    );
    res.status(502).json({
      error: "Currency conversion is unavailable. No payment was made.",
    });
  }
});

router.post("/tips/checkout", async (req, res): Promise<void> => {
  const body = CreateTipCheckoutBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const worker = await getWorkerBySlug(body.data.workerSlug);
  if (!worker || worker.status !== "active") {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  let quote;
  try {
    quote = verifyTipQuoteToken(
      body.data.quoteToken,
      process.env.SESSION_SECRET ?? "",
    );
  } catch (error) {
    if (error instanceof TipQuoteError) {
      const status =
        error.code === "quote_secret_missing"
          ? 503
          : error.code === "expired_quote"
            ? 409
            : 400;
      res.status(status).json({
        error:
          error.code === "expired_quote"
            ? "This conversion quote expired. Review the amount again."
            : "The conversion quote is invalid. Please review the amount again.",
      });
      return;
    }
    res.status(400).json({ error: "The conversion quote is invalid." });
    return;
  }

  const requestedRating = body.data.rating ?? null;
  if (
    quote.workerId !== worker.id ||
    quote.workerSlug !== worker.slug ||
    quote.amountFils !== body.data.amountFils ||
    quote.rating !== requestedRating
  ) {
    res.status(400).json({ error: "The conversion quote does not match this tip." });
    return;
  }

  const responseForTip = (
    tip: Awaited<ReturnType<typeof getTipById>> & {},
    checkoutUrl: string | null,
    message: string,
  ) =>
    CreateTipCheckoutResponse.parse({
      tipId: tip.id,
      paymentMode: "stripe",
      status:
        tip.status === "succeeded" || tip.status === "demo"
          ? "demo"
          : "pending",
      checkoutUrl,
      message,
      amountFils: tip.amountFils,
      currency: "KWD",
      usdAmountCents: tip.usdAmountCents,
      paymentCurrency: "USD",
      kwdToUsdRate: tip.kwdToUsdRate,
      rateSource: tip.rateSource,
      rateUpdatedAt: tip.rateUpdatedAt,
    });

  let tip = await getTipByCheckoutRequestId(body.data.requestId);
  if (
    tip &&
    (tip.workerId !== worker.id ||
      tip.amountFils !== body.data.amountFils ||
      tip.rating !== requestedRating)
  ) {
    res.status(409).json({
      error: "This checkout request was already used for a different tip.",
    });
    return;
  }

  if (!tip) {
    const id = randomUUID();
    tip = await createTipIdempotently({
      id,
      checkoutRequestId: body.data.requestId,
      checkoutQuoteId: quote.quoteId,
      reference: `sanad_${id}`,
      workerId: worker.id,
      amountFils: quote.amountFils,
      processorFeeFils: 0,
      refundedAmountFils: 0,
      currency: "KWD",
      rating: quote.rating,
      status: "pending",
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      isDemo: false,
      usdAmountCents: quote.usdAmountCents,
      paymentCurrency: "USD",
      kwdToUsdRate: quote.kwdToUsdRate,
      rateSource: quote.rateSource,
      rateUpdatedAt: new Date(quote.rateUpdatedAt),
      quotedAt: new Date(quote.quotedAt),
    });
    if (
      tip.workerId !== worker.id ||
      tip.amountFils !== body.data.amountFils ||
      tip.rating !== requestedRating
    ) {
      res.status(409).json({
        error: "This checkout request was already used for a different tip.",
      });
      return;
    }
  }

  if (tip.status === "succeeded" || tip.status === "demo") {
    res.json(responseForTip(tip, null, "This tip is already complete."));
    return;
  }

  if (
    typeof tip.usdAmountCents !== "number" ||
    tip.paymentCurrency !== "USD" ||
    !tip.kwdToUsdRate ||
    !tip.rateSource ||
    !tip.rateUpdatedAt
  ) {
    res.status(409).json({ error: "The conversion quote is incomplete." });
    return;
  }

  if (tip.status === "pending" && tip.stripeCheckoutSessionId) {
    let existingSession;
    try {
      existingSession = await getStripeCheckoutSession(
        tip.stripeCheckoutSessionId,
      );
    } catch (error) {
      req.log.error(
        {
          tipId: tip.id,
          stripeStatus:
            error instanceof StripePaymentError ? error.status : undefined,
        },
        "Could not retrieve existing SANAD checkout",
      );
      res.status(503).json({ error: "Checkout is temporarily unavailable." });
      return;
    }

    const existingSessionMatches =
      existingSession.id === tip.stripeCheckoutSessionId &&
      existingSession.client_reference_id === tip.id &&
      existingSession.metadata?.tip_id === tip.id &&
      existingSession.amount_total === tip.usdAmountCents &&
      existingSession.currency?.toLowerCase() === "usd";
    if (!existingSessionMatches) {
      req.log.error({ tipId: tip.id }, "Stripe session did not match SANAD tip");
      res.status(502).json({ error: "Checkout could not be verified." });
      return;
    }

    if (existingSession.status === "open" && existingSession.url) {
      res.json(
        responseForTip(
          tip,
          existingSession.url,
          "Your secure checkout is ready. No payment is made until you confirm in Stripe.",
        ),
      );
      return;
    }
    if (existingSession.status === "complete") {
      res.json(
        responseForTip(
          tip,
          null,
          "Checkout was already submitted. Checking payment status.",
        ),
      );
      return;
    }
    if (existingSession.status === "expired") {
      await updateTip(
        tip.id,
        { status: "cancelled", isDemo: !existingSession.livemode },
        { status: "pending", stripeCheckoutSessionId: existingSession.id },
      );
      tip = { ...tip, status: "cancelled" };
    }
  }

  const preparedTip = await updateTip(
    tip.id,
    {
      status: "pending",
      isDemo: false,
      reference: `sanad_${tip.id}`,
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      checkoutQuoteId: quote.quoteId,
      usdAmountCents: quote.usdAmountCents,
      paymentCurrency: "USD",
      kwdToUsdRate: quote.kwdToUsdRate,
      rateSource: quote.rateSource,
      rateUpdatedAt: new Date(quote.rateUpdatedAt),
      quotedAt: new Date(quote.quotedAt),
    },
    { checkoutRequestId: body.data.requestId },
  );
  if (!preparedTip) {
    res.status(500).json({ error: "Could not prepare the tip record." });
    return;
  }
  tip = preparedTip;

  try {
    const session = await createTipCheckoutSession({
      tipId: tip.id,
      workerId: worker.id,
      workerSlug: worker.slug,
      amountFils: tip.amountFils,
      usdAmountCents: quote.usdAmountCents,
      kwdToUsdRate: quote.kwdToUsdRate,
      rateSource: quote.rateSource,
      rateUpdatedAt: quote.rateUpdatedAt,
      checkoutQuoteId: quote.quoteId,
    });
    if (!session.id || !session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    const updatedTip = await updateTip(
      tip.id,
      {
        reference: session.id,
        stripeCheckoutSessionId: session.id,
        isDemo: !session.livemode,
      },
      { status: "pending", checkoutRequestId: body.data.requestId },
    );
    if (!updatedTip) {
      res.status(409).json({ error: "Checkout could not be linked to this tip." });
      return;
    }

    res.json(
      responseForTip(
        updatedTip,
        session.url,
        "Stripe test checkout is ready. No real charge will be made.",
      ),
    );
  } catch (error) {
    const liveModeBlocked =
      error instanceof StripePaymentError &&
      error.code === "live_mode_forbidden";
    await updateTip(
      tip.id,
      { status: "failed", isDemo: worker.isDemo },
      { status: "pending" },
    );
    req.log.error(
      {
        tipId: tip.id,
        stripeStatus: error instanceof StripePaymentError ? error.status : undefined,
      },
      "Could not create SANAD Stripe checkout",
    );
    res.status(liveModeBlocked ? 503 : 502).json({
      error: liveModeBlocked
        ? "SANAD accepts test payments only. No payment was made."
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
  const row = await getTipWithNames(params.data.tipId);
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
      session.metadata?.tip_id === row.id &&
      session.metadata?.worker_id === row.workerId &&
      session.metadata?.checkout_quote_id === row.checkoutQuoteId;
    const paidAmountMatches =
      session.amount_total === row.usdAmountCents &&
      session.currency?.toUpperCase() === "USD" &&
      session.metadata?.kwd_amount_fils === String(row.amountFils) &&
      session.metadata?.usd_amount_cents === String(row.usdAmountCents) &&
      session.metadata?.kwd_to_usd_rate === row.kwdToUsdRate &&
      session.metadata?.rate_source === row.rateSource &&
      session.metadata?.rate_updated_at ===
        String(Math.floor((row.rateUpdatedAt?.getTime() ?? 0) / 1000));

    if (!sessionMatchesTip) {
      logger.error({ tipId: row.id }, "Stripe session did not match SANAD tip");
      res.status(502).json({ error: "Payment status could not be verified" });
      return;
    }
    if (session.livemode) {
      logger.error({ tipId: row.id }, "Live-mode Stripe session rejected");
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
      status = "demo";
      isDemo = true;
    } else if (session.status === "expired") {
      status = "cancelled";
      isDemo = true;
    }

    if (status !== row.status || isDemo !== row.isDemo) {
      await updateTip(row.id, {
          status,
          isDemo,
          stripePaymentIntentId: paymentIntentId,
        }, { status: "pending" });
    }
  }

  res.json(
    GetTipStatusResponse.parse({
      tipId: row.id,
      status,
      amountFils: row.amountFils,
      currency: row.currency,
      usdAmountCents: row.usdAmountCents,
      paymentCurrency: row.paymentCurrency,
      kwdToUsdRate: row.kwdToUsdRate,
      rateSource: row.rateSource,
      rateUpdatedAt: row.rateUpdatedAt,
      isDemo,
      workerName: row.workerName,
      companyName: row.companyName,
    }),
  );
});

router.get("/worker/dashboard", async (req, res): Promise<void> => {
  const worker = await currentWorker(req, res);
  if (!worker) return;
  const company = await getCompanyById(worker.companyId);
  const [received, paid, monthTips, averageRating, recent, monthlyRows] = await Promise.all([
    sumTipsForWorkers([worker.id], successfulTipStatuses),
    sumPayoutsForWorkers([worker.id], "paid"),
    sumTipsForWorkers([worker.id], successfulTipStatuses, monthRange(currentMonth())),
    averageRatingForWorker(worker.id, successfulTipStatuses),
    workerTransactionRows(worker.id, 6),
    monthlyTipsForWorker(worker.id, successfulTipStatuses),
  ]);
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
      averageRating,
      monthly: monthlyRows,
      recentTransactions: recent.map(toTransaction),
      isDemo: worker.isDemo,
    }),
  );
});

router.get("/worker/transactions", async (req, res): Promise<void> => {
  const worker = await currentWorker(req, res);
  if (!worker) return;
  const rows = await workerTransactionRows(worker.id);
  res.json(ListWorkerTransactionsResponse.parse(rows.map(toTransaction)));
});

router.get("/worker/payouts", async (req, res): Promise<void> => {
  const worker = await currentWorker(req, res);
  if (!worker) return;
  const rows = await workerPayoutRows(worker.id);
  res.json(ListWorkerPayoutsResponse.parse(rows.map(toPayout)));
});

router.get("/worker/badge", async (req, res): Promise<void> => {
  const worker = await currentWorker(req, res);
  if (!worker) return;
  const company = await getCompanyById(worker.companyId);
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
    company = await updateCompany(existingMembership.companyId, {
        name: body.data.name.trim(),
        registrationNumber: body.data.registrationNumber ?? null,
        contactEmail: body.data.contactEmail?.toLowerCase() ?? null,
      });
    await writeAudit(company?.id ?? null, userId, "company.profile.updated", "company", company?.id ?? null);
  } else {
    const created = await createCompany({
        name: body.data.name.trim(),
        registrationNumber: body.data.registrationNumber ?? null,
        contactEmail: body.data.contactEmail?.toLowerCase() ?? null,
        isDemo: isDevelopment,
      })
    if (!created) {
      res.status(500).json({ error: "Could not create company profile" });
      return;
    }
    await createCompanyMembership({
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
  const company = await getCompanyById(membership.companyId);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const workers = await getWorkersByCompany(company.id);
  const workerIds = workers.map((worker) => worker.id);
  const month = currentMonth();
  const [received, paid, monthTips, transactions, monthlyRows] = await Promise.all([
    sumTipsForWorkers(workerIds, successfulTipStatuses),
    sumPayoutsForWorkers(workerIds, "paid"),
    sumTipsForWorkers(workerIds, successfulTipStatuses, monthRange(month)),
    companyTransactionRows(company.id, 6),
    monthlyTipsForCompany(company.id, successfulTipStatuses),
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
      monthly: monthlyRows,
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
  const rows = await getWorkersByCompany(membership.companyId);
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
  let worker: Worker | null = null;
  try {
    worker = await createWorker({
        id: workerId,
        companyId: membership.companyId,
        clerkUserId: null,
        clerkInvitationId: null,
        slug,
        name: body.data.name.trim(),
        arabicName: body.data.arabicName ?? null,
        email: null,
        phoneNumber,
        workerPasswordHash,
        passwordChangeRequired: true,
        role: body.data.role.trim(),
        branch: body.data.branch ?? null,
        photoUrl: null,
        status: "active",
        isDemo: false,
      });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
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
  const worker = await getWorkerById(params.data.workerId);
  if (worker?.companyId !== membership.companyId) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
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
  const changes = Object.fromEntries(
    Object.entries(body.data).filter(([, value]) => value !== undefined),
  ) as Partial<Worker>;
  if (body.data.name !== undefined) changes.name = body.data.name.trim();
  if (body.data.role !== undefined) changes.role = body.data.role.trim();
  if (body.data.email !== undefined) changes.email = body.data.email?.toLowerCase() ?? null;
  const worker = await updateWorker(
    params.data.workerId,
    changes,
    { companyId: membership.companyId },
  );
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
  const worker = await getWorkerById(body.data.workerId);
  if (!worker || worker.companyId !== membership.companyId) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }
  const earned = await sumTipsForWorkers([worker.id], successfulTipStatuses);
  const existingPayouts = await sumPayoutsForWorkers([worker.id]);
  if (body.data.amountFils > Math.max(0, earned - existingPayouts)) {
    res.status(400).json({ error: "Payout exceeds this worker’s available tip balance" });
    return;
  }
  const payout = await createPayout({
      companyId: membership.companyId,
      workerId: worker.id,
      amountFils: body.data.amountFils,
      month: body.data.month,
      status: "pending",
      note: body.data.note ?? null,
      recordedByClerkUserId: userId,
      isDemo: worker.isDemo,
    });
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
  const payout = await updatePayoutStatus(
    params.data.payoutId,
    membership.companyId,
    body.data.status,
  );
  if (!payout) {
    res.status(404).json({ error: "Payout record not found" });
    return;
  }
  const worker = await getWorkerById(payout.workerId);
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
  const workers = await getWorkersByCompany(membership.companyId);
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
    isDemo: (await getCompanyById(membership.companyId))?.isDemo ?? false,
  };
  res.json(GetCompanyReportResponse.parse(report));
});

export default router;
