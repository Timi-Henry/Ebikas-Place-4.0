"use client";

import { BadgeCheck, PackageCheck, Pause, Play, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

const highlights = [
  { icon: Sparkles, label: "New styles added regularly" },
  { icon: ShieldCheck, label: "Simple account-based shopping" },
  { icon: BadgeCheck, label: "Save pieces for later" },
  { icon: PackageCheck, label: "Track orders from your account" }
];

export function MarketTicker() {
  const [paused, setPaused] = useState(false);

  return (
    <section className={`market-ticker ${paused ? "market-ticker-paused" : ""}`} aria-label="Store highlights">
      <div className="market-ticker-track">
        {[...highlights, ...highlights].map((item, index) => (
          <span aria-hidden={index >= highlights.length ? "true" : undefined} key={`${item.label}-${index}`}>
            <item.icon size={14} /> {item.label}
          </span>
        ))}
      </div>
      <button
        aria-pressed={paused}
        className="market-ticker-pause"
        type="button"
        onClick={() => setPaused((current) => !current)}
      >
        {paused ? <Play size={15} /> : <Pause size={15} />}
        <span>{paused ? "Play ticker" : "Pause ticker"}</span>
      </button>
    </section>
  );
}
