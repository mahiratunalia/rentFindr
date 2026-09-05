import { NextResponse, NextRequest, after } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { flagMessage } from "@/lib/messaging.server";
import { logActivity } from "@/lib/activity.server";
import { newMessageEmail } from "@/lib/gmail.server";

const createSchema = z.object({
  applicationId: z.string().min(1),
  body: z.string().min(1).max(4000),
});

async function loadPartyScoped(applicationId: string, userId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { listing: true, profile: true },
  });
  if (!application) return { application: null } as const;
  const isTenant = application.profile.userId === userId;
  const isLandlord = application.listing.landlordId === userId;
  return { application, isTenant, isLandlord, allowed: isTenant || isLandlord } as const;
}

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const applicationId = request.nextUrl.searchParams.get("applicationId");
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  const { application, allowed } = await loadPartyScoped(applicationId, String(token.sub));
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const messages = await prisma.message.findMany({
    where: { applicationId },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { displayName: true } } },
  });

  return NextResponse.json(
    messages.map((m) => ({
      id: m.id,
      senderRole: m.senderRole,
      senderName: m.sender.displayName,
      body: m.body,
      flagged: m.flagged,
      flagReason: m.flagReason,
      createdAt: m.createdAt,
    })),
  );
}

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });

  const userId = String(token.sub);
  const { application, isTenant, isLandlord, allowed } = await loadPartyScoped(
    parsed.data.applicationId,
    userId,
  );
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (application.status === "declined") {
    return NextResponse.json(
      { error: "This application was declined — messaging is closed." },
      { status: 409 },
    );
  }

  const senderProfileId = isTenant
    ? application.profileId
    : (await prisma.profile.findUnique({ where: { userId } }))?.id;
  if (!senderProfileId) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const message = await prisma.message.create({
    data: {
      applicationId: application.id,
      senderProfileId,
      senderRole: isTenant ? "tenant" : "landlord",
      body: parsed.data.body,
    },
    include: { sender: { select: { displayName: true } } },
  });

  // Everything below is non-essential to message delivery — the Gemini flag
  // scan alone is a full network round-trip (often 1-3+ seconds) and used to
  // sit directly in the response path, making every send feel sluggish.
  // Deferred via after() so the response returns as soon as the message is
  // saved; a flagged message (and its email/activity-log side effects) shows
  // up on the thread's next fetch instead of in this response.
  after(async () => {
    const flag = await flagMessage(parsed.data.body);
    if (flag.flagged) {
      await prisma.message.update({
        where: { id: message.id },
        data: { flagged: true, flagReason: flag.reason },
      });
      await logActivity({
        listingId: application.listingId,
        tenantProfileId: application.profileId,
        type: "message_flagged",
        actor: isTenant ? "tenant" : "landlord",
        summary: `A message was flagged for potential evidence value: ${flag.reason ?? "key term detected"}.`,
        metadata: { messageId: message.id },
      });
    }

    const [landlordUser, tenantUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: application.listing.landlordId } }),
      prisma.user.findUnique({ where: { id: application.profile.userId } }),
    ]);
    const counterpartyEmail = isTenant ? landlordUser?.email : tenantUser?.email;
    const counterpartyName = isTenant
      ? (landlordUser?.name ?? "Landlord")
      : application.profile.displayName;
    if (counterpartyEmail) {
      await newMessageEmail(
        counterpartyEmail,
        counterpartyName,
        message.sender.displayName,
        application.listing.title,
      ).catch(() => {});
    }
  });

  return NextResponse.json(
    {
      id: message.id,
      senderRole: message.senderRole,
      senderName: message.sender.displayName,
      body: message.body,
      flagged: message.flagged,
      flagReason: message.flagReason,
      createdAt: message.createdAt,
    },
    { status: 201 },
  );
}
