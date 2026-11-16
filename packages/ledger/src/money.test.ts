import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBonuses, formatUsdc, formatCbm, toTokenDecimal, fromTokenDecimal, parseUnits, lockedAmount, bothUnits } from "./money.ts";

test("bonus split matches specification 17.6 and the Daml implementation", () => {
  const b = computeBonuses(200_000_000n, [14000n, 12000n, 11000n, 9000n, 8000n]);
  assert.deepEqual(b, [51851851n, 44444444n, 40740740n, 33333333n, 29629629n]);
  assert.equal(200_000_000n - b.reduce((a, x) => a + x, 0n), 3n);
});

test("equal split below three eligible importers; empty set", () => {
  assert.deepEqual(computeBonuses(200_000_000n, [50000n, 1000n]), [100_000_000n, 100_000_000n]);
  assert.deepEqual(computeBonuses(200n, []), []);
});

test("cap of three equal shares", () => {
  assert.deepEqual(computeBonuses(300n, [1_000_000n, 1n, 1n, 1n]), [225n, 0n, 0n, 0n]);
});

test("formatting always shows both units", () => {
  assert.equal(formatUsdc(2_100_000_000n), "2,100.00");
  assert.equal(formatUsdc("51851851", 6), "51.851851");
  assert.equal(formatCbm(4000), "4.000");
  assert.equal(bothUnits(4000, lockedAmount(4000, 150000)), "4.000 CBM · 600.00 USDCx");
});

test("token decimal conversion is exact or rejected", () => {
  assert.equal(toTokenDecimal(2_100_000_000n, 6), "2100.0000000000");
  assert.equal(fromTokenDecimal("2100.0000000000"), 2_100_000_000n);
  assert.throws(() => toTokenDecimal(1_234_567n, 2));
  assert.equal(toTokenDecimal(1_230_000n, 2), "1.2300000000");
});

test("parse user input", () => {
  assert.equal(parseUnits("4.5", 3), 4500n);
  assert.equal(parseUnits("150", 6), 150_000_000n);
  assert.throws(() => parseUnits("1.2345", 3));
  assert.throws(() => parseUnits("abc", 3));
});
