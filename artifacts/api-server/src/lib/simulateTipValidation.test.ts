import assert from "node:assert/strict";
import test from "node:test";
import {
  CreateTipCheckoutBody,
  CreateTipQuoteBody,
  SimulateTipBody,
} from "@workspace/api-zod";

const validSimulation = {
  workerSlug: "ahmed-almutairi",
  amountFils: 250,
  rating: null,
  requestId: "5c61edc0-b9bd-40cc-84d4-116ee2a978a1",
};

test("simulation accepts only KWD 0.250–100.000 and optional integer ratings 1–5", () => {
  for (const amountFils of [250, 100_000]) {
    assert.equal(
      SimulateTipBody.safeParse({ ...validSimulation, amountFils }).success,
      true,
    );
  }
  for (const amountFils of [0, 249, -1, 100_001, 250.5, Infinity]) {
    assert.equal(
      SimulateTipBody.safeParse({ ...validSimulation, amountFils }).success,
      false,
      `Expected ${amountFils} fils to be rejected`,
    );
  }
  for (const rating of [null, 1, 5]) {
    assert.equal(
      SimulateTipBody.safeParse({ ...validSimulation, rating }).success,
      true,
    );
  }
  for (const rating of [0, 6, 2.5, "5"]) {
    assert.equal(
      SimulateTipBody.safeParse({ ...validSimulation, rating }).success,
      false,
    );
  }
});

test("real Stripe quote and checkout inputs share the same maximum amount", () => {
  const quote = { workerSlug: validSimulation.workerSlug, amountFils: 100_000, rating: null };
  assert.equal(CreateTipQuoteBody.safeParse(quote).success, true);
  assert.equal(CreateTipQuoteBody.safeParse({ ...quote, amountFils: 100_001 }).success, false);

  const checkout = {
    ...quote,
    quoteToken: "signed-test-quote",
    requestId: validSimulation.requestId,
  };
  assert.equal(CreateTipCheckoutBody.safeParse(checkout).success, true);
  assert.equal(CreateTipCheckoutBody.safeParse({ ...checkout, amountFils: 100_001 }).success, false);
});
