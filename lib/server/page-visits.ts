import "server-only";

import { getDb } from "@/lib/server/mongodb";

type SiteCounterDocument = {
  _id: "homepage";
  count: number;
  createdAt: Date;
  updatedAt: Date;
};

const HOMEPAGE_COUNTER_ID = "homepage" as const;

export async function incrementHomepageVisitCount() {
  const db = await getDb();
  const counters = db.collection<SiteCounterDocument>("site_counters");

  const now = new Date();
  const counter = await counters.findOneAndUpdate(
    { _id: HOMEPAGE_COUNTER_ID },
    {
      $inc: { count: 1 },
      $set: { updatedAt: now },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true, returnDocument: "after" }
  );

  return counter?.count ?? 1;
}
