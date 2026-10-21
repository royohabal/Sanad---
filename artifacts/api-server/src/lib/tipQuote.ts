import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const TIP_RATE_SOURCE = "ExchangeRate-API";
export const TIP_RATE_SOURCE_URL = "https://www.exchangerate-api.com";
export const TIP_QUOTE_TTL_MS = 10 * 60 * 1000;

const RATE_ENDPOINT = "https://open.er-api.com/v6/latest/KWD";
const MAX_RATE_AGE_MS = 48 * 60 * 60 * 1000;

type ExchangeRateResponse = {
  result?: string;
  base_code?: string;
  time_last_update_unix?: number;
  time_next_update_unix?: number;
  rates?: { USD?: number };
};

export type KwdUsdRate = {
  rate: string;
  updatedAt: string;
  nextUpdateAt: number;
};

export type TipQuoteClaims = {
  version: 1;
  quoteId: string;
  workerId: string;
  workerSlug: string;
  amountFils: number;
  rating: number | null;
  usdAmountCents: number;
  kwdToUsdRate: string;
  rateSource: string;
  rateUpdatedAt: string;
  quotedAt: string;
  expiresAt: number;
};

export class TipQuoteError extends Error {
  constructor(
    message: string,
    readonly code: "rate_unavailable" | "quote_secret_missing" | "invalid_quote" | "expired_quote",
  ) {
    super(message);
    this.name = "TipQuoteError";
  }
}

let cachedRate: KwdUsdRate | null = null;

export function convertKwdFilsToUsdCents(
  amountFils: number,
  rateText: string,
): number {
  if (!Number.isSafeInteger(amountFils) || amountFils < 1) {
    throw new RangeError("Tip amount must be a positive whole number of fils");
  }

  const match = /^(\d+)(?:\.(\d+))?$/.exec(rateText);
  if (!match) throw new RangeError("Exchange rate must be a positive decimal");

  const fraction = match[2] ?? "";
  const rateNumerator = BigInt(`${match[1]}${fraction}`);
  const rateDenominator = 10n ** BigInt(fraction.length);
  if (rateNumerator <= 0n) throw new RangeError("Exchange rate must be positive");

  // KWD has 1,000 fils per dinar. Round half up to Stripe's integer USD cents.
  const numerator = BigInt(amountFils) * 100n * rateNumerator;
  const denominator = 1000n * rateDenominator;
  const roundedCents = (numerator + denominator / 2n) / denominator;
  const cents = Number(roundedCents);
  if (!Number.isSafeInteger(cents) || cents < 1) {
    throw new RangeError("Converted USD amount is outside the supported range");
  }
  return cents;
}

export async function getCurrentKwdUsdRate(
  now = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<KwdUsdRate> {
  if (cachedRate && now < cachedRate.nextUpdateAt) return cachedRate;

  let response: Response;
  try {
    response = await fetcher(RATE_ENDPOINT, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new TipQuoteError(
      "The exchange-rate service could not be reached",
      "rate_unavailable",
    );
  }

  if (!response.ok) {
    throw new TipQuoteError(
      "The exchange-rate service returned an error",
      "rate_unavailable",
    );
  }

  let payload: ExchangeRateResponse;
  try {
    payload = (await response.json()) as ExchangeRateResponse;
  } catch {
    throw new TipQuoteError(
      "The exchange-rate service returned invalid data",
      "rate_unavailable",
    );
  }

  const rate = payload.rates?.USD;
  const updatedAtSeconds = payload.time_last_update_unix;
  const nextUpdateSeconds = payload.time_next_update_unix;
  const nowSeconds = Math.floor(now / 1000);
  if (
    payload.result !== "success" ||
    payload.base_code !== "KWD" ||
    typeof rate !== "number" ||
    !Number.isFinite(rate) ||
    rate <= 0 ||
    typeof updatedAtSeconds !== "number" ||
    typeof nextUpdateSeconds !== "number" ||
    nextUpdateSeconds <= nowSeconds ||
    updatedAtSeconds * 1000 > now + 5 * 60 * 1000 ||
    now - updatedAtSeconds * 1000 > MAX_RATE_AGE_MS
  ) {
    throw new TipQuoteError(
      "The exchange-rate service returned a stale or unsupported KWD rate",
      "rate_unavailable",
    );
  }

  cachedRate = {
    rate: String(rate),
    updatedAt: new Date(updatedAtSeconds * 1000).toISOString(),
    nextUpdateAt: nextUpdateSeconds * 1000,
  };
  return cachedRate;
}

export function createTipQuoteToken(
  claims: Omit<TipQuoteClaims, "version" | "quoteId">,
  secret: string,
): { quoteId: string; quoteToken: string } {
  if (!secret) {
    throw new TipQuoteError(
      "Tip quote signing is not configured",
      "quote_secret_missing",
    );
  }
  const completeClaims: TipQuoteClaims = {
    ...claims,
    version: 1,
    quoteId: randomUUID(),
  };
  const encoded = Buffer.from(JSON.stringify(completeClaims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return { quoteId: completeClaims.quoteId, quoteToken: `${encoded}.${signature}` };
}

export function verifyTipQuoteToken(
  token: string,
  secret: string,
  now = Date.now(),
): TipQuoteClaims {
  if (!secret) {
    throw new TipQuoteError(
      "Tip quote signing is not configured",
      "quote_secret_missing",
    );
  }

  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) {
    throw new TipQuoteError("Invalid tip quote", "invalid_quote");
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new TipQuoteError("Invalid tip quote", "invalid_quote");
  }

  let claims: TipQuoteClaims;
  try {
    claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TipQuoteClaims;
  } catch {
    throw new TipQuoteError("Invalid tip quote", "invalid_quote");
  }

  if (
    claims.version !== 1 ||
    typeof claims.quoteId !== "string" ||
    typeof claims.workerId !== "string" ||
    typeof claims.workerSlug !== "string" ||
    !Number.isSafeInteger(claims.amountFils) ||
    !Number.isSafeInteger(claims.usdAmountCents) ||
    typeof claims.kwdToUsdRate !== "string" ||
    claims.rateSource !== TIP_RATE_SOURCE ||
    typeof claims.rateUpdatedAt !== "string" ||
    typeof claims.quotedAt !== "string" ||
    !Number.isSafeInteger(claims.expiresAt)
  ) {
    throw new TipQuoteError("Invalid tip quote", "invalid_quote");
  }

  if (claims.expiresAt <= now) {
    throw new TipQuoteError("Tip quote expired; request a new quote", "expired_quote");
  }
  return claims;
}
