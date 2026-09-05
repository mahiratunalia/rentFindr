import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  type: z.enum(["savedListing", "application", "roommateSession", "agreementDraft"]),
  id: z.string(),
});

export async function DELETE(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: true },
  });
  if (!user?.profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const profileId = user.profile.id;
  const { type, id } = parsed.data;

  // deleteMany scoped by (id, profileId) is atomic — it can't race against a
  // concurrent delete of the same row the way a separate findFirst-then-delete
  // can (which throws P2025 if the row disappears in between).
  const result =
    type === "savedListing"
      ? await prisma.savedListing.deleteMany({ where: { id, profileId } })
      : type === "application"
        ? await prisma.application.deleteMany({ where: { id, profileId } })
        : type === "roommateSession"
          ? await prisma.roommateSession.deleteMany({ where: { id, profileId } })
          : await prisma.agreementDraft.deleteMany({ where: { id, profileId } });

  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
