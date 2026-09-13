import { BadgeCheck, PackageCheck, ShieldCheck, Sparkles } from "lucide-react";

const highlights = [
  { icon: Sparkles, label: "New arrivals now available" },
  { icon: ShieldCheck, label: "Secure shopping with your account" },
  { icon: BadgeCheck, label: "Save products for later" },
  { icon: PackageCheck, label: "Track orders from your account" }
];

export function MarketTicker() {
  return (
    <section className="market-ticker" aria-label="Store highlights" tabIndex={0}>
      <div className="market-ticker-track">
        {[...highlights, ...highlights].map((item, index) => (
          <span aria-hidden={index >= highlights.length ? "true" : undefined} key={`${item.label}-${index}`}>
            <item.icon size={14} /> {item.label}
          </span>
        ))}
      </div>
    </section>
  );
}
