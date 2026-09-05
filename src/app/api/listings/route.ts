import { randomUUID } from "crypto";
import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLandlordSummaries } from "@/lib/landlord-summary.server";

const roomTypes = ["Single room", "Shared mess", "Studio", "Full flat"] as const;
const MAX_PHOTO_CHARS = 2_200_000; // ~1.6MB raw, base64-inflated — same cap as verification photos

const createListingSchema = z.object({
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

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Sign in to create a listing." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: { include: { landlordVerification: true } } },
  });
  const isLandlord = user?.role === "LANDLORD" || user?.profile?.accountType === "landlord";
  if (!user || !isLandlord) {
    return NextResponse.json(
      { error: "Only landlord accounts can create listings." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createListingSchema.safeParse(body);
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
  const isVerified = user.profile?.landlordVerification?.status === "verified";
  const status = parsed.data.status === "Active" && !isVerified ? "Draft" : parsed.data.status;

  const listing = await prisma.listing.create({
    data: {
      id: randomUUID(),
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
      postedOn: new Date(),
      landlordId: user.id,
      houseRules: parsed.data.houseRules,
      photoUrls: parsed.data.photoUrls,
      sqft: parsed.data.sqft ?? null,
    },
  });

  return NextResponse.json(
    {
      ...listing,
      downgradedToDraft: parsed.data.status === "Active" && status === "Draft",
    },
    { status: 201 },
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const area = searchParams.get("area");
  const roomType = searchParams.get("roomType");
  const minRent = searchParams.get("minRent");
  const maxRent = searchParams.get("maxRent");
  const availableBy = searchParams.get("availableBy");

  const minRentNum = minRent !== null ? Number(minRent) : undefined;
  const maxRentNum = maxRent !== null ? Number(maxRent) : undefined;
  if (
    (minRentNum !== undefined && !Number.isFinite(minRentNum)) ||
    (maxRentNum !== undefined && !Number.isFinite(maxRentNum))
  ) {
    return NextResponse.json({ error: "Invalid rent filter." }, { status: 400 });
  }

  let availableByDate: Date | undefined;
  if (availableBy) {
    availableByDate = new Date(availableBy);
    if (Number.isNaN(availableByDate.getTime())) {
      return NextResponse.json({ error: "Invalid availability date." }, { status: 400 });
    }
  }

  const listings = await prisma.listing.findMany({
    where: {
      status: "Active",
      ...(area ? { area } : {}),
      ...(roomType ? { roomType } : {}),
      ...(minRentNum !== undefined || maxRentNum !== undefined
        ? {
            rent: {
              ...(minRentNum !== undefined ? { gte: minRentNum } : {}),
              ...(maxRentNum !== undefined ? { lte: maxRentNum } : {}),
            },
          }
        : {}),
      ...(availableByDate ? { availableFrom: { lte: availableByDate } } : {}),
    },
    orderBy: { postedOn: "desc" },
    include: {
      _count: { select: { applications: true } },
    },
  });

  const landlords = await getLandlordSummaries(listings.map((l) => l.landlordId));
  const withLandlord = listings.map((l) => ({ ...l, landlord: landlords.get(l.landlordId)! }));

  return NextResponse.json(withLandlord);
}
