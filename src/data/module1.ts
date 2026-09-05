import listing1 from "@/assets/listing-1.jpg";
import listing2 from "@/assets/listing-2.jpg";
import listing3 from "@/assets/listing-3.jpg";
import type { StaticImageData } from "next/image";

export type RoomType = "Single room" | "Shared mess" | "Studio" | "Full flat";

export type TrustBreakdown = {
  payment: number;
  maintenance: number;
  disputes: number;
  verification: number;
  reviews: number;
  agreements: number;
};

export const TRUST_WEIGHTS: {
  key: keyof TrustBreakdown;
  label: string;
  weight: number;
  measures: string;
}[] = [
  {
    key: "payment",
    label: "Payment history",
    weight: 0.25,
    measures: "Receipt confirmation & deposit-return timeliness",
  },
  {
    key: "maintenance",
    label: "Maintenance response",
    weight: 0.2,
    measures: "Average request resolution time",
  },
  {
    key: "disputes",
    label: "Dispute outcomes",
    weight: 0.2,
    measures: "Share resolved in favour or no fault found",
  },
  {
    key: "verification",
    label: "Profile verification",
    weight: 0.15,
    measures: "NID, ownership proof and phone verified",
  },
  { key: "reviews", label: "Review rating", weight: 0.1, measures: "Average of category ratings" },
  {
    key: "agreements",
    label: "Agreement completion",
    weight: 0.1,
    measures: "Leases completed on original terms",
  },
];

export function trustScore(b: TrustBreakdown): number {
  return Math.round(TRUST_WEIGHTS.reduce((sum, w) => sum + b[w.key] * w.weight, 0));
}

export type Landlord = {
  id: string;
  name: string;
  verified: boolean;
  verifiedSince: string;
  responseRate: number;
  avgResponseHours: number;
  completedRentals: number;
  trust: TrustBreakdown;
};

export const landlordsById: Record<string, Landlord> = {
  "ll-1": {
    id: "ll-1",
    name: "mahiya",
    verified: true,
    verifiedSince: "Mar 2024",
    responseRate: 96,
    avgResponseHours: 4,
    completedRentals: 11,
    trust: {
      payment: 94,
      maintenance: 90,
      disputes: 88,
      verification: 100,
      reviews: 86,
      agreements: 92,
    },
  },
  "ll-2": {
    id: "ll-2",
    name: "zisan",
    verified: true,
    verifiedSince: "Sep 2024",
    responseRate: 81,
    avgResponseHours: 19,
    completedRentals: 4,
    trust: {
      payment: 78,
      maintenance: 66,
      disputes: 80,
      verification: 100,
      reviews: 72,
      agreements: 70,
    },
  },
  "ll-3": {
    id: "ll-3",
    name: "navid",
    verified: true,
    verifiedSince: "Jan 2025",
    responseRate: 88,
    avgResponseHours: 9,
    completedRentals: 7,
    trust: {
      payment: 85,
      maintenance: 74,
      disputes: 62,
      verification: 100,
      reviews: 80,
      agreements: 84,
    },
  },
};

export type Listing = {
  id: string;
  title: string;
  area: string;
  city: string;
  coords: { lat: number; lng: number };
  landmarks: string[];
  rent: number;
  deposit: number;
  roomType: RoomType;
  availableFrom: string;
  houseRules: string[];
  photo: StaticImageData;
  photoAlt: string;
  landlordId: string;
  status: "Active" | "Draft" | "Rented";
  applicants: number;
  postedOn: string;
};

export const listings: Listing[] = [
  {
    id: "bk-1041",
    title: "Sunlit single room, quiet lane off Bailey Road",
    area: "Shantinagar",
    city: "Dhaka",
    coords: { lat: 23.7423, lng: 90.4098 },
    landmarks: [
      "Bailey Road — 400 m",
      "Shantinagar bus stop — 260 m",
      "Ibn Sina Diagnostic — 700 m",
    ],
    rent: 9500,
    deposit: 19000,
    roomType: "Single room",
    availableFrom: "2026-09-01",
    houseRules: ["No smoking indoors", "Guests until 10 pm", "Rent due by the 5th"],
    photo: listing1,
    photoAlt: "Single room with a bed, wooden desk and a large window",
    landlordId: "ll-1",
    status: "Active",
    applicants: 4,
    postedOn: "2026-07-18",
  },
  {
    id: "bk-1042",
    title: "Two-seat mess room with balcony, student block",
    area: "Mohammadpur",
    city: "Dhaka",
    coords: { lat: 23.7639, lng: 90.3589 },
    landmarks: [
      "Town Hall Market — 550 m",
      "Mohammadpur Bus Stand — 900 m",
      "Sir Syed Road — 300 m",
    ],
    rent: 6200,
    deposit: 6200,
    roomType: "Shared mess",
    availableFrom: "2026-08-15",
    houseRules: ["Shared kitchen roster", "No overnight guests", "Quiet hours after 11 pm"],
    photo: listing2,
    photoAlt: "Shared mess room with two single beds and a balcony door",
    landlordId: "ll-2",
    status: "Active",
    applicants: 6,
    postedOn: "2026-07-22",
  },
  {
    id: "bk-1043",
    title: "Compact studio with kitchenette, rooftop access",
    area: "Uttara Sector 7",
    city: "Dhaka",
    coords: { lat: 23.8687, lng: 90.3987 },
    landmarks: ["Uttara Centre metro — 1.1 km", "Rabindra Sarani — 450 m", "Sector 7 Park — 200 m"],
    rent: 14000,
    deposit: 28000,
    roomType: "Studio",
    availableFrom: "2026-08-01",
    houseRules: ["No subletting", "Utility bills separate", "One-month notice to vacate"],
    photo: listing3,
    photoAlt: "Studio flat with kitchenette, concrete walls and rattan chair",
    landlordId: "ll-3",
    status: "Active",
    applicants: 3,
    postedOn: "2026-07-05",
  },
];

export type Applicant = {
  id: string;
  name: string;
  occupation: string;
  listingId: string;
  appliedOn: string;
  nidVerified: boolean;
  phoneVerified: boolean;
  onTimePaymentRate: number;
  disputes: number;
  trust: TrustBreakdown;
  note: string;
  budget: number;
  sleep: "Early" | "Flexible" | "Late";
  smoking: "No" | "Tolerant" | "Yes";
  smokingNonNegotiable: boolean;
  cooking: "Rarely" | "Occasionally" | "Daily";
  study: "Quiet" | "Mixed" | "Social";
  visitors: "Rare" | "Occasional" | "Frequent";
};

export const applicants: Applicant[] = [
  // bk-1041 applicants (mahiya)
  {
    id: "ap-1",
    name: "Tanzila Rahman",
    occupation: "Final-year student, BRAC University",
    listingId: "bk-1041",
    appliedOn: "2026-07-29",
    nidVerified: true,
    phoneVerified: true,
    onTimePaymentRate: 97,
    disputes: 0,
    trust: {
      payment: 97,
      maintenance: 88,
      disputes: 100,
      verification: 100,
      reviews: 90,
      agreements: 95,
    },
    note: "Two prior tenancies completed on original terms.",
    budget: 9500,
    sleep: "Early",
    smoking: "No",
    smokingNonNegotiable: true,
    cooking: "Occasionally",
    study: "Quiet",
    visitors: "Rare",
  },
  {
    id: "ap-2",
    name: "Sabbir Ahmed",
    occupation: "Junior developer, Banani",
    listingId: "bk-1041",
    appliedOn: "2026-07-24",
    nidVerified: true,
    phoneVerified: true,
    onTimePaymentRate: 84,
    disputes: 1,
    trust: {
      payment: 84,
      maintenance: 70,
      disputes: 65,
      verification: 100,
      reviews: 76,
      agreements: 80,
    },
    note: "One deposit dispute, resolved with no fault found.",
    budget: 10000,
    sleep: "Late",
    smoking: "Tolerant",
    smokingNonNegotiable: false,
    cooking: "Rarely",
    study: "Mixed",
    visitors: "Occasional",
  },
  {
    id: "ap-3",
    name: "Nusrat Jahan",
    occupation: "NGO field officer",
    listingId: "bk-1041",
    appliedOn: "2026-07-21",
    nidVerified: true,
    phoneVerified: false,
    onTimePaymentRate: 91,
    disputes: 0,
    trust: {
      payment: 91,
      maintenance: 82,
      disputes: 100,
      verification: 65,
      reviews: 84,
      agreements: 88,
    },
    note: "Phone verification pending since 21 July.",
    budget: 9000,
    sleep: "Early",
    smoking: "No",
    smokingNonNegotiable: false,
    cooking: "Daily",
    study: "Quiet",
    visitors: "Rare",
  },
  {
    id: "ap-4",
    name: "Imran Chowdhury",
    occupation: "Sales executive",
    listingId: "bk-1041",
    appliedOn: "2026-07-19",
    nidVerified: false,
    phoneVerified: true,
    onTimePaymentRate: 62,
    disputes: 2,
    trust: {
      payment: 62,
      maintenance: 55,
      disputes: 40,
      verification: 35,
      reviews: 58,
      agreements: 50,
    },
    note: "First-come applicant — ranked last on record, not on timing.",
    budget: 11000,
    sleep: "Late",
    smoking: "Yes",
    smokingNonNegotiable: false,
    cooking: "Rarely",
    study: "Social",
    visitors: "Frequent",
  },
  // bk-1042 applicants (zisan)
  {
    id: "ap-5",
    name: "Mehedi Hasan",
    occupation: "Undergraduate, Dhaka College",
    listingId: "bk-1042",
    appliedOn: "2026-07-28",
    nidVerified: true,
    phoneVerified: true,
    onTimePaymentRate: 100,
    disputes: 0,
    trust: {
      payment: 100,
      maintenance: 92,
      disputes: 100,
      verification: 100,
      reviews: 94,
      agreements: 98,
    },
    note: "First tenancy — no prior record, but fully verified.",
    budget: 6000,
    sleep: "Early",
    smoking: "No",
    smokingNonNegotiable: true,
    cooking: "Occasionally",
    study: "Quiet",
    visitors: "Rare",
  },
  {
    id: "ap-6",
    name: "Raihan Uddin",
    occupation: "Garments QC officer",
    listingId: "bk-1042",
    appliedOn: "2026-07-25",
    nidVerified: true,
    phoneVerified: true,
    onTimePaymentRate: 88,
    disputes: 1,
    trust: {
      payment: 88,
      maintenance: 75,
      disputes: 60,
      verification: 100,
      reviews: 80,
      agreements: 82,
    },
    note: "One minor dispute resolved in tenant's favour.",
    budget: 6500,
    sleep: "Flexible",
    smoking: "Tolerant",
    smokingNonNegotiable: false,
    cooking: "Daily",
    study: "Mixed",
    visitors: "Occasional",
  },
  {
    id: "ap-7",
    name: "Sadia Islam",
    occupation: "Intern, BRAC NGO",
    listingId: "bk-1042",
    appliedOn: "2026-07-23",
    nidVerified: true,
    phoneVerified: false,
    onTimePaymentRate: 79,
    disputes: 0,
    trust: {
      payment: 79,
      maintenance: 68,
      disputes: 100,
      verification: 65,
      reviews: 72,
      agreements: 74,
    },
    note: "Phone verification still pending.",
    budget: 5800,
    sleep: "Early",
    smoking: "No",
    smokingNonNegotiable: true,
    cooking: "Occasionally",
    study: "Quiet",
    visitors: "Rare",
  },
  {
    id: "ap-8",
    name: "Karim Molla",
    occupation: "Rickshaw workshop owner",
    listingId: "bk-1042",
    appliedOn: "2026-07-22",
    nidVerified: false,
    phoneVerified: true,
    onTimePaymentRate: 55,
    disputes: 3,
    trust: {
      payment: 55,
      maintenance: 48,
      disputes: 30,
      verification: 30,
      reviews: 50,
      agreements: 44,
    },
    note: "Three disputes on record — two unresolved.",
    budget: 7000,
    sleep: "Late",
    smoking: "Yes",
    smokingNonNegotiable: false,
    cooking: "Daily",
    study: "Social",
    visitors: "Frequent",
  },
  {
    id: "ap-9",
    name: "Farida Begum",
    occupation: "School teacher, Mohammadpur",
    listingId: "bk-1042",
    appliedOn: "2026-07-24",
    nidVerified: true,
    phoneVerified: true,
    onTimePaymentRate: 93,
    disputes: 0,
    trust: {
      payment: 93,
      maintenance: 85,
      disputes: 100,
      verification: 100,
      reviews: 88,
      agreements: 90,
    },
    note: "Stable employment, three prior tenancies completed.",
    budget: 6200,
    sleep: "Early",
    smoking: "No",
    smokingNonNegotiable: false,
    cooking: "Occasionally",
    study: "Quiet",
    visitors: "Rare",
  },
  {
    id: "ap-10",
    name: "Arif Billah",
    occupation: "Delivery coordinator",
    listingId: "bk-1042",
    appliedOn: "2026-07-26",
    nidVerified: true,
    phoneVerified: true,
    onTimePaymentRate: 72,
    disputes: 1,
    trust: {
      payment: 72,
      maintenance: 60,
      disputes: 65,
      verification: 100,
      reviews: 66,
      agreements: 68,
    },
    note: "One late-payment dispute, settled amicably.",
    budget: 6800,
    sleep: "Late",
    smoking: "Tolerant",
    smokingNonNegotiable: false,
    cooking: "Rarely",
    study: "Mixed",
    visitors: "Occasional",
  },
  // bk-1043 applicants (navid)
  {
    id: "ap-11",
    name: "Tahmina Akter",
    occupation: "Software engineer, Uttara",
    listingId: "bk-1043",
    appliedOn: "2026-07-20",
    nidVerified: true,
    phoneVerified: true,
    onTimePaymentRate: 98,
    disputes: 0,
    trust: {
      payment: 98,
      maintenance: 94,
      disputes: 100,
      verification: 100,
      reviews: 92,
      agreements: 96,
    },
    note: "Four completed tenancies, all on original terms.",
    budget: 14000,
    sleep: "Early",
    smoking: "No",
    smokingNonNegotiable: true,
    cooking: "Occasionally",
    study: "Quiet",
    visitors: "Rare",
  },
  {
    id: "ap-12",
    name: "Nazmul Hoque",
    occupation: "Air traffic controller trainee",
    listingId: "bk-1043",
    appliedOn: "2026-07-15",
    nidVerified: true,
    phoneVerified: true,
    onTimePaymentRate: 90,
    disputes: 0,
    trust: {
      payment: 90,
      maintenance: 82,
      disputes: 100,
      verification: 100,
      reviews: 85,
      agreements: 88,
    },
    note: "Stable income, no disputes on record.",
    budget: 13500,
    sleep: "Flexible",
    smoking: "No",
    smokingNonNegotiable: false,
    cooking: "Daily",
    study: "Mixed",
    visitors: "Occasional",
  },
  {
    id: "ap-13",
    name: "Rubel Mia",
    occupation: "Freelance photographer",
    listingId: "bk-1043",
    appliedOn: "2026-07-10",
    nidVerified: false,
    phoneVerified: true,
    onTimePaymentRate: 68,
    disputes: 2,
    trust: {
      payment: 68,
      maintenance: 58,
      disputes: 45,
      verification: 35,
      reviews: 62,
      agreements: 55,
    },
    note: "NID not yet submitted. Two disputes, one unresolved.",
    budget: 15000,
    sleep: "Late",
    smoking: "Yes",
    smokingNonNegotiable: false,
    cooking: "Rarely",
    study: "Social",
    visitors: "Frequent",
  },
];

export type RankSignal = {
  label: string;
  formula: string;
  detail: string;
  points: number;
  tone: "up" | "down" | "flat";
};

/** Ranking: verification → payment history → dispute record → Trust Score. */
export function rankApplicants(list: Applicant[]) {
  return [...list]
    .map((a) => {
      const verification = (a.nidVerified ? 1 : 0) + (a.phoneVerified ? 1 : 0);
      const score = trustScore(a.trust);
      const signals: RankSignal[] = [
        {
          label: "Verification status",
          formula: "documents verified × 1000",
          detail: `${a.nidVerified ? "NID verified" : "NID pending"}, ${
            a.phoneVerified ? "phone verified" : "phone pending"
          }`,
          points: verification * 1000,
          tone: verification === 2 ? "up" : "down",
        },
        {
          label: "Payment history",
          formula: "on-time rate × 5",
          detail: `${a.onTimePaymentRate}% of past rents paid on time`,
          points: a.onTimePaymentRate * 5,
          tone: a.onTimePaymentRate >= 85 ? "up" : "down",
        },
        {
          label: "Dispute record",
          formula: "disputes × −120",
          detail:
            a.disputes === 0
              ? "No disputes on record"
              : `${a.disputes} dispute${a.disputes === 1 ? "" : "s"} on record`,
          points: -a.disputes * 120,
          tone: a.disputes === 0 ? "flat" : "down",
        },
        {
          label: "Trust Score",
          formula: "weighted Trust Score × 2",
          detail: `Composite score of ${score} across six weighted factors`,
          points: score * 2,
          tone: score >= 80 ? "up" : "down",
        },
      ];
      const rankValue = signals.reduce((sum, s) => sum + s.points, 0);
      return { ...a, score, verification, rankValue, signals };
    })
    .sort((a, b) => b.rankValue - a.rankValue);
}

export type RoommateProfile = {
  budget: number;
  sleep: "Early" | "Flexible" | "Late";
  smoking: "No" | "Tolerant" | "Yes";
  smokingNonNegotiable: boolean;
  cooking: "Rarely" | "Occasionally" | "Daily";
  study: "Quiet" | "Mixed" | "Social";
  visitors: "Rare" | "Occasional" | "Frequent";
};

const scale = <T extends string>(order: T[], a: T, b: T) => {
  const d = Math.abs(order.indexOf(a) - order.indexOf(b));
  return Math.max(0, 1 - d / (order.length - 1));
};

/**
 * Budget 30 · Sleep 20 · Smoking 20 (hard filter) · Study 15 · Visitors 15 — matches the proposal's
 * weighted-scoring algorithm exactly. Cooking habits are still collected on the preference form (the
 * proposal lists it among the inputs) but aren't part of the scored formula, so they don't factor in here.
 */
export function compatibility(a: RoommateProfile, b: RoommateProfile) {
  const hardBlocked =
    (a.smokingNonNegotiable || b.smokingNonNegotiable) &&
    ((a.smoking === "Yes" && b.smoking === "No") || (b.smoking === "Yes" && a.smoking === "No"));

  const budget = Math.max(0, 1 - Math.abs(a.budget - b.budget) / Math.max(a.budget, b.budget));
  const sleep = scale(["Early", "Flexible", "Late"], a.sleep, b.sleep);
  const smoking = scale(["No", "Tolerant", "Yes"], a.smoking, b.smoking);
  const study = scale(["Quiet", "Mixed", "Social"], a.study, b.study);
  const visitors = scale(["Rare", "Occasional", "Frequent"], a.visitors, b.visitors);

  const parts = [
    { label: "Budget overlap", weight: 30, value: budget },
    { label: "Sleep schedule", weight: 20, value: sleep },
    { label: "Smoking preference", weight: 20, value: smoking },
    { label: "Study habits", weight: 15, value: study },
    { label: "Visitor tolerance", weight: 15, value: visitors },
  ];

  const total = Math.round(parts.reduce((s, p) => s + p.weight * p.value, 0));
  return { total: hardBlocked ? 0 : total, parts, hardBlocked };
}

export type ApplicantCompatibilityPair = {
  applicantAId: string;
  applicantBId: string;
  applicantAName: string;
  applicantBName: string;
  score: number;
  hardBlocked: boolean;
};

export const bdt = (n: number) => `৳${n.toLocaleString("en-BD")}`;

export const formatDate = (iso: string) => {
  const d = new Date(iso);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const unknownLandlord: Landlord = {
  id: "unknown",
  name: "Landlord",
  verified: false,
  verifiedSince: "—",
  responseRate: 0,
  avgResponseHours: 0,
  completedRentals: 0,
  trust: { payment: 0, maintenance: 0, disputes: 0, verification: 0, reviews: 0, agreements: 0 },
};

export function getLandlord(id: string): Landlord {
  return landlordsById[id] ?? unknownLandlord;
}
