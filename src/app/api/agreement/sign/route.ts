import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity.server";

const DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const MAX_SIGNATURE_LENGTH = 300_000; // ~220KB decoded, plenty for a signature PNG

const schema = z.object({
  draftId: z.string().min(1),
  role: z.enum(["tenant", "landlord"]),
  signature: z
    .string()
    .min(1)
    .max(MAX_SIGNATURE_LENGTH)
    .regex(DATA_URL_RE, "Invalid signature image"),
});

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const draft = await prisma.agreementDraft.findUnique({
    where: { id: parsed.data.draftId },
    include: { profile: true },
  });
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  // reference is always `${listingId}/${duration}M` (see agreement/page.tsx) — reused
  // below both to authorize the signer and to scope the activity-log entry.
  const userId = String(token.sub);
  const listingId = draft.reference.split("/")[0];

  if (parsed.data.role === "tenant") {
    if (draft.profile.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const listing = listingId
      ? await prisma.listing.findUnique({ where: { id: listingId }, select: { landlordId: true } })
      : null;
    if (!listing || listing.landlordId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Idempotent: re-submitting the same role's signature doesn't overwrite the
  // original or double-log the activity timeline.
  if (parsed.data.role === "tenant" && draft.tenantSignature) {
    return NextResponse.json({
      tenantSigned: true,
      landlordSigned: !!draft.landlordSignature,
      signedAt: (draft.tenantSignedAt ?? new Date()).toISOString(),
    });
  }
  if (parsed.data.role === "landlord" && draft.landlordSignature) {
    return NextResponse.json({
      tenantSigned: !!draft.tenantSignature,
      landlordSigned: true,
      signedAt: (draft.landlordSignedAt ?? new Date()).toISOString(),
    });
  }

  const now = new Date();
  const data =
    parsed.data.role === "tenant"
      ? { tenantSignature: parsed.data.signature, tenantSignedAt: now }
      : { landlordSignature: parsed.data.signature, landlordSignedAt: now };

  const updated = await prisma.agreementDraft.update({ where: { id: draft.id }, data });

  // The draft's own profileId is the tenant's in the normal (and shared-listing)
  // flow — it's what disambiguates which tenant's agreement this is. Only log
  // against the tenant-scoped timeline when that holds; skip otherwise rather
  // than mis-attributing an event to the wrong party.
  if (listingId && draft.profile.accountType === "tenant") {
    const wasFullySigned = !!draft.tenantSignature && !!draft.landlordSignature;
    const isNowFullySigned = !!updated.tenantSignature && !!updated.landlordSignature;

    await logActivity({
      listingId,
      tenantProfileId: draft.profileId,
      type:
        parsed.data.role === "tenant"
          ? "agreement_signed_by_tenant"
          : "agreement_signed_by_landlord",
      actor: parsed.data.role,
      summary: `${parsed.data.role === "tenant" ? "Tenant" : "Landlord"} signed the rental agreement (Ref ${draft.reference}).`,
    });

    if (isNowFullySigned && !wasFullySigned) {
      await logActivity({
        listingId,
        tenantProfileId: draft.profileId,
        type: "agreement_fully_executed",
        actor: "system",
        summary: `Rental agreement fully executed — both parties have signed (Ref ${draft.reference}).`,
      });
    }
  }

  return NextResponse.json({
    tenantSigned: !!updated.tenantSignature,
    landlordSigned: !!updated.landlordSignature,
    signedAt: now.toISOString(),
  });
}
