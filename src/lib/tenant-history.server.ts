import { prisma } from "@/lib/prisma";

export type TenantHistory = {
  confirmedTenancyCount: number;
  onTimePaymentRate: number | null;
  disputeCount: number;
  resolvedDisputeCount: number;
};

const emptyHistory: TenantHistory = {
  confirmedTenancyCount: 0,
  onTimePaymentRate: null,
  disputeCount: 0,
  resolvedDisputeCount: 0,
};

/**
 * Property & Tenant History Panels (tenant side). "On-time payment rate"
 * reuses the exact paid-count/total-count ratio analytics.server.ts already
 * uses for the Trust Score's payment component — there's no due-date field
 * anywhere in this schema, so "on time" has only ever meant "status=paid"
 * across this codebase, and this panel shouldn't quietly invent a stricter
 * definition that then disagrees with the Trust Score showing the same data.
 */
export async function getTenantHistorySummaries(
  profileIds: string[],
): Promise<Map<string, TenantHistory>> {
  const ids = Array.from(new Set(profileIds));
  const map = new Map<string, TenantHistory>();
  if (ids.length === 0) return map;

  const [applications, payments, disputes] = await Promise.all([
    prisma.application.findMany({
      where: { profileId: { in: ids }, status: { in: ["accepted", "completed"] } },
      select: { profileId: true },
    }),
    prisma.payment.findMany({
      where: { profileId: { in: ids } },
      select: { profileId: true, status: true },
    }),
    prisma.dispute.findMany({
      where: {
        OR: [{ filedByProfileId: { in: ids } }, { application: { profileId: { in: ids } } }],
      },
      select: {
        filedByProfileId: true,
        status: true,
        application: { select: { profileId: true } },
      },
    }),
  ]);

  for (const id of ids) map.set(id, { ...emptyHistory });

  for (const a of applications) {
    const h = map.get(a.profileId);
    if (h) h.confirmedTenancyCount += 1;
  }

  const paymentsByProfile = new Map<string, { paid: number; total: number }>();
  for (const p of payments) {
    const agg = paymentsByProfile.get(p.profileId) ?? { paid: 0, total: 0 };
    agg.total += 1;
    if (p.status === "paid") agg.paid += 1;
    paymentsByProfile.set(p.profileId, agg);
  }
  for (const [profileId, agg] of paymentsByProfile) {
    const h = map.get(profileId);
    if (h) h.onTimePaymentRate = agg.total ? Math.round((agg.paid / agg.total) * 100) : null;
  }

  for (const d of disputes) {
    // A dispute "involves" a tenant whether they filed it or it was filed
    // against their tenancy — count it once per relevant profile either way.
    const relevantIds = new Set(
      [d.filedByProfileId, d.application.profileId].filter((id) => ids.includes(id)),
    );
    for (const profileId of relevantIds) {
      const h = map.get(profileId);
      if (!h) continue;
      h.disputeCount += 1;
      if (d.status === "resolved") h.resolvedDisputeCount += 1;
    }
  }

  return map;
}

export async function getTenantHistory(profileId: string): Promise<TenantHistory> {
  const map = await getTenantHistorySummaries([profileId]);
  return map.get(profileId) ?? { ...emptyHistory };
}
