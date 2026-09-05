import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildEvidenceBundle, generateDisputeAnalysis } from "@/lib/dispute.server";
import { logActivity } from "@/lib/activity.server";
import { disputeFiledConfirmationEmail, disputeNotificationEmail } from "@/lib/gmail.server";

const createSchema = z.object({
  applicationId: z.string().min(1),
  type: z.enum(["unlawful_eviction", "unpaid_deposit", "property_damage", "other"]),
  description: z.string().min(1),
});

// Admin-only: every open/resolved dispute across the platform.
export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (token.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const disputes = await prisma.dispute.findMany({
    // Open first, then newest — an admin queue, not a chronological log.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      filedBy: { select: { displayName: true } },
      application: { include: { listing: { select: { id: true, title: true } } } },
    },
  });

  return NextResponse.json(
    disputes.map((d) => ({
      id: d.id,
      type: d.type,
      status: d.status,
      createdAt: d.createdAt,
      filedByRole: d.filedByRole,
      filedByName: d.filedBy.displayName,
      listingTitle: d.application.listing.title,
    })),
  );
}

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid dispute payload" }, { status: 400 });
  }

  const application = await prisma.application.findUnique({
    where: { id: parsed.data.applicationId },
    include: { listing: true, profile: true },
  });
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  const userId = String(token.sub);
  const isTenant = application.profile.userId === userId;
  const isLandlord = application.listing.landlordId === userId;
  if (!isTenant && !isLandlord) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (application.status !== "accepted" && application.status !== "completed") {
    return NextResponse.json(
      { error: "Disputes can only be filed on an active or completed tenancy." },
      { status: 409 },
    );
  }

  const filerUser = await prisma.user.findUnique({ where: { id: userId } });
  const filerProfileId = isTenant
    ? application.profileId
    : (await prisma.profile.findUnique({ where: { userId } }))?.id;
  if (!filerProfileId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const bundle = await buildEvidenceBundle(application.id);
  const analysis = await generateDisputeAnalysis(
    bundle,
    parsed.data.type,
    parsed.data.description,
    isTenant ? "tenant" : "landlord",
  );

  const dispute = await prisma.dispute.create({
    data: {
      applicationId: application.id,
      filedByProfileId: filerProfileId,
      filedByRole: isTenant ? "tenant" : "landlord",
      type: parsed.data.type,
      description: parsed.data.description,
      evidenceJson: bundle as unknown as Prisma.InputJsonValue,
      aiSummary: analysis.summary,
      aiInconsistencies: analysis.inconsistencies as unknown as Prisma.InputJsonValue,
      aiSuggestedSplit: analysis.suggestedSplit,
      aiSource: analysis.source,
    },
  });

  await logActivity({
    listingId: application.listingId,
    tenantProfileId: application.profileId,
    type: "dispute_filed",
    actor: isTenant ? "tenant" : "landlord",
    summary: `${isTenant ? "Tenant" : "Landlord"} filed a dispute (${parsed.data.type.replace(/_/g, " ")}) — Ref ${dispute.id}.`,
  });

  const [landlordUser, tenantUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: application.listing.landlordId } }),
    prisma.user.findUnique({ where: { id: application.profile.userId } }),
  ]);
  const filerEmail = filerUser?.email;
  const filerName = isTenant ? application.profile.displayName : (landlordUser?.name ?? "Landlord");
  const counterpartyEmail = isTenant ? landlordUser?.email : tenantUser?.email;
  const counterpartyName = isTenant
    ? (landlordUser?.name ?? "Landlord")
    : application.profile.displayName;

  if (filerEmail) {
    await disputeFiledConfirmationEmail(filerEmail, filerName, dispute.id).catch(() => {});
  }
  if (counterpartyEmail && counterpartyEmail !== filerEmail) {
    await disputeNotificationEmail(counterpartyEmail, counterpartyName, dispute.id).catch(() => {});
  }

  return NextResponse.json({ id: dispute.id, status: dispute.status }, { status: 201 });
}
