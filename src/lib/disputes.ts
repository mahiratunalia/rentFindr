// Shared between every page that renders a dispute type label — previously
// hand-copied into admin/page.tsx, disputes/page.tsx, and
// disputes/[disputeId]/page.tsx separately, so a new DisputeType enum value
// silently fell back to the raw string in whichever view got missed.
export const DISPUTE_TYPE_LABEL: Record<string, string> = {
  unlawful_eviction: "Unlawful eviction",
  unpaid_deposit: "Unpaid deposit",
  property_damage: "Property damage",
  other: "Other",
};
