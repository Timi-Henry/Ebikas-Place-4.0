type CanonicalSiteEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
};

function parseConfiguredOrigin(value: string | undefined, addHttps: boolean) {
  if (!value) return null;

  try {
    const candidate = addHttps && !/^https?:\/\//i.test(value) ? `https://${value}` : value;
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getCanonicalSiteOrigin(environment: CanonicalSiteEnvironment = process.env) {
  return (
    parseConfiguredOrigin(environment.NEXT_PUBLIC_SITE_URL, false) ||
    parseConfiguredOrigin(environment.VERCEL_PROJECT_PRODUCTION_URL, true)
  );
}

/**
 * Keeps browser navigation on the canonical production host so authenticated
 * mutations cannot originate from a Vercel preview or immutable deployment URL.
 * API requests stay unredirected and continue to fail the strict origin check.
 */
export function getCanonicalPageRedirect(
  requestUrl: string,
  method: string,
  environment: CanonicalSiteEnvironment = process.env
) {
  if (environment.NODE_ENV !== "production") return null;
  if (method !== "GET" && method !== "HEAD") return null;

  const request = new URL(requestUrl);
  if (request.pathname === "/api" || request.pathname.startsWith("/api/")) return null;

  const canonicalOrigin = getCanonicalSiteOrigin(environment);
  if (!canonicalOrigin || request.origin === canonicalOrigin) return null;

  return new URL(`${request.pathname}${request.search}`, canonicalOrigin);
}
