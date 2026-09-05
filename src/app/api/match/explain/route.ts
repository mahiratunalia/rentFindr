import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { matchScore } from "@/lib/match";
import { explainMatch } from "@/lib/match.server";

const schema = z.object({ listingId: z.string().min(1) });

// Deliberately per-listing and only called on demand (a "why this matches →"
// click), never eagerly for a whole search results page — the score itself
// is free (client-computable), but the Gemini explanation is a real network
// call and shouldn't fire N times just for someone to browse a listing grid.
export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: { include: { matchPreference: true } } },
  });
  if (!user?.profile?.matchPreference) {
    return NextResponse.json({ error: "Save your match preferences first." }, { status: 409 });
  }

  const listing = await prisma.listing.findUnique({ where: { id: parsed.data.listingId } });
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  const pref = user.profile.matchPreference;
  const result = matchScore(pref, listing);
  const { explanation, source } = await explainMatch(
    pref,
    { ...listing, description: listing.description ?? null },
    result,
  );

  return NextResponse.json({
    total: result.total,
    hardBlocked: result.hardBlocked,
    explanation,
    source,
  });
}
