import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

// A landlord's own accepted/completed tenancies across all their listings —
// used by the dispute-filing tenancy picker, which needs this across every
// listing rather than one at a time like GET /api/applications?listingId=.
export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const applications = await prisma.application.findMany({
    where: {
      listing: { landlordId: String(token.sub) },
      status: { in: ["accepted", "completed"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { id: true, title: true, area: true } },
      profile: { select: { displayName: true } },
    },
  });

  return NextResponse.json(applications);
}
