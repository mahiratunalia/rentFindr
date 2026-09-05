import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity.server";
import { buildEvidenceBundle, generateDisputeAnalysis } from "@/lib/dispute.server";
import { getApprovedImprovementCostAdjustment } from "@/lib/improvement-cost.server";
import {
  disputeFiledConfirmationEmail,
  disputeNotificationEmail,
  settlementFinalizedEmail,
  listingVacantEmail,
} from "@/lib/gmail.server";

export type Deduction = { description: string; amount: number; photoUrl?: string };

/**
 * Sum of every "paid" Payment logged against this tenancy — reuses the
 * Rent Payment Logger's own ledger rather than keeping a second running
 * total anywhere, so the two features can't drift out of sync.
 */
async function sumPaidRent(listingId: string, profileId: string): Promise<number> {
  const result = await prisma.payment.aggregate({
    where: { listingId, profileId, status: "paid" },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

function sumDeductions(deductions: Deduction[]): number {
  return deductions.reduce((sum, d) => sum + d.amount, 0);
}

/**
 * Best-effort attempt at SSLCOMMERZ's refund API. Unlike the payment/validation
 * calls elsewhere in this codebase (verified live against real sandbox
 * credentials), this one is NOT verified against a real transaction — deposits
 * are never collected through SSLCOMMERZ as their own transaction in this app,
 * so there is no real bank_tran_id to refund against, and the exact refund
 * endpoint contract hasn't been confirmed against SSLCOMMERZ's own docs. This
 * is deliberately best-effort and non-blocking: the settlement's own record in
 * our database (MoveOut.refundReference/refundLoggedAt) is the source of
 * truth regardless of whether this call succeeds.
 */
async function attemptSslcommerzRefundLog(
  reference: string,
  amount: number,
): Promise<{ attempted: boolean; ok: boolean }> {
  const storeId = process.env.SSLCOMMERZ_STORE_ID;
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD;
  if (!storeId || !storePassword || amount <= 0) return { attempted: false, ok: false };

  try {
    const params = new URLSearchParams({
      store_id: storeId,
      store_passwd: storePassword,
      refund_amount: String(amount),
      refund_remarks: `Deposit refund — ${reference}`,
      format: "json",
    });
    const res = await fetch(
      `https://sandbox.sslcommerz.com/validator/api/refundTransaction?${params.toString()}`,
    );
    return { attempted: true, ok: res.ok };
  } catch (error) {
    console.error("SSLCOMMERZ refund attempt failed:", error);
    return { attempted: true, ok: false };
  }
}

/**
 * Recomputes the settlement figures from the current Payment ledger and
 * whatever deductions have been entered so far. Called both for the live
 * preview (before either party has confirmed) and right before finalizing,
 * so a late-arriving rent payment or an edited deduction list is always
 * reflected in the final numbers rather than a stale snapshot.
 */
export async function recomputeSettlement(moveOutId: string) {
  const moveOut = await prisma.moveOut.findUniqueOrThrow({
    where: { id: moveOutId },
    include: { application: { include: { listing: true } } },
  });
  const deductions = (moveOut.deductionsJson as unknown as Deduction[]) ?? [];
  const [totalRentPaid, improvementAdjustment] = await Promise.all([
    sumPaidRent(moveOut.application.listingId, moveOut.application.profileId),
    getApprovedImprovementCostAdjustment(moveOut.applicationId),
  ]);
  const depositAmount = moveOut.application.listing.deposit;
  const netRefund = Math.max(
    0,
    depositAmount - sumDeductions(deductions) + improvementAdjustment.net,
  );

  return prisma.moveOut.update({
    where: { id: moveOutId },
    data: { totalRentPaid, depositAmount, netRefund },
  });
}

/**
 * Both parties have confirmed — this is the one place that actually settles
 * the tenancy: logs the refund attempt, notifies both parties (settlement
 * summary + refund receipt in one email) and the landlord separately about
 * vacancy, flips Application to "completed" (which is what unlocks Reviews
 * and what the occupancy/vacancy analytics already key off), and records the
 * matching activity events on the shared tenancy timeline.
 */
export async function finalizeMoveOut(moveOutId: string) {
  const fresh = await recomputeSettlement(moveOutId);
  const moveOut = await prisma.moveOut.findUniqueOrThrow({
    where: { id: moveOutId },
    include: {
      application: { include: { listing: true, profile: { include: { user: true } } } },
    },
  });

  const refundReference = `REFUND-${moveOut.applicationId}-${Date.now()}`;
  const refundResult = await attemptSslcommerzRefundLog(refundReference, fresh.netRefund);

  const now = new Date();
  await prisma.$transaction([
    prisma.moveOut.update({
      where: { id: moveOutId },
      data: {
        status: "settled",
        settledAt: now,
        refundReference,
        refundLoggedAt: now,
      },
    }),
    prisma.application.update({
      where: { id: moveOut.applicationId },
      data: { status: "completed" },
    }),
  ]);

  await logActivity({
    listingId: moveOut.application.listingId,
    tenantProfileId: moveOut.application.profileId,
    type: "move_out_settled",
    actor: "system",
    summary: `Tenancy settled — deposit of ৳${fresh.depositAmount.toLocaleString("en-BD")} with ৳${fresh.netRefund.toLocaleString("en-BD")} refunded${refundResult.attempted && !refundResult.ok ? " (SSLCOMMERZ refund log unconfirmed — recorded internally)" : ""}.`,
    metadata: {
      refundReference,
      netRefund: fresh.netRefund,
      depositAmount: fresh.depositAmount,
      sslcommerzAttempted: refundResult.attempted,
      sslcommerzOk: refundResult.ok,
    },
  });

  const landlordUser = await prisma.user.findUnique({
    where: { id: moveOut.application.listing.landlordId },
  });
  const tenantEmail = moveOut.application.profile.user.email;
  const tenantName = moveOut.application.profile.displayName;
  const listingTitle = moveOut.application.listing.title;

  if (tenantEmail) {
    await settlementFinalizedEmail(
      tenantEmail,
      tenantName,
      listingTitle,
      fresh.totalRentPaid,
      fresh.depositAmount,
      fresh.netRefund,
      refundReference,
    ).catch(() => {});
  }
  if (landlordUser?.email) {
    await settlementFinalizedEmail(
      landlordUser.email,
      landlordUser.name ?? "Landlord",
      listingTitle,
      fresh.totalRentPaid,
      fresh.depositAmount,
      fresh.netRefund,
      refundReference,
    ).catch(() => {});
    // The listing is vacant the moment this application stops being "accepted" —
    // the same definition src/lib/analytics.server.ts already uses for occupancy.
    await listingVacantEmail(
      landlordUser.email,
      landlordUser.name ?? "Landlord",
      listingTitle,
    ).catch(() => {});
  }

  return fresh;
}

/**
 * The tenant disputes the settlement instead of confirming it — escalates
 * straight into Smart Evidence Resolution rather than leaving the move-out
 * stalled with no next step. Reuses that feature's own evidence bundling and
 * Gemini analysis wholesale instead of re-implementing a parallel version.
 */
export async function escalateMoveOutToDispute(moveOutId: string, description: string) {
  const moveOut = await prisma.moveOut.findUniqueOrThrow({
    where: { id: moveOutId },
    include: { application: { include: { listing: true, profile: true } } },
  });

  const bundle = await buildEvidenceBundle(moveOut.applicationId);
  const analysis = await generateDisputeAnalysis(bundle, "unpaid_deposit", description, "tenant");

  const dispute = await prisma.dispute.create({
    data: {
      applicationId: moveOut.applicationId,
      filedByProfileId: moveOut.application.profileId,
      filedByRole: "tenant",
      type: "unpaid_deposit",
      description,
      evidenceJson: bundle as unknown as Prisma.InputJsonValue,
      aiSummary: analysis.summary,
      aiInconsistencies: analysis.inconsistencies as unknown as Prisma.InputJsonValue,
      aiSuggestedSplit: analysis.suggestedSplit,
      aiSource: analysis.source,
    },
  });

  await prisma.moveOut.update({
    where: { id: moveOutId },
    data: { status: "disputed", disputeId: dispute.id },
  });

  await logActivity({
    listingId: moveOut.application.listingId,
    tenantProfileId: moveOut.application.profileId,
    type: "dispute_filed",
    actor: "tenant",
    summary: `Tenant disputed the move-out settlement — escalated to Smart Evidence Resolution (Ref ${dispute.id}).`,
  });

  const landlordUser = await prisma.user.findUnique({
    where: { id: moveOut.application.listing.landlordId },
  });
  const tenantUser = await prisma.user.findUnique({
    where: { id: moveOut.application.profile.userId },
  });
  if (tenantUser?.email) {
    await disputeFiledConfirmationEmail(
      tenantUser.email,
      moveOut.application.profile.displayName,
      dispute.id,
    ).catch(() => {});
  }
  if (landlordUser?.email) {
    await disputeNotificationEmail(
      landlordUser.email,
      landlordUser.name ?? "Landlord",
      dispute.id,
    ).catch(() => {});
  }

  return dispute;
}
