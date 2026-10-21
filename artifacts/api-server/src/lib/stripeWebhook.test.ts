import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  StripeWebhookError,
  stripeCheckoutEventStatus,
  verifyStripeWebhookSignature,
  type StripeWebhookEvent,
} from "./stripeWebhook";

const secret = "whsec_test_only";

function signedEvent(
  event: Record<string, unknown>,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const body = Buffer.from(JSON.stringify(event));
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest("hex");
  return {
    body,
    header: `t=${timestamp},v1=${signature}`,
    timestamp,
  };
}

function event(type: string, paymentStatus = "paid"): StripeWebhookEvent {
  return {
    id: "evt_test",
    type,
    livemode: false,
    data: {
      object: {
        id: "cs_test",
        object: "checkout.session",
        livemode: false,
        payment_status: paymentStatus,
      },
    },
  };
}

test("verifies Stripe's timestamped HMAC signature", () => {
  const now = Math.floor(Date.now() / 1000);
  const signed = signedEvent({
    id: "evt_test",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: { object: "checkout.session" } },
  }, now);

  const verified = verifyStripeWebhookSignature(
    signed.body,
    signed.header,
    secret,
    now,
  );
  assert.equal(verified.id, "evt_test");
});

test("rejects invalid, stale, and unsigned webhook requests", () => {
  const now = Math.floor(Date.now() / 1000);
  const signed = signedEvent({ id: "evt_test", type: "ignored", livemode: false, data: { object: {} } }, now);
  assert.throws(
    () => verifyStripeWebhookSignature(signed.body, "t=1,v1=bad", secret, now),
    (error: unknown) => error instanceof StripeWebhookError && error.code === "signature",
  );
  assert.throws(
    () => verifyStripeWebhookSignature(signed.body, signed.header, secret, now + 301),
    (error: unknown) => error instanceof StripeWebhookError && error.code === "signature",
  );
  assert.throws(
    () => verifyStripeWebhookSignature(signed.body, signed.header, "", now),
    (error: unknown) => error instanceof StripeWebhookError && error.code === "configuration",
  );
});

test("maps test-mode completed and async-success sessions to demo only", () => {
  assert.equal(stripeCheckoutEventStatus(event("checkout.session.completed")), "demo");
  assert.equal(
    stripeCheckoutEventStatus(event("checkout.session.async_payment_succeeded")),
    "demo",
  );
  assert.equal(
    stripeCheckoutEventStatus(event("checkout.session.completed", "unpaid")),
    null,
  );

  const liveEvent = { ...event("checkout.session.completed"), livemode: true };
  assert.equal(stripeCheckoutEventStatus(liveEvent), null);
});

test("maps failed and expired test-mode sessions without marking a tip paid", () => {
  assert.equal(
    stripeCheckoutEventStatus(event("checkout.session.async_payment_failed", "unpaid")),
    "failed",
  );
  assert.equal(stripeCheckoutEventStatus(event("checkout.session.expired", "unpaid")), "cancelled");
  assert.equal(stripeCheckoutEventStatus(event("customer.updated")), null);
});
