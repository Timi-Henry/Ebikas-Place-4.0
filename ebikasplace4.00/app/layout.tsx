import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeScript } from "@/components/theme-script";
import "./globals.css";
import "./storefront.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ebikas-place.example.com";

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
          <a className="skip-link" href="#main-content">Skip to main content</a>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
