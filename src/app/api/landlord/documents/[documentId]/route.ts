import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId } = await params;
  const profile = await prisma.profile.findUnique({ where: { userId: String(token.sub) } });
  if (!profile) return NextResponse.json({ error: "No profile found" }, { status: 404 });

  const existing = await prisma.landlordDocument.findUnique({ where: { id: documentId } });
  if (!existing || existing.profileId !== profile.id) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  await prisma.landlordDocument.delete({ where: { id: documentId } });
  return NextResponse.json({ ok: true });
}
