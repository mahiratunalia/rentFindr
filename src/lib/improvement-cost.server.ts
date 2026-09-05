import { prisma } from "@/lib/prisma";

/**
 * Net effect of every APPROVED improvement cost on the tenant's final refund.
 * Only approved entries with an automatic settlement method count — pending/
 * rejected entries have no financial effect, and reimburse_separately is
 * deliberately excluded from the deposit math (that's the whole point of
 * choosing it).
 *
 * Direction matters: a tenant who fronted a cost is owed it back, so their
 * entries CREDIT the refund. A landlord who logged a cost is charging the
 * tenant for it, so their entries DEBIT the refund.
 */
export async function getApprovedImprovementCostAdjustment(applicationId: string): Promise<{
  tenantCredit: number;
  landlordDebit: number;
  net: number;
}> {
  const approved = await prisma.improvementCost.findMany({
    where: {
      applicationId,
      status: "approved",
      settlementMethod: { in: ["deduct_from_deposit", "deduct_from_rent"] },
    },
    select: { amount: true, loggedByRole: true },
  });

  let tenantCredit = 0;
  let landlordDebit = 0;
  for (const cost of approved) {
    if (cost.loggedByRole === "tenant") tenantCredit += cost.amount;
    else landlordDebit += cost.amount;
  }

  return { tenantCredit, landlordDebit, net: tenantCredit - landlordDebit };
}
