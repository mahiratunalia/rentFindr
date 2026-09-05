import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const MAX_PHOTO_CHARS = 2_200_000; // ~1.6MB raw, base64-inflated

const submitSchema = z.object({
  nidNumber: z.string().min(5).max(30),
  phone: z.string().min(6).max(20),
  nidPhoto: z.string().min(1).max(MAX_PHOTO_CHARS),
});

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: { include: { tenantVerification: true } } },
  });

  return NextResponse.json({
    status: user?.profile?.tenantVerification?.status ?? null,
    reviewNote: user?.profile?.tenantVerification?.reviewNote ?? null,
  });
}

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token)
    return NextResponse.json({ error: "Sign in to verify your identity." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: { include: { tenantVerification: true } } },
  });
  if (!user?.profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  if (user.profile.tenantVerification && user.profile.tenantVerification.status !== "rejected") {
    return NextResponse.json(
      {
        error: "You already have a verification on file — it's pending review or already verified.",
      },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide an NID number, phone number, and a photo of your NID." },
      { status: 400 },
    );
  }

  const verification = await prisma.tenantVerification.upsert({
    where: { profileId: user.profile.id },
    create: {
      profileId: user.profile.id,
      nidNumber: parsed.data.nidNumber,
      phone: parsed.data.phone,
      nidPhotoUrl: parsed.data.nidPhoto,
      status: "pending",
    },
    update: {
      nidNumber: parsed.data.nidNumber,
      phone: parsed.data.phone,
      nidPhotoUrl: parsed.data.nidPhoto,
      status: "pending",
      reviewNote: null,
      reviewedAt: null,
    },
  });

  return NextResponse.json(verification, { status: 201 });
}
