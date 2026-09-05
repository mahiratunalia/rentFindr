import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  budget: z.coerce.number().int().positive(),
  sleep: z.enum(["Early", "Flexible", "Late"]),
  smoking: z.enum(["No", "Tolerant", "Yes"]),
  smokingNonNegotiable: z.boolean(),
  cooking: z.enum(["Rarely", "Occasionally", "Daily"]),
  study: z.enum(["Quiet", "Mixed", "Social"]),
  visitors: z.enum(["Rare", "Occasional", "Frequent"]),
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

  const preference = await prisma.roommatePreference.findUnique({
    where: { profileId: profile.id },
  });
  return NextResponse.json(preference);
}

export async function PUT(request: NextRequest) {
  const profile = await getOwnProfile(request);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid preference data." }, { status: 400 });

  const preference = await prisma.roommatePreference.upsert({
    where: { profileId: profile.id },
    update: parsed.data,
    create: { profileId: profile.id, ...parsed.data },
  });

  return NextResponse.json(preference);
}
