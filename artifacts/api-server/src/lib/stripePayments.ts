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

type StripeProduct = {
  id: string;
  metadata?: Record<string, string>;
};

type StripePrice = {
  id: string;
  active: boolean;
  currency: string;
  lookup_key: string | null;
  unit_amount: number | null;
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

type StripeAccount = {
  charges_enabled: boolean;
};

type StripeBalance = {
  livemode: boolean;
};

type StripeList<T> = {
  data: T[];
  has_more: boolean;
};

export class StripePaymentError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: "live_charges_disabled" | "unsupported_currency",
  ) {
    super(message);
    this.name = "StripePaymentError";
  }
}

async function verifyStripeAccountCanAcceptTips(): Promise<boolean> {
  const [account, balance] = await Promise.all([
    stripeRequest<StripeAccount>("/v1/account"),
    stripeRequest<StripeBalance>("/v1/balance"),
  ]);
  if (balance.livemode && !account.charges_enabled) {
    throw new StripePaymentError(
      "Live Stripe payments are not enabled for this account",
      409,
      "live_charges_disabled",
    );
  }
  return balance.livemode;
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
    const message = errorBody?.error?.message ?? "Stripe request failed";
    const code =
      errorBody?.error?.param === "currency" &&
      message.toLowerCase().includes("invalid currency")
        ? "unsupported_currency"
        : undefined;
    throw new StripePaymentError(
      message,
      response.status,
      code,
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

async function findOrCreateTipProduct(): Promise<string> {
  const query = new URLSearchParams({
    query: "metadata['sanad_app']:'true' AND active:'true'",
    limit: "10",
  });
  const products = await stripeRequest<StripeList<StripeProduct>>(
    `/v1/products/search?${query.toString()}`,
  );
  const existing = products.data.find(
    (product) => product.metadata?.sanad_app === "true",
  );
  if (existing) return existing.id;

  const form = new URLSearchParams({
    name: "SANAD Guest Tip",
    description: "A guest tip sent through SANAD.",
    active: "true",
    "metadata[sanad_app]": "true",
  });
  const product = await stripeRequest<StripeProduct>("/v1/products", {
    method: "POST",
    form,
    idempotencyKey: "sanad-tip-product-v1",
  });
  return product.id;
}

async function findOrCreateTipPrice(
  productId: string,
  amountFils: number,
): Promise<StripePrice> {
  const lookupKey = `sanad_tip_kwd_${amountFils}`;
  const params = new URLSearchParams();
  params.append("lookup_keys[]", lookupKey);
  params.set("active", "true");
  params.set("limit", "1");

  const prices = await stripeRequest<StripeList<StripePrice>>(
    `/v1/prices?${params.toString()}`,
  );
  const existing = prices.data.find(
    (price) =>
      price.active &&
      price.currency.toLowerCase() === "kwd" &&
      price.unit_amount === amountFils &&
      price.lookup_key === lookupKey,
  );
  if (existing) return existing;

  const form = new URLSearchParams({
    product: productId,
    currency: "kwd",
    unit_amount: String(amountFils),
    lookup_key: lookupKey,
    "metadata[sanad_app]": "true",
    "metadata[amount_fils]": String(amountFils),
  });
  return stripeRequest<StripePrice>("/v1/prices", {
    method: "POST",
    form,
    idempotencyKey: `sanad-tip-price-${amountFils}-v1`,
  });
}

export async function createTipCheckoutSession(input: {
  tipId: string;
  workerId: string;
  workerSlug: string;
  workerName: string;
  amountFils: number;
}): Promise<StripeCheckoutSession> {
  const liveMode = await verifyStripeAccountCanAcceptTips();
  const productId = await findOrCreateTipProduct();
  const price = await findOrCreateTipPrice(productId, input.amountFils);
  const origin = publicAppOrigin();
  const successUrl = new URL("/tip-confirmation", origin);
  successUrl.searchParams.set("tipId", input.tipId);
  successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

  const cancelUrl = new URL(
    `/tip/${encodeURIComponent(input.workerSlug)}`,
    origin,
  );
  cancelUrl.searchParams.set("checkout", "cancelled");

  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": price.id,
    "line_items[0][quantity]": "1",
    "payment_method_types[0]": "card",
    client_reference_id: input.tipId,
    success_url: successUrl.toString(),
    cancel_url: cancelUrl.toString(),
    submit_type: "pay",
    "metadata[tip_id]": input.tipId,
    "metadata[worker_id]": input.workerId,
    "metadata[worker_slug]": input.workerSlug,
    "metadata[amount_fils]": String(input.amountFils),
    "payment_intent_data[description]": `SANAD tip for ${input.workerName}`,
    "payment_intent_data[metadata][tip_id]": input.tipId,
    "payment_intent_data[metadata][worker_id]": input.workerId,
    "payment_intent_data[metadata][worker_slug]": input.workerSlug,
  });

  const session = await stripeRequest<StripeCheckoutSession>(
    "/v1/checkout/sessions",
    {
      method: "POST",
      form,
      idempotencyKey: `sanad-tip-checkout-${input.tipId}`,
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
