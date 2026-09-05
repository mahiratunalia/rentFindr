import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: true },
  });
  if (!user?.profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const applications = await prisma.application.findMany({
    where: { profileId: user.profile.id },
    orderBy: { createdAt: "desc" },
    include: { listing: { select: { id: true, title: true, area: true } } },
  });

  return NextResponse.json(applications);
}
