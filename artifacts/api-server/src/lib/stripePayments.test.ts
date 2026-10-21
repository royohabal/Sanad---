import assert from "node:assert/strict";
import test from "node:test";
import {
  requireStripeTestSecretKey,
  StripePaymentError,
} from "./stripePayments";

test("accepts only a Stripe test-mode secret key", () => {
  assert.equal(
    requireStripeTestSecretKey("sk_test_SANAD_TEST_KEY"),
    "sk_test_SANAD_TEST_KEY",
  );
});

test("rejects missing Stripe credentials explicitly", () => {
  assert.throws(
    () => requireStripeTestSecretKey(undefined),
    (error: unknown) =>
      error instanceof StripePaymentError &&
      error.code === "test_credentials_missing",
  );
});

test("rejects live Stripe keys before making API requests", () => {
  assert.throws(
    () => requireStripeTestSecretKey("sk_live_NOT_USED"),
    (error: unknown) =>
      error instanceof StripePaymentError &&
      error.code === "live_mode_forbidden",
  );
});
