import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOverdue } from "@/lib/maintenance";
import { maintenanceFiledEmail } from "@/lib/gmail.server";

const createSchema = z.object({
  applicationId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  photoUrl: z.string().optional(),
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

  const requests = await prisma.maintenanceRequest.findMany({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    requests.map((r) => ({ ...r, isOverdue: isOverdue(r.status, r.createdAt) })),
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
    return NextResponse.json({ error: "Invalid maintenance request" }, { status: 400 });
  }

  const application = await prisma.application.findUnique({
    where: { id: parsed.data.applicationId },
    include: { listing: true, profile: true },
  });
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  if (application.profile.userId !== String(token.sub)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (application.status !== "accepted") {
    return NextResponse.json(
      { error: "You can only file maintenance requests for an active tenancy." },
      { status: 409 },
    );
  }

  const created = await prisma.maintenanceRequest.create({
    data: {
      applicationId: application.id,
      title: parsed.data.title,
      description: parsed.data.description,
      photoUrl: parsed.data.photoUrl,
    },
  });

  const landlord = await prisma.user.findUnique({ where: { id: application.listing.landlordId } });
  if (landlord?.email) {
    await maintenanceFiledEmail(
      landlord.email,
      landlord.name ?? "Landlord",
      created.title,
      application.listing.title,
    ).catch(() => {});
  }

  return NextResponse.json({ ...created, isOverdue: false }, { status: 201 });
}
