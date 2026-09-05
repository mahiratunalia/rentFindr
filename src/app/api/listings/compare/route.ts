import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getTrustScoresForLandlords } from "@/lib/analytics.server";
import { matchScore, haversineKm, type MatchPreference } from "@/lib/match";
import { geocodeAddress } from "@/lib/match.server";

export type CompareRow = {
  savedId: string;
  listingId: string;
  title: string;
  area: string;
  city: string;
  rent: number;
  roomType: string;
  landlordTrustScore: number | null;
  matchPercent: number | null;
  distanceKm: number | null;
};

// Read-only — a landmark query param triggers one Nominatim geocode per
// request (not per listing), matching match.server.ts's "once per action,
// never per-listing" usage-policy note.
export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = String(token.sub);
  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: { matchPreference: true },
  });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const landmarkQuery = request.nextUrl.searchParams.get("landmark")?.trim();
  const landmark = landmarkQuery ? await geocodeAddress(landmarkQuery) : null;
  if (landmarkQuery && !landmark) {
    return NextResponse.json(
      { error: "Couldn't locate that landmark — try a more specific area or address." },
      { status: 422 },
    );
  }

  const saved = await prisma.savedListing.findMany({
    where: { profileId: profile.id },
    include: { listing: true },
    orderBy: { createdAt: "desc" },
  });

  const trustScores = await getTrustScoresForLandlords(saved.map((s) => s.listing.landlordId));

  const pref: MatchPreference | null = profile.matchPreference;

  const rows: CompareRow[] = saved.map((s) => {
    const listing = s.listing;
    return {
      savedId: s.id,
      listingId: listing.id,
      title: listing.title,
      area: listing.area,
      city: listing.city,
      rent: listing.rent,
      roomType: listing.roomType,
      landlordTrustScore: trustScores.get(listing.landlordId) ?? null,
      matchPercent: pref ? matchScore(pref, listing).total : null,
      distanceKm: landmark
        ? Math.round(
            haversineKm(landmark.lat, landmark.lng, listing.latitude, listing.longitude) * 10,
          ) / 10
        : null,
    };
  });

  return NextResponse.json({
    landmark: landmark ? { label: landmarkQuery!, lat: landmark.lat, lng: landmark.lng } : null,
    rows,
  });
}
