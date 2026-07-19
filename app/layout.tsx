import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { CartProvider } from "@/components/cart-provider";
import { SkipLink } from "@/components/skip-link";
import { ThemeScript } from "@/components/theme-script";
import { getSiteUrl } from "@/lib/server/env";
import "./globals.css";
import "./storefront.css";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Ebika's Place | Lagos Fashion Store",
    template: "%s | Ebika's Place"
  },
  description: "Shop men's, women's, and kids' clothing, shoes, bags, and accessories from Ebika's Place. Delivery currently serves Lagos State, Nigeria.",
  applicationName: "Ebika's Place",
  openGraph: {
    title: "Ebika's Place",
    description: "A modern Lagos fashion store for clothing, shoes, bags, and accessories.",
    type: "website",
    locale: "en_NG",
    siteName: "Ebika's Place"
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          <ThemeScript />
        </head>
        <body>
          <SkipLink />
          <CartProvider>{children}</CartProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
