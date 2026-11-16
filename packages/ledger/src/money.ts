// Integer amounts (NFR-1): capacity in milli-CBM, money in micro-USDCx.
// Mirrors Summertime.Types and Summertime.Bonus in summertime-core; display only — the ledger
// recomputes every amount that matters.

export const MICRO = 1_000_000n;

export function toBig(v: string | number | bigint): bigint {
  return typeof v === "bigint" ? v : BigInt(v);
}

/** Micro-USDCx → "1,234.56" (two decimals, rounded down). */
export function formatUsdc(micro: string | number | bigint, decimals = 2): string {
  const m = toBig(micro);
  const neg = m < 0n;
  const abs = neg ? -m : m;
  const whole = abs / MICRO;
  const frac = abs % MICRO;
  const fracStr = frac.toString().padStart(6, "0").slice(0, decimals);
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${wholeStr}${decimals > 0 ? "." + fracStr : ""}`;
}

/** Milli-CBM → "4.000" CBM. */
export function formatCbm(milli: string | number | bigint, decimals = 3): string {
  const m = toBig(milli);
  const whole = m / 1000n;
  const frac = (m % 1000n).toString().padStart(3, "0").slice(0, decimals);
  return decimals > 0 ? `${whole}.${frac}` : whole.toString();
}

/** "4.000 CBM · 600.00 USDCx" (design rule: always both units). */
export function bothUnits(milliCbm: string | number | bigint, microUsdc: string | number | bigint): string {
  return `${formatCbm(milliCbm)} CBM · ${formatUsdc(microUsdc)} USDCx`;
}

/** Locked amount = reserved milli-CBM × rate (exact). */
export function lockedAmount(milliCbm: string | number | bigint, rate: string | number | bigint): bigint {
  return toBig(milliCbm) * toBig(rate);
}

/** Micro-units → token Decimal string with 10 places (Daml Numeric 10). Rejects unrepresentable amounts. */
export function toTokenDecimal(micro: string | number | bigint, tokenDecimals: number): string {
  const m = toBig(micro);
  if (m < 0n) throw new Error("Amount must not be negative");
  if (tokenDecimals < 6 && m % 10n ** BigInt(6 - tokenDecimals) !== 0n) {
    throw new Error(`Amount ${m} micro-units is not representable with ${tokenDecimals} decimals`);
  }
  const whole = m / MICRO;
  const frac = (m % MICRO).toString().padStart(6, "0");
  return `${whole}.${frac}0000`;
}

/** Token Decimal string → micro-units (truncating beyond 6 places). */
export function fromTokenDecimal(dec: string): bigint {
  const [w = "0", f = ""] = dec.split(".");
  return BigInt(w) * MICRO + BigInt((f + "000000").slice(0, 6));
}

/** Parse a user-entered "12.5" USDCx or CBM string into integer sub-units. */
export function parseUnits(input: string, scale: 3 | 6): bigint {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Not a number: ${input}`);
  const [w = "0", f = ""] = s.split(".");
  if (f.length > scale) throw new Error(`At most ${scale} decimal places`);
  return BigInt(w) * 10n ** BigInt(scale) + BigInt((f + "0".repeat(scale)).slice(0, scale));
}

/** Failure-bonus split, identical to Summertime.Bonus.computeBonuses (section 17.2). */
export function computeBonuses(pool: bigint, reservedMilliCbm: bigint[]): bigint[] {
  const n = BigInt(reservedMilliCbm.length);
  if (n === 0n) return [];
  const equal = pool / n;
  if (n < 3n) return reservedMilliCbm.map(() => equal);
  const total = reservedMilliCbm.reduce((a, b) => a + b, 0n);
  const cap = 3n * equal;
  return reservedMilliCbm.map((r) => {
    const b = (pool * r) / total;
    return b < cap ? b : cap;
  });
}
