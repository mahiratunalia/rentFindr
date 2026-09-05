import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const schema = z.object({ listingId: z.string() });

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Sign in to save listings." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: true },
  });
  if (!user?.profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const existing = await prisma.savedListing.findFirst({
    where: { profileId: user.profile.id, listingId: parsed.data.listingId },
  });

  if (existing) {
    // deleteMany instead of delete-by-id: if a concurrent request already
    // removed this row, this just matches zero rows instead of throwing P2025.
    await prisma.savedListing.deleteMany({ where: { id: existing.id } });
    return NextResponse.json({ saved: false });
  }

  try {
    await prisma.savedListing.create({
      data: { profileId: user.profile.id, listingId: parsed.data.listingId },
    });
  } catch (err) {
    // A concurrent request already created the same (profileId, listingId)
    // row between our findFirst and this create — that's fine, end state is
    // the same either way.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
      throw err;
    }
  }
  return NextResponse.json({ saved: true });
}

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ saved: false });

  const { searchParams } = new URL(request.url);
  const listingId = searchParams.get("listingId");
  if (!listingId) return NextResponse.json({ saved: false });

  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: true },
  });
  if (!user?.profile) return NextResponse.json({ saved: false });

  const existing = await prisma.savedListing.findFirst({
    where: { profileId: user.profile.id, listingId },
  });
  return NextResponse.json({ saved: !!existing });
}
