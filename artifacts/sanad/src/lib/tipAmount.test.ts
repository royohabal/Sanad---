import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TIP_AMOUNT_FILS,
  MIN_TIP_AMOUNT_FILS,
  parseKwdAmount,
} from "./tipAmount";

test("parses KWD to fils without floating-point rounding", () => {
  assert.equal(parseKwdAmount("0.250"), 250);
  assert.equal(parseKwdAmount("1"), 1_000);
  assert.equal(parseKwdAmount("1.2"), 1_200);
  assert.equal(parseKwdAmount("99.999"), 99_999);
  assert.equal(parseKwdAmount("100.000"), MAX_TIP_AMOUNT_FILS);
});

test("rejects malformed KWD amounts and amounts outside supported limits", () => {
  for (const value of ["", "0", "0.249", "-1", "1.0001", "1e3", "Infinity", "abc"]) {
    const amount = parseKwdAmount(value);
    assert.ok(
      amount === null || amount < MIN_TIP_AMOUNT_FILS || amount > MAX_TIP_AMOUNT_FILS,
      `Expected ${JSON.stringify(value)} to be invalid`,
    );
  }
  assert.equal(parseKwdAmount("100.001"), 100_001);
  assert.ok(parseKwdAmount("100.001")! > MAX_TIP_AMOUNT_FILS);
});
