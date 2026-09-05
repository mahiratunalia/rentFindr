// Personalized Listing Match Score — tenant-to-listing, distinct from the
// tenant-to-tenant compatibility() in data/module1.ts but styled identically:
// each dimension normalizes to a 0-1 "fit" value, weights sum to 100,
// total = round(Σ weight*value), and a deal-breaker match hard-zeroes the
// result (same shape as RoommateProfile's smoking hard-block).

export type MatchPreference = {
  budgetCeiling: number;
  commuteAnchorLat: number;
  commuteAnchorLng: number;
  roomType: string;
  hasPets: boolean;
  smokes: boolean;
  frequentVisitors: boolean;
};

export type MatchableListing = {
  rent: number;
  roomType: string;
  latitude: number;
  longitude: number;
  description: string | null;
  houseRules: string[];
};

export type MatchResult = {
  total: number;
  parts: { label: string; weight: number; value: number; detail: string }[];
  hardBlocked: boolean;
  blockReason: string | null;
  commuteKm: number;
};

/** Great-circle distance in km — no distance-between-coordinates helper existed anywhere in the codebase before this. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DEAL_BREAKER_KEYWORDS: Record<"hasPets" | "smokes" | "frequentVisitors", string[]> = {
  hasPets: ["no pet", "pets not allowed", "no animals"],
  smokes: ["no smoking", "non-smoking", "smoking not allowed", "smoke-free"],
  frequentVisitors: ["no visitors", "no guests", "visitors not allowed", "guests not allowed"],
};

function findDealBreaker(pref: MatchPreference, listing: MatchableListing): string | null {
  const text = `${listing.description ?? ""} ${listing.houseRules.join(" ")}`.toLowerCase();
  const traits: { key: keyof typeof DEAL_BREAKER_KEYWORDS; has: boolean; label: string }[] = [
    {
      key: "hasPets",
      has: pref.hasPets,
      label: "you have pets, but this listing doesn't allow pets",
    },
    { key: "smokes", has: pref.smokes, label: "you smoke, but this listing is non-smoking" },
    {
      key: "frequentVisitors",
      has: pref.frequentVisitors,
      label: "you have frequent visitors, but this listing doesn't allow visitors",
    },
  ];
  for (const t of traits) {
    if (!t.has) continue;
    if (DEAL_BREAKER_KEYWORDS[t.key].some((kw) => text.includes(kw))) {
      return t.label;
    }
  }
  return null;
}

export function matchScore(pref: MatchPreference, listing: MatchableListing): MatchResult {
  const blockReason = findDealBreaker(pref, listing);

  const budgetFit =
    listing.rent <= pref.budgetCeiling
      ? 1
      : Math.max(0, 1 - (listing.rent - pref.budgetCeiling) / pref.budgetCeiling);

  const commuteKm = haversineKm(
    pref.commuteAnchorLat,
    pref.commuteAnchorLng,
    listing.latitude,
    listing.longitude,
  );
  const MAX_COMMUTE_KM = 15;
  const commuteFit = Math.max(0, 1 - commuteKm / MAX_COMMUTE_KM);

  const roomTypeFit = listing.roomType === pref.roomType ? 1 : 0.2;

  const parts = [
    {
      label: "Budget fit",
      weight: 40,
      value: budgetFit,
      detail:
        listing.rent <= pref.budgetCeiling
          ? `৳${listing.rent.toLocaleString("en-BD")} is within your ৳${pref.budgetCeiling.toLocaleString("en-BD")} ceiling`
          : `৳${listing.rent.toLocaleString("en-BD")} is over your ৳${pref.budgetCeiling.toLocaleString("en-BD")} ceiling`,
    },
    {
      label: "Commute distance",
      weight: 35,
      value: commuteFit,
      detail: `${commuteKm.toFixed(1)} km from your commute anchor`,
    },
    {
      label: "Room type match",
      weight: 25,
      value: roomTypeFit,
      detail:
        listing.roomType === pref.roomType
          ? `${listing.roomType} matches what you're looking for`
          : `${listing.roomType}, not your preferred ${pref.roomType}`,
    },
  ];

  const total = Math.round(parts.reduce((s, p) => s + p.weight * p.value, 0));

  return {
    total: blockReason ? 0 : total,
    parts,
    hardBlocked: !!blockReason,
    blockReason,
    commuteKm,
  };
}
