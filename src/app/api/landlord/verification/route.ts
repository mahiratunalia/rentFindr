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
    include: { profile: { include: { landlordVerification: true } } },
  });

  const v = user?.profile?.landlordVerification;
  return NextResponse.json({
    status: v?.status ?? null,
    reviewNote: v?.reviewNote ?? null,
    nidPhotoUrl: v?.nidPhotoUrl ?? null,
    ownershipProofUrl: v?.ownershipProofUrl ?? null,
    selfiePhotoUrl: v?.selfiePhotoUrl ?? null,
  });
}
