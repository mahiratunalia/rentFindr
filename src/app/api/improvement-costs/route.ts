import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity.server";

const MAX_PHOTO_CHARS = 2_200_000; // same cap used elsewhere for base64 photo uploads

const createSchema = z.object({
  applicationId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  amount: z.number().int().positive(),
  photoUrl: z.string().max(MAX_PHOTO_CHARS).optional(),
  settlementMethod: z.enum(["deduct_from_deposit", "deduct_from_rent", "reimburse_separately"]),
});

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const applicationId = request.nextUrl.searchParams.get("applicationId");
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { listing: true, profile: true },
  });
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  const userId = String(token.sub);
  const isTenant = application.profile.userId === userId;
  const isLandlord = application.listing.landlordId === userId;
  if (!isTenant && !isLandlord) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const costs = await prisma.improvementCost.findMany({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(costs);
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
    return NextResponse.json({ error: "Invalid improvement cost entry" }, { status: 400 });
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
  if (application.status !== "accepted") {
    return NextResponse.json(
      { error: "You can only log improvement costs for an active tenancy." },
      { status: 409 },
    );
  }

  const loggedByProfileId = isTenant
    ? application.profileId
    : (await prisma.profile.findUnique({ where: { userId } }))?.id;
  if (!loggedByProfileId) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const created = await prisma.improvementCost.create({
    data: {
      applicationId: application.id,
      loggedByProfileId,
      loggedByRole: isTenant ? "tenant" : "landlord",
      title: parsed.data.title,
      description: parsed.data.description,
      amount: parsed.data.amount,
      photoUrl: parsed.data.photoUrl,
      settlementMethod: parsed.data.settlementMethod,
    },
  });

  await logActivity({
    listingId: application.listingId,
    tenantProfileId: application.profileId,
    type: "improvement_cost_logged",
    actor: isTenant ? "tenant" : "landlord",
    summary: `${isTenant ? "Tenant" : "Landlord"} logged an improvement cost of ৳${parsed.data.amount.toLocaleString("en-BD")} — "${parsed.data.title}" (awaiting approval).`,
  });

  return NextResponse.json(created, { status: 201 });
}
