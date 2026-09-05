import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTenantHistorySummaries } from "@/lib/tenant-history.server";

const schema = z.object({
  listingId: z.string(),
  note: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const listingId = searchParams.get("listingId");
  if (!listingId) return NextResponse.json({ error: "listingId is required" }, { status: 400 });

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.landlordId !== String(token.sub)) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const applications = await prisma.application.findMany({
    where: { listingId },
    orderBy: { createdAt: "asc" },
    include: {
      profile: {
        include: { roommatePreference: true, tenantVerification: true },
      },
    },
  });

  const historyByProfile = await getTenantHistorySummaries(applications.map((a) => a.profileId));
  const withHistory = applications.map((a) => ({
    ...a,
    history: historyByProfile.get(a.profileId) ?? null,
  }));

  return NextResponse.json(withHistory);
}

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Sign in to apply." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: true },
  });
  if (!user?.profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (user.profile.accountType !== "tenant") {
    return NextResponse.json(
      { error: "Only tenant accounts can apply for listings. Sign in with a tenant account." },
      { status: 403 },
    );
  }

  // Fast path: catches the common case with a friendly message before hitting the DB write.
  const existing = await prisma.application.findFirst({
    where: { profileId: user.profile.id, listingId: parsed.data.listingId },
  });
  if (existing)
    return NextResponse.json(
      { error: "You have already applied for this listing." },
      { status: 409 },
    );

  // Real guarantee: the findFirst check above isn't atomic with the create below, so two
  // near-simultaneous requests (a double-click, a retried request) can both pass it. The
  // @@unique([profileId, listingId]) DB constraint is what actually prevents the duplicate —
  // this just turns the resulting P2002 violation into the same clean 409 instead of a 500.
  try {
    const application = await prisma.application.create({
      data: {
        profileId: user.profile.id,
        listingId: parsed.data.listingId,
        note: parsed.data.note,
        status: "submitted",
      },
    });
    return NextResponse.json(application);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "You have already applied for this listing." },
        { status: 409 },
      );
    }
    throw err;
  }
}
