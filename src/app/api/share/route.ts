import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/gmail.server";

const createSchema = z.object({
  type: z.enum(["agreement", "roommate_session"]),
  resourceId: z.string(),
  recipientEmail: z.string().email().optional(),
  recipientName: z.string().optional(),
});

const revokeSchema = z.object({ token: z.string() });

export async function POST(request: NextRequest) {
  const authToken = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!authToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: String(authToken.sub) },
    include: { profile: true },
  });
  if (!user?.profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Only the owner of the underlying resource may mint a share link for it —
  // otherwise any signed-in user could share (and email out) someone else's
  // private agreement or roommate session just by guessing/knowing its id.
  const owns =
    parsed.data.type === "agreement"
      ? await prisma.agreementDraft.findFirst({
          where: { id: parsed.data.resourceId, profileId: user.profile.id },
          select: { id: true },
        })
      : await prisma.roommateSession.findFirst({
          where: { id: parsed.data.resourceId, profileId: user.profile.id },
          select: { id: true },
        });
  if (!owns) return NextResponse.json({ error: "Resource not found" }, { status: 404 });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const link = await prisma.shareLink.create({
    data: {
      type: parsed.data.type,
      resourceId: parsed.data.resourceId,
      profileId: user.profile.id,
      expiresAt,
    },
  });

  const shareUrl = `${process.env.NEXTAUTH_URL}/share/${link.token}`;

  if (parsed.data.recipientEmail) {
    const label =
      parsed.data.type === "agreement" ? "rental agreement" : "roommate matching session";
    await sendEmail({
      to: parsed.data.recipientEmail,
      subject: `${user.profile.displayName} shared a ${label} with you — rentFindr`,
      html: `<p>Hi${parsed.data.recipientName ? ` ${parsed.data.recipientName}` : ""},</p>
<p><strong>${user.profile.displayName}</strong> has shared a ${label} with you on rentFindr.</p>
<p><a href="${shareUrl}">View it here</a> — this link expires in 7 days.</p>
<p>— rentFindr</p>`,
    });
  }

  return NextResponse.json({ token: link.token, url: shareUrl, expiresAt });
}

export async function DELETE(request: NextRequest) {
  const authToken = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!authToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: String(authToken.sub) },
    include: { profile: true },
  });
  if (!user?.profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const link = await prisma.shareLink.findFirst({
    where: { token: parsed.data.token, profileId: user.profile.id },
  });
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.shareLink.update({ where: { id: link.id }, data: { revoked: true } });
  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link || link.revoked || link.expiresAt < new Date()) {
    return NextResponse.json({ error: "Link is invalid or has expired" }, { status: 410 });
  }

  if (link.type === "agreement") {
    const draft = await prisma.agreementDraft.findUnique({ where: { id: link.resourceId } });
    if (!draft) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    return NextResponse.json({ type: "agreement", data: draft });
  } else {
    const session = await prisma.roommateSession.findUnique({ where: { id: link.resourceId } });
    if (!session) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    return NextResponse.json({ type: "roommate_session", data: session });
  }
}
