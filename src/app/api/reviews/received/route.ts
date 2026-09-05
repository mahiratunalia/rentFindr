import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = String(token.sub);
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Reviews received as a tenant
  const asTenant = await prisma.review.findMany({
    where: { application: { profileId: profile.id }, raterProfileId: { not: profile.id } },
    include: { application: { include: { listing: { select: { title: true } } } } },
  });

  // Reviews received as a landlord
  const asLandlord = await prisma.review.findMany({
    where: {
      application: { listing: { landlordId: userId } },
      raterProfileId: { not: profile.id },
    },
    include: { application: { include: { listing: { select: { title: true } } } } },
  });

  const reviews = [...asTenant, ...asLandlord].map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    categoryRatings: r.categoryRatings,
    createdAt: r.createdAt,
    listingTitle: r.application.listing.title,
  }));

  const average =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  return NextResponse.json({ reviews, average, count: reviews.length });
}
