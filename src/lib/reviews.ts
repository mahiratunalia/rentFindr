// Asymmetric by role, per the proposal: a tenant rates the landlord on these
// three categories, a landlord rates the tenant on a different three. Shared
// between the API route (validation) and the client component (labels), so
// both sides can never drift apart.
export const LANDLORD_REVIEW_CATEGORIES = [
  { key: "responsiveness", label: "Responsiveness" },
  { key: "listingAccuracy", label: "Listing accuracy" },
  { key: "maintenanceQuality", label: "Maintenance quality" },
] as const;

export const TENANT_REVIEW_CATEGORIES = [
  { key: "paymentPunctuality", label: "Payment punctuality" },
  { key: "propertyCare", label: "Property care" },
  { key: "communication", label: "Communication" },
] as const;

export type LandlordCategoryKey = (typeof LANDLORD_REVIEW_CATEGORIES)[number]["key"];
export type TenantCategoryKey = (typeof TENANT_REVIEW_CATEGORIES)[number]["key"];
export type CategoryRatings = Record<LandlordCategoryKey | TenantCategoryKey, number>;

export function categoriesForRatee(rateeIsLandlord: boolean) {
  return rateeIsLandlord ? LANDLORD_REVIEW_CATEGORIES : TENANT_REVIEW_CATEGORIES;
}

export function overallFromCategories(categoryRatings: Record<string, number>): number {
  const values = Object.values(categoryRatings);
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}
