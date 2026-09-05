import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

// Read-only on purpose — there is no PATCH/DELETE here. Events are only ever
// written by server-side actions (see activity.server.ts), never by a client,
// which is what keeps this timeline tamper-evident.
export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const listingId = searchParams.get("listingId");
  const tenantProfileId = searchParams.get("tenantProfileId");
  if (!listingId || !tenantProfileId) {
    return NextResponse.json(
      { error: "listingId and tenantProfileId are required" },
      { status: 400 },
    );
  }

  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  const userId = String(token.sub);
  const tenantProfile = await prisma.profile.findUnique({ where: { id: tenantProfileId } });
  const isTenant = tenantProfile?.userId === userId;
  const isLandlord = listing.landlordId === userId;
  if (!isTenant && !isLandlord) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const events = await prisma.activityEvent.findMany({
    where: { listingId, tenantProfileId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(events);
}
