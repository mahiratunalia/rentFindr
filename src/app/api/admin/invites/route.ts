import { randomBytes } from "crypto";
import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches ShareLink's window

function generateCode() {
  const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (token.role !== "ADMIN")
    return NextResponse.json({ error: "Admin accounts only" }, { status: 403 });

  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: true },
  });
  if (!user?.profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const invite = await prisma.adminInvite.create({
    data: {
      code: generateCode(),
      createdById: user.profile.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return NextResponse.json({
    code: invite.code,
    url: `${baseUrl}/auth?adminInvite=${encodeURIComponent(invite.code)}`,
    expiresAt: invite.expiresAt,
  });
}

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (token.role !== "ADMIN")
    return NextResponse.json({ error: "Admin accounts only" }, { status: 403 });

  const invites = await prisma.adminInvite.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { createdBy: { select: { displayName: true } } },
  });

  return NextResponse.json(invites);
}
