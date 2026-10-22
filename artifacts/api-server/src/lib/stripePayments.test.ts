import assert from "node:assert/strict";
import test from "node:test";
import {
  isStripeCheckoutEnabled,
  requireStripeTestSecretKey,
  StripePaymentError,
} from "./stripePayments";

test("keeps Stripe checkout enabled in development", () => {
  assert.equal(isStripeCheckoutEnabled("development"), true);
});

test("keeps Stripe checkout disabled in production by default", () => {
  assert.equal(isStripeCheckoutEnabled("production", "", ""), false);
});

test("enables production demo checkout only with an explicit flag and test key", () => {
  assert.equal(
    isStripeCheckoutEnabled("production", "true", "sk_test_DEMO_KEY"),
    true,
  );
  assert.equal(
    isStripeCheckoutEnabled("production", "true", "sk_live_NOT_ALLOWED"),
    false,
  );
  assert.equal(
    isStripeCheckoutEnabled("production", "true", ""),
    false,
  );
  assert.equal(
    isStripeCheckoutEnabled("production", "false", "sk_test_DEMO_KEY"),
    false,
  );
});

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
