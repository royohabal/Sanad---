type ForwardedUrlHeaders = {
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  host?: string | null;
};

type PublicUrlEnvironment = Record<string, string | undefined>;

function firstHeaderValue(value?: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

export function getPublicAppOrigin(
  headers: ForwardedUrlHeaders,
  environment: PublicUrlEnvironment = process.env,
): string {
  const productionDomain =
    environment.VERCEL_ENV === "production"
      ? environment.VERCEL_PROJECT_PRODUCTION_URL?.trim()
      : undefined;

  if (productionDomain) {
    const productionUrl = new URL(
      productionDomain.includes("://")
        ? productionDomain
        : `https://${productionDomain}`,
    );
    if (
      productionUrl.protocol !== "https:" ||
      productionUrl.username ||
      productionUrl.password
    ) {
      throw new Error("Invalid Vercel production domain configuration.");
    }
    return productionUrl.origin;
  }

  const host =
    firstHeaderValue(headers.forwardedHost) ??
    firstHeaderValue(headers.host) ??
    "localhost";
  const protocol =
    firstHeaderValue(headers.forwardedProto) ??
    (host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}
