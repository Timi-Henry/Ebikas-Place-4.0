"use client";

import { useEffect, useState } from "react";

type VisitCountResponse = {
  count?: unknown;
};

const visitNumberFormatter = new Intl.NumberFormat("en-NG");
let visitCountRequest: Promise<number> | null = null;

function validVisitCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function requestVisitCount() {
  visitCountRequest ??= fetch("/api/page-visits", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin"
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Visit counter request failed.");
      const payload = await response.json() as VisitCountResponse;
      if (!validVisitCount(payload.count)) throw new Error("Visit counter response was invalid.");
      return payload.count;
    })
    .catch((error) => {
      visitCountRequest = null;
      throw error;
    });

  return visitCountRequest;
}

export function PageVisitCounter() {
  const [count, setCount] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;

    void requestVisitCount()
      .then((nextCount) => {
        if (active) setCount(nextCount);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const formattedCount = count === null ? "—" : visitNumberFormatter.format(count);

  return (
    <section className="home-visit-counter section-frame reveal" aria-label="Total site visits">
      <span className="home-visit-label">Total site visits</span>
      <strong className="home-visit-total" aria-live="polite">{formattedCount}</strong>
      <span className="sr-only">
        {unavailable ? "Visit total temporarily unavailable" : count === null ? "Loading visit total" : "Recorded site visits"}
      </span>
    </section>
  );
}
