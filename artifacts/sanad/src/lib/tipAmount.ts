export const MIN_TIP_AMOUNT_FILS = 250;
export const MAX_TIP_AMOUNT_FILS = 100_000;

export function parseKwdAmount(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) return null;

  const [whole, fraction = ""] = normalized.split(".");
  const amount = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}
