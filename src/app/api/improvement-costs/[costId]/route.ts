import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity.server";
import { recomputeSettlement } from "@/lib/move-out.server";

const patchSchema = z.object({ action: z.enum(["approve", "reject"]) });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ costId: string }> },
) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { costId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const cost = await prisma.improvementCost.findUnique({
    where: { id: costId },
    include: { application: { include: { listing: true, profile: true, moveOut: true } } },
  });
  if (!cost) return NextResponse.json({ error: "Improvement cost not found" }, { status: 404 });

  const userId = String(token.sub);
  const isTenant = cost.application.profile.userId === userId;
  const isLandlord = cost.application.listing.landlordId === userId;
  if (!isTenant && !isLandlord) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only the party that DIDN'T log it can decide — logging your own cost and
  // immediately approving it would defeat the entire point of the workflow.
  const deciderRole = isTenant ? "tenant" : "landlord";
  if (deciderRole === cost.loggedByRole) {
    return NextResponse.json(
      { error: "The party who logged this cost can't also approve or reject it." },
      { status: 403 },
    );
  }
  if (cost.status !== "pending") {
    return NextResponse.json({ error: "This entry has already been decided." }, { status: 409 });
  }

  const deciderProfileId = isTenant
    ? cost.application.profileId
    : (await prisma.profile.findUnique({ where: { userId } }))?.id;
  if (!deciderProfileId) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const newStatus = parsed.data.action === "approve" ? "approved" : "rejected";
  const updated = await prisma.improvementCost.update({
    where: { id: costId },
    data: { status: newStatus, decidedByProfileId: deciderProfileId, decidedAt: new Date() },
  });

  await logActivity({
    listingId: cost.application.listingId,
    tenantProfileId: cost.application.profileId,
    type: newStatus === "approved" ? "improvement_cost_approved" : "improvement_cost_rejected",
    actor: deciderRole,
    summary: `${deciderRole === "tenant" ? "Tenant" : "Landlord"} ${newStatus} an improvement cost of ৳${cost.amount.toLocaleString("en-BD")} — "${cost.title}".`,
  });

  // If a move-out is already in progress, the settlement figures the parties
  // are looking at just changed — recompute immediately (set_deductions does
  // the same thing) rather than leaving a stale preview until something else
  // happens to trigger a recompute.
  if (newStatus === "approved" && cost.application.moveOut) {
    await recomputeSettlement(cost.application.moveOut.id);
    if (
      cost.application.moveOut.landlordConfirmedAt ||
      cost.application.moveOut.tenantConfirmedAt
    ) {
      await prisma.moveOut.update({
        where: { id: cost.application.moveOut.id },
        data: { landlordConfirmedAt: null, tenantConfirmedAt: null },
      });
    }
  }

  return NextResponse.json(updated);
}
