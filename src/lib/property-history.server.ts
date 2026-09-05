import { prisma } from "@/lib/prisma";

export type PropertyHistory = {
  pastTenancyCount: number;
  avgTenancyMonths: number | null;
  resolvedDisputeCount: number;
  totalDisputeCount: number;
};

/**
 * Property & Tenant History Panels (listing side) — deliberately anonymized:
 * aggregate counts only, no tenant names or per-tenancy detail, matching the
 * proposal's "anonymized" requirement for what a prospective tenant sees on
 * someone else's rental history.
 */
export async function getPropertyHistory(listingId: string): Promise<PropertyHistory> {
  const [pastTenancyCount, disputes, agreementDrafts] = await Promise.all([
    prisma.application.count({
      where: { listingId, status: { in: ["accepted", "completed"] } },
    }),
    prisma.dispute.findMany({
      where: { application: { listingId } },
      select: { status: true },
    }),
    // AgreementDraft has no listingId column — the link only exists inside its
    // own `reference` (`${listingId}/${durationMonths}M`, see agreement/page.tsx
    // and dispute.server.ts's identical read pattern), so match on that prefix.
    prisma.agreementDraft.findMany({
      where: {
        reference: { startsWith: `${listingId}/` },
        tenantSignature: { not: null },
        landlordSignature: { not: null },
      },
      select: { termsJson: true },
    }),
  ]);

  const durations = agreementDrafts
    .map((d) => (d.termsJson as { durationMonths?: number } | null)?.durationMonths)
    .filter((m): m is number => typeof m === "number" && m > 0);

  return {
    pastTenancyCount,
    avgTenancyMonths: durations.length
      ? Math.round((durations.reduce((s, m) => s + m, 0) / durations.length) * 10) / 10
      : null,
    resolvedDisputeCount: disputes.filter((d) => d.status === "resolved").length,
    totalDisputeCount: disputes.length,
  };
}
