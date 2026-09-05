import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

// Every non-declined application the caller is a party to (tenant or
// landlord side), each with its most recent message if any — a thread list,
// not an open-ended inbox, matching the "tied to a specific listing or
// active agreement" premise from the proposal.
export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = String(token.sub);
  const profile = await prisma.profile.findUnique({ where: { userId } });

  const applications = await prisma.application.findMany({
    where: {
      status: { not: "declined" },
      OR: [...(profile ? [{ profileId: profile.id }] : []), { listing: { landlordId: userId } }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { id: true, title: true, area: true, landlordId: true } },
      profile: { select: { displayName: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, senderRole: true, createdAt: true },
      },
      _count: { select: { messages: true } },
    },
  });

  const landlordIds = [...new Set(applications.map((a) => a.listing.landlordId))];
  const landlordUsers = await prisma.user.findMany({
    where: { id: { in: landlordIds } },
    select: { id: true, name: true },
  });
  const landlordNameById = new Map(landlordUsers.map((u) => [u.id, u.name ?? "Landlord"]));

  return NextResponse.json(
    applications.map((a) => {
      const isTenant = profile ? a.profileId === profile.id : false;
      return {
        applicationId: a.id,
        status: a.status,
        listingId: a.listing.id,
        listingTitle: a.listing.title,
        listingArea: a.listing.area,
        counterpartyName: isTenant
          ? (landlordNameById.get(a.listing.landlordId) ?? "Landlord")
          : a.profile.displayName,
        messageCount: a._count.messages,
        lastMessage: a.messages[0] ?? null,
      };
    }),
  );
}
