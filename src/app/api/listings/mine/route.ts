import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const listings = await prisma.listing.findMany({
    where: { landlordId: String(token.sub) },
    orderBy: { postedOn: "desc" },
    include: {
      _count: { select: { applications: true } },
    },
  });

  return NextResponse.json(listings);
}
