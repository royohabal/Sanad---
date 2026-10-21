import { createHmac, timingSafeEqual } from "node:crypto";
import { getTipById, updateTip } from "./mongoStore";

type StripeCheckoutSessionEventData = {
  id?: string;
  object?: string;
  status?: string | null;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  livemode?: boolean;
  client_reference_id?: string | null;
  metadata?: Record<string, string>;
  payment_intent?: string | { id: string } | null;
};

export type StripeWebhookEvent = {
  id: string;
  type: string;
  livemode: boolean;
  data: { object: StripeCheckoutSessionEventData };
};

export class StripeWebhookError extends Error {
  constructor(
    message: string,
    readonly code: "configuration" | "signature" | "payload",
  ) {
    super(message);
    this.name = "StripeWebhookError";
  }
}

export function verifyStripeWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): StripeWebhookEvent {
  if (!secret) {
    throw new StripeWebhookError(
      "Stripe webhook signing secret is not configured",
      "configuration",
    );
  }
  if (!signatureHeader) {
    throw new StripeWebhookError("Missing Stripe signature", "signature");
  }

  const parts = signatureHeader.split(",").map((part) => part.split("=", 2));
  const timestampText = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts
    .filter(([key]) => key === "v1")
    .map(([, value]) => value)
    .filter((value): value is string => typeof value === "string");
  const timestamp = Number(timestampText);

  if (
    !Number.isSafeInteger(timestamp) ||
    signatures.length === 0 ||
    Math.abs(nowSeconds - timestamp) > 300
  ) {
    throw new StripeWebhookError("Invalid Stripe signature", "signature");
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  const signatureMatches = signatures.some((signature) => {
    const supplied = Buffer.from(signature, "hex");
    return (
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected)
    );
  });
  if (!signatureMatches) {
    throw new StripeWebhookError("Invalid Stripe signature", "signature");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new StripeWebhookError("Invalid Stripe webhook payload", "payload");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("id" in parsed) ||
    typeof parsed.id !== "string" ||
    !("type" in parsed) ||
    typeof parsed.type !== "string" ||
    !("livemode" in parsed) ||
    typeof parsed.livemode !== "boolean" ||
    !("data" in parsed) ||
    !parsed.data ||
    typeof parsed.data !== "object" ||
    !("object" in parsed.data) ||
    !parsed.data.object ||
    typeof parsed.data.object !== "object"
  ) {
    throw new StripeWebhookError("Invalid Stripe webhook payload", "payload");
  }

  return parsed as StripeWebhookEvent;
}

export function stripeCheckoutEventStatus(
  event: StripeWebhookEvent,
): "demo" | "failed" | "cancelled" | null {
  if (event.livemode || event.data.object.livemode !== false) return null;

  if (
    (event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded") &&
    event.data.object.payment_status === "paid"
  ) {
    return "demo";
  }
  if (event.type === "checkout.session.async_payment_failed") return "failed";
  if (event.type === "checkout.session.expired") return "cancelled";
  return null;
}

function paymentIntentId(
  paymentIntent: StripeCheckoutSessionEventData["payment_intent"],
): string | null {
  if (typeof paymentIntent === "string") return paymentIntent;
  return paymentIntent?.id ?? null;
}

export async function processStripeWebhookEvent(
  event: StripeWebhookEvent,
): Promise<"processed" | "ignored"> {
  const status = stripeCheckoutEventStatus(event);
  if (!status) return "ignored";

  const session = event.data.object;
  const tipId = session.metadata?.tip_id;
  if (
    !tipId ||
    session.object !== "checkout.session" ||
    typeof session.id !== "string"
  ) {
    return "ignored";
  }

  const tip = await getTipById(tipId);
  if (!tip) return "ignored";

  const metadataMatches =
    session.metadata?.worker_id === tip.workerId &&
    session.metadata?.kwd_amount_fils === String(tip.amountFils) &&
    session.metadata?.usd_amount_cents === String(tip.usdAmountCents) &&
    session.metadata?.kwd_to_usd_rate === tip.kwdToUsdRate &&
    session.metadata?.rate_source === tip.rateSource &&
    session.metadata?.checkout_quote_id === tip.checkoutQuoteId &&
    session.metadata?.rate_updated_at ===
      String(Math.floor((tip.rateUpdatedAt?.getTime() ?? 0) / 1000));
  const sessionMatches =
    session.id === tip.stripeCheckoutSessionId &&
    session.client_reference_id === tip.id &&
    session.amount_total === tip.usdAmountCents &&
    session.currency?.toLowerCase() === "usd" &&
    metadataMatches;

  if (!sessionMatches || tip.status !== "pending") return "ignored";

  const updated = await updateTip(
    tip.id,
    {
      status,
      isDemo: true,
      stripePaymentIntentId: paymentIntentId(session.payment_intent),
    },
    { status: "pending", stripeCheckoutSessionId: session.id },
  );
  return updated ? "processed" : "ignored";
}

export async function handleStripeWebhook(
  rawBody: Buffer,
  signatureHeader: string,
): Promise<"processed" | "ignored"> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const event = verifyStripeWebhookSignature(rawBody, signatureHeader, secret ?? "");
  return processStripeWebhookEvent(event);
}
