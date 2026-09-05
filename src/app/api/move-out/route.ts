import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity.server";
import { recomputeSettlement } from "@/lib/move-out.server";
import { moveOutProposedEmail } from "@/lib/gmail.server";

const createSchema = z.object({
  applicationId: z.string().min(1),
  proposedEndDate: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid move-out request" }, { status: 400 });

  const endDate = new Date(parsed.data.proposedEndDate);
  if (Number.isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "Invalid end date" }, { status: 400 });
  }

  const application = await prisma.application.findUnique({
    where: { id: parsed.data.applicationId },
    include: { listing: true, moveOut: true, profile: { include: { user: true } } },
  });
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (application.listing.landlordId !== String(token.sub)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (application.status !== "accepted") {
    return NextResponse.json(
      { error: "A move-out can only be initiated for an active tenancy." },
      { status: 409 },
    );
  }
  if (application.moveOut) {
    return NextResponse.json(
      { error: "A move-out has already been initiated for this tenancy." },
      { status: 409 },
    );
  }

  const created = await prisma.moveOut.create({
    data: {
      applicationId: application.id,
      proposedEndDate: endDate,
      depositAmount: application.listing.deposit,
    },
  });
  await recomputeSettlement(created.id);

  const endDateLabel = endDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  await logActivity({
    listingId: application.listingId,
    tenantProfileId: application.profileId,
    type: "move_out_proposed",
    actor: "landlord",
    summary: `Landlord proposed a move-out date of ${endDateLabel}.`,
  });

  if (application.profile.user.email) {
    await moveOutProposedEmail(
      application.profile.user.email,
      application.profile.displayName,
      application.listing.title,
      endDateLabel,
    ).catch(() => {});
  }

  return NextResponse.json({ id: created.id, status: created.status }, { status: 201 });
}
