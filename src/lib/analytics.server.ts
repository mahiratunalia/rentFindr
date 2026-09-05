import { prisma } from "@/lib/prisma";
import { TRUST_WEIGHTS, type TrustBreakdown } from "@/data/module1";
import { isOverdue, MAINTENANCE_SLA_HOURS } from "@/lib/maintenance";

export type NullableTrustBreakdown = { [K in keyof TrustBreakdown]: number | null };
export type TrustPoint = { label: string; score: number | null };

const ACTIVE_APPLICATION_STATUSES = ["accepted", "completed"] as const;

/**
 * Weighted trust score computed only from components that have real data —
 * missing components (e.g. no reviews yet, no dispute model at all) drop out
 * of the sum and the remaining weights are renormalized, rather than
 * defaulting a component to a fabricated number.
 */
export function weightedScore(breakdown: NullableTrustBreakdown): number | null {
  let weightSum = 0;
  let scoreSum = 0;
  for (const w of TRUST_WEIGHTS) {
    const v = breakdown[w.key];
    if (v == null) continue;
    weightSum += w.weight;
    scoreSum += v * w.weight;
  }
  if (weightSum === 0) return null;
  return Math.round(scoreSum / weightSum);
}

function monthLabels(n: number): string[] {
  const now = new Date();
  const labels: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(d.toLocaleDateString("en-US", { month: "short", year: "numeric" }));
  }
  return labels;
}

/** Bucket index (0..n-1, oldest first) for a date within the trailing n calendar months, or null if outside that window. */
function monthBucketIndex(date: Date, n: number): number | null {
  const now = new Date();
  const diff = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
  const idx = n - 1 - diff;
  return idx >= 0 && idx < n ? idx : null;
}

/** The last instant of the calendar month `monthsAgo` months before the current one (0 = this month). */
function monthEnd(monthsAgo: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 1, 0, 0, 0, -1);
}

function avg(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

export async function landlordTrustComponents(
  landlordUserId: string,
  asOf: Date,
): Promise<NullableTrustBreakdown> {
  const [payments, verification, resolvedMaintenance, reviews, applications] = await Promise.all([
    prisma.payment.findMany({
      where: { listing: { landlordId: landlordUserId }, createdAt: { lte: asOf } },
      select: { status: true },
    }),
    prisma.landlordVerification.findFirst({
      where: { profile: { userId: landlordUserId }, reviewedAt: { lte: asOf } },
      select: { status: true },
    }),
    prisma.maintenanceRequest.findMany({
      where: {
        application: { listing: { landlordId: landlordUserId } },
        status: "resolved",
        resolvedAt: { lte: asOf },
      },
      select: { createdAt: true, resolvedAt: true },
    }),
    prisma.review.findMany({
      where: { application: { listing: { landlordId: landlordUserId } }, createdAt: { lte: asOf } },
      select: { rating: true, raterProfileId: true, application: { select: { profileId: true } } },
    }),
    prisma.application.findMany({
      where: {
        listing: { landlordId: landlordUserId },
        status: { in: [...ACTIVE_APPLICATION_STATUSES] },
        updatedAt: { lte: asOf },
      },
      select: { status: true },
    }),
  ]);

  const payment = payments.length
    ? Math.round((payments.filter((p) => p.status === "paid").length / payments.length) * 100)
    : null;

  const withinSla = resolvedMaintenance.filter(
    (m) => (m.resolvedAt!.getTime() - m.createdAt.getTime()) / 3_600_000 <= MAINTENANCE_SLA_HOURS,
  ).length;
  const maintenance = resolvedMaintenance.length
    ? Math.round((withinSla / resolvedMaintenance.length) * 100)
    : null;

  const verificationScore = verification
    ? verification.status === "verified"
      ? 100
      : verification.status === "rejected"
        ? 0
        : null
    : null;

  // A review "received by the landlord" is one where the rater is the tenant on that application.
  const landlordReviews = reviews.filter((r) => r.raterProfileId === r.application.profileId);
  const reviewScore = landlordReviews.length
    ? Math.round(avg(landlordReviews.map((r) => r.rating))! * 20)
    : null;

  const agreements = applications.length
    ? Math.round(
        (applications.filter((a) => a.status === "completed").length / applications.length) * 100,
      )
    : null;

  return {
    payment,
    maintenance,
    disputes: null, // no dispute/resolution model exists in this schema yet
    verification: verificationScore,
    reviews: reviewScore,
    agreements,
  };
}

/**
 * Just the number, for N distinct landlords at once — used by the Saved
 * Listings comparison table, which needs a Trust Score per row without
 * pulling each landlord's full analytics payload (occupancy, income trend,
 * 6-month trust trend, etc.) the way getLandlordAnalytics() does.
 */
export async function getTrustScoresForLandlords(
  landlordIds: string[],
): Promise<Map<string, number | null>> {
  const ids = Array.from(new Set(landlordIds));
  const now = new Date();
  const scores = await Promise.all(
    ids.map(async (id) => weightedScore(await landlordTrustComponents(id, now))),
  );
  return new Map(ids.map((id, i) => [id, scores[i]!]));
}

async function tenantTrustComponents(
  profileId: string,
  asOf: Date,
): Promise<NullableTrustBreakdown> {
  const [payments, verification, reviews, applications] = await Promise.all([
    prisma.payment.findMany({
      where: { profileId, createdAt: { lte: asOf } },
      select: { status: true },
    }),
    prisma.tenantVerification.findFirst({
      where: { profileId, reviewedAt: { lte: asOf } },
      select: { status: true },
    }),
    prisma.review.findMany({
      where: { application: { profileId }, createdAt: { lte: asOf } },
      select: { rating: true, raterProfileId: true },
    }),
    prisma.application.findMany({
      where: {
        profileId,
        status: { in: [...ACTIVE_APPLICATION_STATUSES] },
        updatedAt: { lte: asOf },
      },
      select: { status: true },
    }),
  ]);

  const payment = payments.length
    ? Math.round((payments.filter((p) => p.status === "paid").length / payments.length) * 100)
    : null;

  const verificationScore = verification
    ? verification.status === "verified"
      ? 100
      : verification.status === "rejected"
        ? 0
        : null
    : null;

  // A review "received by the tenant" is one where the rater is the landlord, i.e. not the tenant themself.
  const tenantReviews = reviews.filter((r) => r.raterProfileId !== profileId);
  const reviewScore = tenantReviews.length
    ? Math.round(avg(tenantReviews.map((r) => r.rating))! * 20)
    : null;

  const agreements = applications.length
    ? Math.round(
        (applications.filter((a) => a.status === "completed").length / applications.length) * 100,
      )
    : null;

  return {
    payment,
    maintenance: null, // proposal defines this as "documented unit condition at move-out" — not tracked yet
    disputes: null,
    verification: verificationScore,
    reviews: reviewScore,
    agreements,
  };
}

async function trustTrend(
  computeFn: (asOf: Date) => Promise<NullableTrustBreakdown>,
  months = 6,
): Promise<TrustPoint[]> {
  const labels = monthLabels(months);
  const points: TrustPoint[] = [];
  for (let i = 0; i < months; i++) {
    const breakdown = await computeFn(monthEnd(months - 1 - i));
    points.push({ label: labels[i]!, score: weightedScore(breakdown) });
  }
  return points;
}

export type PlatformInsight = { text: string };

/**
 * Cross-platform correlations, computed from every tenancy's real records —
 * not this one landlord's or tenant's data. Returns nothing for a
 * correlation until both sides of it have at least one real sample.
 */
async function getPlatformInsights(): Promise<PlatformInsight[]> {
  const insights: PlatformInsight[] = [];

  const resolved = await prisma.maintenanceRequest.findMany({
    where: { status: "resolved", resolvedAt: { not: null } },
    select: { applicationId: true, createdAt: true, resolvedAt: true },
  });
  if (resolved.length) {
    const hoursByApp = new Map<string, number[]>();
    for (const m of resolved) {
      const hours = (m.resolvedAt!.getTime() - m.createdAt.getTime()) / 3_600_000;
      const arr = hoursByApp.get(m.applicationId) ?? [];
      arr.push(hours);
      hoursByApp.set(m.applicationId, arr);
    }
    const appIds = [...hoursByApp.keys()];
    const [apps, reviews] = await Promise.all([
      prisma.application.findMany({
        where: { id: { in: appIds } },
        select: { id: true, profileId: true },
      }),
      prisma.review.findMany({
        where: { applicationId: { in: appIds } },
        select: { applicationId: true, rating: true, raterProfileId: true },
      }),
    ]);
    const tenantOf = new Map(apps.map((a) => [a.id, a.profileId]));
    const within: number[] = [];
    const over: number[] = [];
    for (const r of reviews) {
      if (r.raterProfileId !== tenantOf.get(r.applicationId)) continue; // tenant-rating-landlord only
      const hoursArr = hoursByApp.get(r.applicationId);
      if (!hoursArr) continue;
      const avgHours = avg(hoursArr)!;
      (avgHours <= MAINTENANCE_SLA_HOURS ? within : over).push(r.rating);
    }
    const avgWithin = avg(within);
    const avgOver = avg(over);
    if (avgWithin != null && avgOver != null) {
      const diffPct = avgOver > 0 ? Math.round(((avgWithin - avgOver) / avgOver) * 100) : null;
      insights.push({
        text: `Tenancies where maintenance requests were resolved within the ${MAINTENANCE_SLA_HOURS}h SLA average ${avgWithin.toFixed(1)}★ from tenants, vs ${avgOver.toFixed(1)}★ when resolution took longer${diffPct != null ? ` (${diffPct >= 0 ? "+" : ""}${diffPct}%)` : ""}.`,
      });
    }
  }

  const completedApps = await prisma.application.findMany({
    where: { status: "completed" },
    select: { id: true, profileId: true, createdAt: true, updatedAt: true },
  });
  if (completedApps.length) {
    const high: number[] = [];
    const low: number[] = [];
    for (const a of completedApps) {
      const breakdown = await tenantTrustComponents(a.profileId, a.updatedAt);
      const score = weightedScore(breakdown);
      if (score == null) continue;
      const days = (a.updatedAt.getTime() - a.createdAt.getTime()) / 86_400_000;
      (score >= 70 ? high : low).push(days);
    }
    const avgHigh = avg(high);
    const avgLow = avg(low);
    if (avgHigh != null && avgLow != null) {
      const roundedHigh = Math.round(avgHigh);
      const roundedLow = Math.round(avgLow);
      const longer = avgHigh >= avgLow;
      const ratio = longer
        ? avgLow > 0
          ? avgHigh / avgLow
          : null
        : avgHigh > 0
          ? avgLow / avgHigh
          : null;
      const comparison =
        roundedHigh === roundedLow
          ? "about the same time as"
          : `${ratio != null ? `${ratio.toFixed(1)}× ` : ""}${longer ? "longer than" : "shorter than"}`;
      insights.push({
        text: `Tenants with a Trust Score of 70+ average ${roundedHigh} days from application to completed tenancy — ${comparison} tenants below that threshold (${roundedLow} days).`,
      });
    }
  }

  return insights;
}

async function platformAverageOccupancy(): Promise<number | null> {
  const listings = await prisma.listing.findMany({
    where: { status: "Active" },
    select: { applications: { select: { status: true } } },
  });
  if (!listings.length) return null;
  const occupied = listings.filter((l) =>
    l.applications.some((a) => a.status === "accepted"),
  ).length;
  return Math.round((occupied / listings.length) * 100);
}

async function paymentCompletionPercentile(
  profileId: string,
  myRate: number | null,
): Promise<number | null> {
  if (myRate == null) return null;
  const allPayments = await prisma.payment.findMany({ select: { profileId: true, status: true } });
  const byProfile = new Map<string, { total: number; paid: number }>();
  for (const p of allPayments) {
    const agg = byProfile.get(p.profileId) ?? { total: 0, paid: 0 };
    agg.total += 1;
    if (p.status === "paid") agg.paid += 1;
    byProfile.set(p.profileId, agg);
  }
  const rates = [...byProfile.values()].map((v) => (v.paid / v.total) * 100);
  if (rates.length <= 1) return null;
  const below = rates.filter((r) => r < myRate).length;
  return Math.round((below / rates.length) * 100);
}

export type LandlordAnalytics = {
  occupancy: { rate: number | null; occupied: number; totalActive: number };
  income: { currentMonthTotal: number; trend: { label: string; total: number }[] };
  improvementSpend: { currentMonthTotal: number; trend: { label: string; total: number }[] };
  netYield: { currentMonthTotal: number; trend: { label: string; total: number }[] };
  vacancy: { avgDays: number | null; sampleSize: number };
  maintenance: {
    avgResolutionHours: number | null;
    withinSlaRate: number | null;
    totalResolved: number;
    openOverdue: number;
  };
  deposits: { totalHeld: number; activeCount: number };
  trust: { score: number | null; breakdown: NullableTrustBreakdown; trend: TrustPoint[] };
  insights: string[];
};

export async function getLandlordAnalytics(landlordUserId: string): Promise<LandlordAnalytics> {
  const listings = await prisma.listing.findMany({
    where: { landlordId: landlordUserId },
    select: {
      id: true,
      status: true,
      postedOn: true,
      deposit: true,
      applications: { select: { status: true, createdAt: true } },
    },
  });

  const activeListings = listings.filter((l) => l.status === "Active");
  const occupiedListings = activeListings.filter((l) =>
    l.applications.some((a) => a.status === "accepted"),
  );
  const occupancy = {
    occupied: occupiedListings.length,
    totalActive: activeListings.length,
    rate: activeListings.length
      ? Math.round((occupiedListings.length / activeListings.length) * 100)
      : null,
  };

  const deposits = {
    totalHeld: occupiedListings.reduce((s, l) => s + l.deposit, 0),
    activeCount: occupiedListings.length,
  };

  const vacancyDays: number[] = [];
  for (const l of listings) {
    const firstTenanted = l.applications
      .filter((a) => a.status === "accepted" || a.status === "completed")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (firstTenanted) {
      const days = (firstTenanted.createdAt.getTime() - l.postedOn.getTime()) / 86_400_000;
      if (days >= 0) vacancyDays.push(days);
    }
  }
  const vacancy = {
    avgDays: vacancyDays.length ? Math.round(avg(vacancyDays)! * 10) / 10 : null,
    sampleSize: vacancyDays.length,
  };

  const maintRequests = listings.length
    ? await prisma.maintenanceRequest.findMany({
        where: { application: { listing: { landlordId: landlordUserId } } },
        select: { status: true, createdAt: true, resolvedAt: true },
      })
    : [];
  const resolved = maintRequests.filter((m) => m.status === "resolved" && m.resolvedAt);
  const resolutionHours = resolved.map(
    (m) => (m.resolvedAt!.getTime() - m.createdAt.getTime()) / 3_600_000,
  );
  const maintenance = {
    avgResolutionHours: resolutionHours.length ? Math.round(avg(resolutionHours)! * 10) / 10 : null,
    withinSlaRate: resolved.length
      ? Math.round(
          (resolutionHours.filter((h) => h <= MAINTENANCE_SLA_HOURS).length / resolved.length) *
            100,
        )
      : null,
    totalResolved: resolved.length,
    openOverdue: maintRequests.filter(
      (m) => m.status !== "resolved" && isOverdue(m.status, m.createdAt),
    ).length,
  };

  const listingIds = listings.map((l) => l.id);
  const payments = listingIds.length
    ? await prisma.payment.findMany({
        where: { listingId: { in: listingIds }, status: "paid" },
        select: { amount: true, createdAt: true },
      })
    : [];
  const labels = monthLabels(6);
  const totals = new Array(6).fill(0) as number[];
  for (const p of payments) {
    const idx = monthBucketIndex(p.createdAt, 6);
    if (idx != null) totals[idx] += p.amount;
  }
  const income = {
    currentMonthTotal: totals[5]!,
    trend: labels.map((label, i) => ({ label, total: totals[i]! })),
  };

  // Renovation & Improvement Cost Log: only the landlord's own approved,
  // out-of-pocket spend counts here. A tenant-fronted cost that gets
  // deducted from their deposit is already netted correctly in the Move-Out
  // settlement itself (MoveOut.netRefund) — including it again here would
  // double-count the same money as a landlord "cost" when it was actually
  // recouped via a smaller refund, not paid separately.
  const improvementCosts = listingIds.length
    ? await prisma.improvementCost.findMany({
        where: {
          status: "approved",
          loggedByRole: "landlord",
          application: { listing: { landlordId: landlordUserId } },
        },
        select: { amount: true, createdAt: true },
      })
    : [];
  const spendTotals = new Array(6).fill(0) as number[];
  for (const c of improvementCosts) {
    const idx = monthBucketIndex(c.createdAt, 6);
    if (idx != null) spendTotals[idx] += c.amount;
  }
  const improvementSpend = {
    currentMonthTotal: spendTotals[5]!,
    trend: labels.map((label, i) => ({ label, total: spendTotals[i]! })),
  };
  const netYield = {
    currentMonthTotal: income.currentMonthTotal - improvementSpend.currentMonthTotal,
    trend: labels.map((label, i) => ({ label, total: totals[i]! - spendTotals[i]! })),
  };

  const breakdown = await landlordTrustComponents(landlordUserId, new Date());
  const score = weightedScore(breakdown);
  const trend = await trustTrend((asOf) => landlordTrustComponents(landlordUserId, asOf), 6);

  const insights = [...(await getPlatformInsights()).map((i) => i.text)];
  if (occupancy.rate != null) {
    const platformAvg = await platformAverageOccupancy();
    if (platformAvg != null) {
      const diff = occupancy.rate - platformAvg;
      insights.push(
        `Your occupancy rate is ${occupancy.rate}%, ${Math.abs(diff)} point${Math.abs(diff) === 1 ? "" : "s"} ${diff >= 0 ? "above" : "below"} the platform average of ${platformAvg}%.`,
      );
    }
  }
  if (maintenance.avgResolutionHours != null) {
    insights.push(
      `Your average maintenance resolution time is ${maintenance.avgResolutionHours}h, with ${maintenance.withinSlaRate}% of requests resolved within the ${MAINTENANCE_SLA_HOURS}h SLA.`,
    );
  }
  if (improvementSpend.currentMonthTotal > 0) {
    const pctOfIncome = income.currentMonthTotal
      ? Math.round((improvementSpend.currentMonthTotal / income.currentMonthTotal) * 100)
      : null;
    insights.push(
      `You've spent ৳${improvementSpend.currentMonthTotal.toLocaleString("en-BD")} on approved improvements this month` +
        (pctOfIncome != null ? `, ${pctOfIncome}% of rent logged.` : "."),
    );
  }

  return {
    occupancy,
    income,
    improvementSpend,
    netYield,
    vacancy,
    maintenance,
    deposits,
    trust: { score, breakdown, trend },
    insights,
  };
}

export type TenantAnalytics = {
  payments: {
    totalLogged: number;
    totalPaid: number;
    completionRate: number | null;
    percentile: number | null;
  };
  maintenance: { filed: number; avgResolutionHours: number | null };
  deposits: { totalPaid: number; activeCount: number };
  trust: { score: number | null; breakdown: NullableTrustBreakdown; trend: TrustPoint[] };
  insights: string[];
};

export async function getTenantAnalytics(profileId: string): Promise<TenantAnalytics> {
  const [payments, applications, maintReqs] = await Promise.all([
    prisma.payment.findMany({ where: { profileId }, select: { status: true } }),
    prisma.application.findMany({
      where: { profileId },
      select: { status: true, listing: { select: { deposit: true } } },
    }),
    prisma.maintenanceRequest.findMany({
      where: { application: { profileId } },
      select: { status: true, createdAt: true, resolvedAt: true },
    }),
  ]);

  const totalLogged = payments.length;
  const totalPaid = payments.filter((p) => p.status === "paid").length;
  const completionRate = totalLogged ? Math.round((totalPaid / totalLogged) * 100) : null;
  const percentile = await paymentCompletionPercentile(profileId, completionRate);

  const activeApps = applications.filter((a) => a.status === "accepted");
  const deposits = {
    totalPaid: activeApps.reduce((s, a) => s + a.listing.deposit, 0),
    activeCount: activeApps.length,
  };

  const resolved = maintReqs.filter((m) => m.status === "resolved" && m.resolvedAt);
  const avgResolutionHours = resolved.length
    ? Math.round(
        avg(resolved.map((m) => (m.resolvedAt!.getTime() - m.createdAt.getTime()) / 3_600_000))! *
          10,
      ) / 10
    : null;

  const breakdown = await tenantTrustComponents(profileId, new Date());
  const score = weightedScore(breakdown);
  const trend = await trustTrend((asOf) => tenantTrustComponents(profileId, asOf), 6);

  const insights: string[] = [];
  if (percentile != null) {
    insights.push(
      `Your on-time payment rate puts you in the top ${100 - percentile}% of tenants who've logged rent payments.`,
    );
  }
  insights.push(...(await getPlatformInsights()).map((i) => i.text));

  return {
    payments: { totalLogged, totalPaid, completionRate, percentile },
    maintenance: { filed: maintReqs.length, avgResolutionHours },
    deposits,
    trust: { score, breakdown, trend },
    insights,
  };
}
