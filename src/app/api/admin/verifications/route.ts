import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (token.role !== "ADMIN")
    return NextResponse.json({ error: "Admin accounts only" }, { status: 403 });

  const verifications = await prisma.landlordVerification.findMany({
    include: {
      profile: {
        include: { user: { select: { email: true } } },
      },
    },
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
  });

  return NextResponse.json(verifications);
}
