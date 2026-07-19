import { describe, expect, it } from "vitest";
import { getCanonicalPageRedirect, getCanonicalSiteOrigin } from "@/lib/canonical-site";

const production = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "https://shop.example",
  VERCEL_PROJECT_PRODUCTION_URL: "fallback.vercel.app"
} as const;

describe("canonical site navigation", () => {
  it("prefers the configured public origin over Vercel's fallback domain", () => {
    expect(getCanonicalSiteOrigin(production)).toBe("https://shop.example");
  });

  it("redirects noncanonical production pages while preserving path and query", () => {
    expect(
      getCanonicalPageRedirect(
        "https://immutable-deployment.vercel.app/products/123?size=m",
        "GET",
        production
      )?.href
    ).toBe("https://shop.example/products/123?size=m");
  });

  it("does not redirect canonical pages, mutations, APIs, or local development", () => {
    expect(getCanonicalPageRedirect("https://shop.example/cart", "GET", production)).toBeNull();
    expect(getCanonicalPageRedirect("https://preview.example/cart", "POST", production)).toBeNull();
    expect(getCanonicalPageRedirect("https://preview.example/api/orders", "GET", production)).toBeNull();
    expect(
      getCanonicalPageRedirect("https://preview.example/cart", "GET", {
        ...production,
        NODE_ENV: "development"
      })
    ).toBeNull();
  });
});
