import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { agreementTermsSchema } from "@/lib/agreement.server";

const schema = z.object({
  reference: z.string(),
  // Full shape validation (not z.record(z.unknown())) so a malformed save
  // can never persist data that later crashes the public /share page, which
  // reads numeric fields like rent/deposit straight out of this JSON.
  termsJson: agreementTermsSchema,
  clausesJson: z.array(z.object({ title: z.string(), body: z.string() })),
  source: z.string(),
});

export async function POST(request: NextRequest) {
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

  // Upsert by the (profileId, reference) unique constraint so regenerating
  // always replaces the same row atomically, instead of racing a findFirst
  // against a concurrent request and possibly creating a duplicate row.
  const draft = await prisma.agreementDraft.upsert({
    where: {
      profileId_reference: { profileId: user.profile.id, reference: parsed.data.reference },
    },
    update: {
      clausesJson: parsed.data.clausesJson as Prisma.InputJsonValue,
      source: parsed.data.source,
      termsJson: parsed.data.termsJson as Prisma.InputJsonValue,
    },
    create: {
      profileId: user.profile.id,
      reference: parsed.data.reference,
      termsJson: parsed.data.termsJson as Prisma.InputJsonValue,
      clausesJson: parsed.data.clausesJson as Prisma.InputJsonValue,
      source: parsed.data.source,
    },
  });

  return NextResponse.json({ id: draft.id });
}
