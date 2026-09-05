import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity.server";
import {
  recomputeSettlement,
  finalizeMoveOut,
  escalateMoveOutToDispute,
} from "@/lib/move-out.server";
import { getApprovedImprovementCostAdjustment } from "@/lib/improvement-cost.server";

const MAX_DEDUCTIONS = 20;
const MAX_PHOTO_CHARS = 2_200_000; // same cap used elsewhere for base64 photo uploads

const deductionSchema = z.object({
  description: z.string().min(1).max(200),
  amount: z.number().int().nonnegative(),
  photoUrl: z.string().max(MAX_PHOTO_CHARS).optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("acknowledge") }),
  z.object({
    action: z.literal("set_deductions"),
    deductions: z.array(deductionSchema).max(MAX_DEDUCTIONS),
  }),
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("dispute"), description: z.string().min(1) }),
]);

async function loadWithAccess(applicationId: string, userId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { listing: true, profile: true, moveOut: true },
  });
  if (!application) return { application: null, isTenant: false, isLandlord: false };
  return {
    application,
    isTenant: application.profile.userId === userId,
    isLandlord: application.listing.landlordId === userId,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { applicationId } = await params;
  const { application, isTenant, isLandlord } = await loadWithAccess(
    applicationId,
    String(token.sub),
  );
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (!isTenant && !isLandlord) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!application.moveOut) return NextResponse.json(null);

  const improvementAdjustment = await getApprovedImprovementCostAdjustment(applicationId);

  return NextResponse.json({
    ...application.moveOut,
    improvementAdjustment,
    isTenant,
    isLandlord,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { applicationId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { application, isTenant, isLandlord } = await loadWithAccess(
    applicationId,
    String(token.sub),
  );
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (!application.moveOut)
    return NextResponse.json({ error: "No move-out on file" }, { status: 404 });
  const moveOut = application.moveOut;

  if (parsed.data.action === "acknowledge") {
    if (!isTenant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (moveOut.status !== "proposed") {
      return NextResponse.json(
        { error: "This move-out has already been acknowledged." },
        { status: 409 },
      );
    }
    await prisma.moveOut.update({
      where: { id: moveOut.id },
      data: { status: "acknowledged", tenantAcknowledgedAt: new Date() },
    });
    await logActivity({
      listingId: application.listingId,
      tenantProfileId: application.profileId,
      type: "move_out_acknowledged",
      actor: "tenant",
      summary: "Tenant acknowledged the proposed move-out date.",
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "set_deductions") {
    if (!isLandlord) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (moveOut.status !== "acknowledged") {
      return NextResponse.json(
        { error: "Deductions can only be set once the tenant has acknowledged the move-out." },
        { status: 409 },
      );
    }
    // Changing the numbers after either party already confirmed would let a
    // confirmation apply to different figures than what was actually agreed
    // to — clear both and require re-confirmation instead.
    await prisma.moveOut.update({
      where: { id: moveOut.id },
      data: {
        deductionsJson: parsed.data.deductions as unknown as Prisma.InputJsonValue,
        landlordConfirmedAt: null,
        tenantConfirmedAt: null,
      },
    });
    await recomputeSettlement(moveOut.id);
    await logActivity({
      listingId: application.listingId,
      tenantProfileId: application.profileId,
      type: "move_out_deductions_set",
      actor: "landlord",
      summary: `Landlord itemized ${parsed.data.deductions.length} deduction${parsed.data.deductions.length === 1 ? "" : "s"} against the deposit.`,
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "confirm") {
    if (!isTenant && !isLandlord) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (moveOut.status !== "acknowledged") {
      return NextResponse.json(
        { error: "The move-out isn't ready to confirm yet." },
        { status: 409 },
      );
    }
    const now = new Date();
    const updated = await prisma.moveOut.update({
      where: { id: moveOut.id },
      data: isTenant ? { tenantConfirmedAt: now } : { landlordConfirmedAt: now },
    });
    await logActivity({
      listingId: application.listingId,
      tenantProfileId: application.profileId,
      type: "move_out_confirmed",
      actor: isTenant ? "tenant" : "landlord",
      summary: `${isTenant ? "Tenant" : "Landlord"} confirmed the settlement.`,
    });

    if (updated.tenantConfirmedAt && updated.landlordConfirmedAt) {
      await finalizeMoveOut(moveOut.id);
      return NextResponse.json({ ok: true, settled: true });
    }
    return NextResponse.json({ ok: true, settled: false });
  }

  // action === "dispute"
  if (!isTenant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (moveOut.status !== "acknowledged") {
    return NextResponse.json(
      { error: "There's nothing to dispute yet — wait for the settlement figures." },
      { status: 409 },
    );
  }
  const dispute = await escalateMoveOutToDispute(moveOut.id, parsed.data.description);
  return NextResponse.json({ ok: true, disputeId: dispute.id });
}
