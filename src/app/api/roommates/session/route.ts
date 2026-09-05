import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  label: z.string().min(1),
  profileData: z.record(z.unknown()),
  results: z.array(z.record(z.unknown())),
});

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: true },
  });
  if (!user?.profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const session = await prisma.roommateSession.create({
    data: {
      profileId: user.profile.id,
      label: parsed.data.label,
      profileData: parsed.data.profileData as Prisma.InputJsonValue,
      results: parsed.data.results as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ id: session.id });
}

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

  const sessions = await prisma.roommateSession.findMany({
    where: { profileId: user.profile.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sessions);
}
