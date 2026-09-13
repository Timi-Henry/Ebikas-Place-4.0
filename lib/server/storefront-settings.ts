import "server-only";

import { DEFAULT_HOMEPAGE_DEAL_LABEL } from "@/lib/deal-labels";
import { getDb } from "@/lib/server/mongodb";

const homepageDealsSettingId = "homepage-deals";

type HomepageDealsSettingDocument = {
  _id: string;
  label: string;
  updatedAt: Date;
};

function normalizeStoredLabel(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_HOMEPAGE_DEAL_LABEL;
  }

  const label = value.trim();
  return label.length >= 2 && label.length <= 50
    ? label
    : DEFAULT_HOMEPAGE_DEAL_LABEL;
}

export async function getHomepageDealLabel() {
  try {
    const db = await getDb();
    const setting = await db
      .collection<HomepageDealsSettingDocument>("storefront_settings")
      .findOne({ _id: homepageDealsSettingId });
    return normalizeStoredLabel(setting?.label);
  } catch {
    return DEFAULT_HOMEPAGE_DEAL_LABEL;
  }
}

export async function updateHomepageDealLabel(value: string) {
  const label = normalizeStoredLabel(value);
  const db = await getDb();
  await db
    .collection<HomepageDealsSettingDocument>("storefront_settings")
    .updateOne(
      { _id: homepageDealsSettingId },
      { $set: { label, updatedAt: new Date() } },
      { upsert: true }
    );
  return label;
}

