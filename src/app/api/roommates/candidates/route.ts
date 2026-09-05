import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: true },
  });
  if (!me?.profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const preferences = await prisma.roommatePreference.findMany({
    where: {
      profileId: { not: me.profile.id },
      profile: { accountType: "tenant", user: { role: "TENANT" } },
    },
    include: {
      profile: {
        include: { user: { select: { email: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(
    preferences.map((p) => ({
      profileId: p.profileId,
      displayName: p.profile.displayName,
      email: p.profile.user.email,
      memberSince: p.profile.createdAt,
      budget: p.budget,
      sleep: p.sleep,
      smoking: p.smoking,
      smokingNonNegotiable: p.smokingNonNegotiable,
      cooking: p.cooking,
      study: p.study,
      visitors: p.visitors,
    })),
  );
}
