import { BadgeCheck, PackageCheck, ShieldCheck, Sparkles } from "lucide-react";

const highlights = [
  { icon: Sparkles, label: "New styles added regularly" },
  { icon: ShieldCheck, label: "Simple account-based shopping" },
  { icon: BadgeCheck, label: "Save pieces for later" },
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
