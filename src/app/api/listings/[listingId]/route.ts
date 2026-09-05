import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLandlordSummary } from "@/lib/landlord-summary.server";

const roomTypes = ["Single room", "Shared mess", "Studio", "Full flat"] as const;
const MAX_PHOTO_CHARS = 2_200_000; // ~1.6MB raw, base64-inflated — same cap as verification photos

const updateListingSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  area: z.string().min(1),
  city: z.string().min(1),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  rent: z.coerce.number().int().positive(),
  deposit: z.coerce.number().int().nonnegative(),
  roomType: z.enum(roomTypes),
  availableFrom: z.string().min(1),
  status: z.enum(["Active", "Draft"]).default("Active"),
  houseRules: z.array(z.string().min(1).max(200)).max(15).optional().default([]),
  photoUrls: z.array(z.string().min(1).max(MAX_PHOTO_CHARS)).max(6).optional().default([]),
  sqft: z.coerce.number().int().positive().max(1_000_000).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> },
) {
  const { listingId } = await params;

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      _count: { select: { applications: true } },
    },
  });

  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  const landlord = await getLandlordSummary(listing.landlordId);

  return NextResponse.json({ ...listing, landlord });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> },
) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Sign in to edit a listing." }, { status: 401 });

  const { listingId } = await params;
  const existing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!existing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  if (existing.landlordId !== String(token.sub)) {
    return NextResponse.json({ error: "You can only edit your own listings." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateListingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid listing data." },
      { status: 400 },
    );
  }

  const availableFrom = new Date(parsed.data.availableFrom);
  if (Number.isNaN(availableFrom.getTime())) {
    return NextResponse.json({ error: "Invalid availability date." }, { status: 400 });
  }

  // Only admin-verified landlords may publish Active (publicly searchable) listings.
  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: { include: { landlordVerification: true } } },
  });
  const isVerified = user?.profile?.landlordVerification?.status === "verified";
  const status = parsed.data.status === "Active" && !isVerified ? "Draft" : parsed.data.status;

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      area: parsed.data.area,
      city: parsed.data.city,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      rent: parsed.data.rent,
      deposit: parsed.data.deposit,
      roomType: parsed.data.roomType,
      availableFrom,
      status,
      houseRules: parsed.data.houseRules,
      photoUrls: parsed.data.photoUrls,
      sqft: parsed.data.sqft ?? null,
    },
  });

  return NextResponse.json({
    ...updated,
    downgradedToDraft: parsed.data.status === "Active" && status === "Draft",
  });
}
