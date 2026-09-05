import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verificationApprovedEmail, verificationRejectedEmail } from "@/lib/gmail.server";

const schema = z.object({
  status: z.enum(["verified", "rejected"]),
  reviewNote: z.string().max(500).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ verificationId: string }> },
) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (token.role !== "ADMIN")
    return NextResponse.json({ error: "Admin accounts only" }, { status: 403 });

  const { verificationId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const existing = await prisma.landlordVerification.findUnique({
    where: { id: verificationId },
    include: { profile: { include: { user: { select: { email: true, name: true } } } } },
  });
  if (!existing) return NextResponse.json({ error: "Verification not found" }, { status: 404 });

  const updated = await prisma.landlordVerification.update({
    where: { id: verificationId },
    data: {
      status: parsed.data.status,
      reviewNote: parsed.data.reviewNote,
      reviewedAt: new Date(),
    },
  });

  // Approval alone doesn't make prior Draft listings public — without this they'd
  // silently stay Draft forever until the landlord manually re-opens and re-saves
  // each one. Promoting them here is what "your account is now verified" implies.
  if (parsed.data.status === "verified") {
    await prisma.listing.updateMany({
      where: { landlordId: existing.profile.userId, status: "Draft" },
      data: { status: "Active" },
    });
  }

  const recipientEmail = existing.profile.user.email;
  const recipientName = existing.profile.user.name ?? existing.profile.displayName;
  if (parsed.data.status === "verified") {
    await verificationApprovedEmail(recipientEmail, recipientName, "landlord");
  } else {
    await verificationRejectedEmail(
      recipientEmail,
      recipientName,
      "landlord",
      parsed.data.reviewNote,
    );
  }

  return NextResponse.json(updated);
}
