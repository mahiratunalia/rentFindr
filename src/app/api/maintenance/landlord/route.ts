import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { isOverdue } from "@/lib/maintenance";

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requests = await prisma.maintenanceRequest.findMany({
    where: { application: { listing: { landlordId: String(token.sub) } } },
    orderBy: { createdAt: "desc" },
    include: {
      application: {
        include: {
          listing: { select: { id: true, title: true } },
          profile: { select: { displayName: true } },
        },
      },
    },
  });

  return NextResponse.json(
    requests.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      photoUrl: r.photoUrl,
      status: r.status,
      createdAt: r.createdAt,
      acknowledgedAt: r.acknowledgedAt,
      inProgressAt: r.inProgressAt,
      resolvedAt: r.resolvedAt,
      isOverdue: isOverdue(r.status, r.createdAt),
      listingId: r.application.listing.id,
      listingTitle: r.application.listing.title,
      tenantName: r.application.profile.displayName,
    })),
  );
}
