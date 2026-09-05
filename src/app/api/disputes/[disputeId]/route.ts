import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity.server";
import { disputeResolvedEmail } from "@/lib/gmail.server";

const resolveSchema = z.object({
  resolution: z.string().min(1),
});

async function loadWithAccess(disputeId: string, userId: string, role: string | undefined) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      filedBy: { select: { displayName: true } },
      application: { include: { listing: true, profile: true } },
    },
  });
  if (!dispute) return { dispute: null, allowed: false as const };

  const isAdmin = role === "ADMIN";
  const isTenant = dispute.application.profile.userId === userId;
  const isLandlord = dispute.application.listing.landlordId === userId;
  return { dispute, allowed: isAdmin || isTenant || isLandlord, isAdmin };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { disputeId } = await params;
  const { dispute, allowed, isAdmin } = await loadWithAccess(
    disputeId,
    String(token.sub),
    token.role as string | undefined,
  );
  if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    id: dispute.id,
    type: dispute.type,
    status: dispute.status,
    description: dispute.description,
    filedByRole: dispute.filedByRole,
    filedByName: dispute.filedBy.displayName,
    createdAt: dispute.createdAt,
    resolvedAt: dispute.resolvedAt,
    resolution: dispute.resolution,
    evidence: dispute.evidenceJson,
    aiSummary: dispute.aiSummary,
    aiInconsistencies: dispute.aiInconsistencies,
    aiSuggestedSplit: dispute.aiSuggestedSplit,
    aiSource: dispute.aiSource,
    canResolve: isAdmin && dispute.status === "open",
  });
}

// Admin-only: issues the final, binding written resolution.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (token.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { disputeId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "A resolution is required." }, { status: 400 });

  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { application: { include: { listing: true, profile: true } } },
  });
  if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  if (dispute.status === "resolved") {
    return NextResponse.json({ error: "This dispute has already been resolved." }, { status: 409 });
  }

  // Conditional on status: "open" in the WHERE clause, not just checked above —
  // the read-then-write above has a race window where two concurrent PATCH
  // requests (a double-click, two admins) can both pass that check. Only the
  // first write here actually matches a row; the second gets count 0 and 409s
  // instead of silently overwriting the first admin's resolution.
  const { count } = await prisma.dispute.updateMany({
    where: { id: disputeId, status: "open" },
    data: {
      status: "resolved",
      resolution: parsed.data.resolution,
      resolvedByUserId: String(token.sub),
      resolvedAt: new Date(),
    },
  });
  if (count === 0) {
    return NextResponse.json({ error: "This dispute has already been resolved." }, { status: 409 });
  }
  const updated = await prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } });

  await logActivity({
    listingId: dispute.application.listingId,
    tenantProfileId: dispute.application.profileId,
    type: "dispute_resolved",
    actor: "system",
    summary: `Admin issued a resolution for dispute Ref ${dispute.id}.`,
  });

  const [landlordUser, tenantUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: dispute.application.listing.landlordId } }),
    prisma.user.findUnique({ where: { id: dispute.application.profile.userId } }),
  ]);
  if (tenantUser?.email) {
    await disputeResolvedEmail(
      tenantUser.email,
      dispute.application.profile.displayName,
      dispute.id,
      parsed.data.resolution,
    ).catch(() => {});
  }
  if (landlordUser?.email) {
    await disputeResolvedEmail(
      landlordUser.email,
      landlordUser.name ?? "Landlord",
      dispute.id,
      parsed.data.resolution,
    ).catch(() => {});
  }

  return NextResponse.json({ id: updated.id, status: updated.status });
}
