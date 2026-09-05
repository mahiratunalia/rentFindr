import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/match.server";

const roomTypes = ["Single room", "Shared mess", "Studio", "Full flat"] as const;

const schema = z.object({
  budgetCeiling: z.coerce.number().int().positive(),
  commuteAnchorLabel: z.string().min(1).max(200),
  roomType: z.enum(roomTypes),
  hasPets: z.boolean(),
  smokes: z.boolean(),
  frequentVisitors: z.boolean(),
  mustHaves: z.array(z.string().min(1).max(60)).max(10).default([]),
});

async function getOwnProfile(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return null;
  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: true },
  });
  return user?.profile ?? null;
}

export async function GET(request: NextRequest) {
  const profile = await getOwnProfile(request);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const preference = await prisma.listingMatchPreference.findUnique({
    where: { profileId: profile.id },
  });
  return NextResponse.json(preference);
}

export async function PUT(request: NextRequest) {
  const profile = await getOwnProfile(request);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preference data." }, { status: 400 });
  }

  const geocoded = await geocodeAddress(parsed.data.commuteAnchorLabel);
  if (!geocoded) {
    return NextResponse.json(
      { error: "Couldn't locate that commute anchor — try a more specific area or landmark name." },
      { status: 422 },
    );
  }

  const data = {
    budgetCeiling: parsed.data.budgetCeiling,
    commuteAnchorLabel: parsed.data.commuteAnchorLabel,
    commuteAnchorLat: geocoded.lat,
    commuteAnchorLng: geocoded.lng,
    roomType: parsed.data.roomType,
    hasPets: parsed.data.hasPets,
    smokes: parsed.data.smokes,
    frequentVisitors: parsed.data.frequentVisitors,
    mustHaves: parsed.data.mustHaves,
  };

  const preference = await prisma.listingMatchPreference.upsert({
    where: { profileId: profile.id },
    update: data,
    create: { profileId: profile.id, ...data },
  });

  return NextResponse.json(preference);
}
