export const DEFAULT_HOMEPAGE_DEAL_LABEL = "Brand new deals";

export const HOMEPAGE_DEAL_LABEL_GROUPS = [
  {
    name: "Everyday",
    options: [DEFAULT_HOMEPAGE_DEAL_LABEL]
  },
  {
    name: "Christian holidays",
    options: ["Christmas deals", "Easter deals"]
  },
  {
    name: "Muslim holidays",
    options: ["Ramadan offers", "Eid al-Fitr deals", "Eid al-Adha deals"]
  },
  {
    name: "Nigerian holidays",
    options: ["Independence Day deals", "Democracy Day deals", "Children's Day deals"]
  }
] as const;

export const HOMEPAGE_DEAL_LABEL_PRESETS = HOMEPAGE_DEAL_LABEL_GROUPS.flatMap(
  (group) => [...group.options]
);

export function isHomepageDealLabelPreset(value: string) {
  return HOMEPAGE_DEAL_LABEL_PRESETS.some((option) => option === value);
}

