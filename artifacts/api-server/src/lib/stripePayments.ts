import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

type StripeApiErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: string;
    param?: string;
  };
};

type StripeCheckoutSession = {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired" | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number | null;
  currency: string | null;
  livemode: boolean;
  client_reference_id: string | null;
  metadata?: Record<string, string>;
  payment_intent: string | { id: string } | null;
};

type StripeBalance = {
  livemode: boolean;
};

export class StripePaymentError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: "live_charges_disabled" | "unsupported_currency" | "live_mode_forbidden",
    readonly stripeError?: { type?: string; code?: string; param?: string },
  ) {
    super(message);
    this.name = "StripePaymentError";
  }
}

async function verifyStripeAccountCanAcceptTips(): Promise<boolean> {
  const balance = await stripeRequest<StripeBalance>("/v1/balance");
  if (balance.livemode) {
    throw new StripePaymentError(
      "SANAD is configured for test payments only",
      409,
      "live_mode_forbidden",
    );
  }
  return false;
}

async function stripeRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    form?: URLSearchParams;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await connectors.proxy("stripe", path, {
    method: options.method ?? "GET",
    headers,
    body: options.form,
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorBody = payload as StripeApiErrorBody | null;
    const stripeError = errorBody?.error;
    const message = stripeError?.message ?? "Stripe request failed";
    const code =
      stripeError?.param === "currency" &&
      message.toLowerCase().includes("invalid currency")
        ? "unsupported_currency"
        : undefined;
    throw new StripePaymentError(
      message,
      response.status,
      code,
      {
        type: stripeError?.type,
        code: stripeError?.code,
        param: stripeError?.param,
      },
    );
  }

  return payload as T;
}

function publicAppOrigin(): string {
  const domain =
    process.env.NODE_ENV === "production"
      ? process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()
      : process.env.REPLIT_DEV_DOMAIN?.trim() ??
        process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();

  if (!domain) {
    throw new Error("The public SANAD domain is not configured");
  }

  const origin = domain.startsWith("http://") || domain.startsWith("https://")
    ? new URL(domain).origin
    : `https://${domain}`;

  return origin.replace(/\/$/, "");
}

export async function createTipCheckoutSession(input: {
  tipId: string;
  workerId: string;
  workerSlug: string;
  amountFils: number;
  usdAmountCents: number;
  kwdToUsdRate: string;
  rateSource: string;
  rateUpdatedAt: string;
  checkoutQuoteId: string;
}): Promise<StripeCheckoutSession> {
  const liveMode = await verifyStripeAccountCanAcceptTips();
  const origin = publicAppOrigin();
  const successUrl = new URL("/tip-confirmation", origin);
  successUrl.searchParams.set("tipId", input.tipId);
  successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

  const cancelUrl = new URL(
    `/tip/${encodeURIComponent(input.workerSlug)}`,
    origin,
  );
  cancelUrl.searchParams.set("checkout", "cancelled");
  cancelUrl.searchParams.set("tipId", input.tipId);

  const rateUpdatedAtSeconds = Math.floor(
    new Date(input.rateUpdatedAt).getTime() / 1000,
  );
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(input.usdAmountCents),
    "line_items[0][price_data][product_data][name]": "SANAD Guest Tip",
    "line_items[0][price_data][product_data][description]":
      `KWD ${(input.amountFils / 1000).toFixed(3)} tip · rate ${input.kwdToUsdRate} USD per KWD`,
    client_reference_id: input.tipId,
    success_url: successUrl.toString(),
    cancel_url: cancelUrl.toString(),
    submit_type: "pay",
    "metadata[tip_id]": input.tipId,
    "metadata[worker_id]": input.workerId,
    "metadata[worker_slug]": input.workerSlug,
    "metadata[kwd_amount_fils]": String(input.amountFils),
    "metadata[usd_amount_cents]": String(input.usdAmountCents),
    "metadata[kwd_to_usd_rate]": input.kwdToUsdRate,
    "metadata[rate_source]": input.rateSource,
    "metadata[rate_updated_at]": String(rateUpdatedAtSeconds),
    "metadata[checkout_quote_id]": input.checkoutQuoteId,
    "payment_intent_data[description]": "SANAD Guest Tip",
    "payment_intent_data[metadata][tip_id]": input.tipId,
    "payment_intent_data[metadata][worker_id]": input.workerId,
    "payment_intent_data[metadata][worker_slug]": input.workerSlug,
    "payment_intent_data[metadata][kwd_amount_fils]": String(input.amountFils),
    "payment_intent_data[metadata][usd_amount_cents]": String(input.usdAmountCents),
    "payment_intent_data[metadata][kwd_to_usd_rate]": input.kwdToUsdRate,
    "payment_intent_data[metadata][rate_source]": input.rateSource,
    "payment_intent_data[metadata][rate_updated_at]": String(rateUpdatedAtSeconds),
    "payment_intent_data[metadata][checkout_quote_id]": input.checkoutQuoteId,
  });

  const session = await stripeRequest<StripeCheckoutSession>(
    "/v1/checkout/sessions",
    {
      method: "POST",
      form,
      idempotencyKey: `sanad-tip-checkout-${input.tipId}-${input.checkoutQuoteId}`,
    },
  );
  if (session.livemode !== liveMode) {
    throw new Error("Stripe checkout mode did not match the connected account");
  }
  return session;
}

export async function getStripeCheckoutSession(
  sessionId: string,
): Promise<StripeCheckoutSession> {
  return stripeRequest<StripeCheckoutSession>(
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
}
