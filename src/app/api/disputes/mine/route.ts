import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

// Disputes where the caller is either the filer or the counterparty
// (tenant on the application, or landlord of the listing it's against).
export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = String(token.sub);
  const profile = await prisma.profile.findUnique({ where: { userId } });

  const disputes = await prisma.dispute.findMany({
    where: {
      OR: [
        ...(profile ? [{ filedByProfileId: profile.id }] : []),
        ...(profile ? [{ application: { profileId: profile.id } }] : []),
        { application: { listing: { landlordId: userId } } },
      ],
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      filedBy: { select: { displayName: true } },
      application: { include: { listing: { select: { id: true, title: true } } } },
    },
  });

  return NextResponse.json(
    disputes.map((d) => ({
      id: d.id,
      type: d.type,
      status: d.status,
      createdAt: d.createdAt,
      filedByRole: d.filedByRole,
      filedByName: d.filedBy.displayName,
      listingTitle: d.application.listing.title,
    })),
  );
}
