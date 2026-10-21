import assert from "node:assert/strict";
import test from "node:test";
import {
  convertKwdFilsToUsdCents,
  createTipQuoteToken,
  TipQuoteError,
  verifyTipQuoteToken,
} from "./tipQuote";

test("converts KWD fils into USD cents with half-up rounding", () => {
  assert.equal(convertKwdFilsToUsdCents(1000, "3.229447"), 323);
  assert.equal(convertKwdFilsToUsdCents(250, "3.229447"), 81);
  assert.equal(convertKwdFilsToUsdCents(1, "5"), 1);
});

test("rejects invalid amounts and malformed rates", () => {
  assert.throws(() => convertKwdFilsToUsdCents(0, "3.2"), RangeError);
  assert.throws(() => convertKwdFilsToUsdCents(1000, "3e2"), RangeError);
  assert.throws(() => convertKwdFilsToUsdCents(1000, "0"), RangeError);
});

test("signs and verifies a quote bound to worker, amount, rating, and expiry", () => {
  const now = Date.now();
  const { quoteToken } = createTipQuoteToken(
    {
      workerId: "worker-1",
      workerSlug: "worker-one",
      amountFils: 1000,
      rating: 5,
      usdAmountCents: 323,
      kwdToUsdRate: "3.229447",
      rateSource: "ExchangeRate-API",
      rateUpdatedAt: new Date(now - 1000).toISOString(),
      quotedAt: new Date(now).toISOString(),
      expiresAt: now + 60_000,
    },
    "unit-test-secret",
  );

  const verified = verifyTipQuoteToken(quoteToken, "unit-test-secret", now);
  assert.equal(verified.workerId, "worker-1");
  assert.equal(verified.amountFils, 1000);
  assert.equal(verified.usdAmountCents, 323);
  assert.equal(verified.rating, 5);
});

test("rejects tampered and expired quotes", () => {
  const now = Date.now();
  const { quoteToken } = createTipQuoteToken(
    {
      workerId: "worker-1",
      workerSlug: "worker-one",
      amountFils: 1000,
      rating: null,
      usdAmountCents: 323,
      kwdToUsdRate: "3.229447",
      rateSource: "ExchangeRate-API",
      rateUpdatedAt: new Date(now - 1000).toISOString(),
      quotedAt: new Date(now).toISOString(),
      expiresAt: now + 1000,
    },
    "unit-test-secret",
  );

  const last = quoteToken.at(-1);
  const tampered = `${quoteToken.slice(0, -1)}${last === "A" ? "B" : "A"}`;
  assert.throws(
    () => verifyTipQuoteToken(tampered, "unit-test-secret", now),
    (error: unknown) => error instanceof TipQuoteError && error.code === "invalid_quote",
  );
  assert.throws(
    () => verifyTipQuoteToken(quoteToken, "unit-test-secret", now + 1000),
    (error: unknown) => error instanceof TipQuoteError && error.code === "expired_quote",
  );
});
