import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export type EvidenceBundle = {
  application: { id: string; status: string; createdAt: string };
  listing: { id: string; title: string; area: string; city: string; rent: number; deposit: number };
  tenant: { name: string };
  landlord: { name: string };
  agreement: {
    reference: string;
    durationMonths: number;
    startDate: string;
    endDate: string;
    tenantSigned: boolean;
    landlordSigned: boolean;
  } | null;
  payments: { month: string; amount: number; status: string; createdAt: string }[];
  maintenance: {
    title: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
    isOverdue: boolean;
    photoUrl: string | null;
  }[];
  activity: { type: string; actor: string; summary: string; createdAt: string }[];
  flaggedMessages: { senderRole: string; body: string; reason: string | null; createdAt: string }[];
};

/**
 * Bundles every piece of stored evidence for a tenancy into one snapshot —
 * the "no manual document-hunting" premise of Smart Evidence Resolution.
 * Only Gemini-flagged messages are included (not the full thread), matching
 * the proposal's "surfaces flagged messages into the Activity Timeline for
 * later disputes" — ordinary back-and-forth isn't evidence.
 */
export async function buildEvidenceBundle(applicationId: string): Promise<EvidenceBundle> {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { listing: true, profile: true },
  });

  const [landlordUser, agreementDrafts, payments, maintenance, activity, flaggedMessages] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: application.listing.landlordId } }),
      prisma.agreementDraft.findMany({
        where: {
          profileId: application.profileId,
          reference: { startsWith: `${application.listingId}/` },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.findMany({
        where: { listingId: application.listingId, profileId: application.profileId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.maintenanceRequest.findMany({
        where: { applicationId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.activityEvent.findMany({
        where: { listingId: application.listingId, tenantProfileId: application.profileId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.message.findMany({
        where: { applicationId, flagged: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  // Prefer a fully-signed draft over a partially-signed or unsigned one — the
  // legal anchor the proposal describes — but fall back to the latest draft
  // if none is fully signed rather than omitting the agreement entirely.
  const agreementDraft =
    agreementDrafts.find((d) => d.tenantSignature && d.landlordSignature) ?? agreementDrafts[0];
  const terms = agreementDraft?.termsJson as
    { durationMonths?: number; startDate?: string; endDate?: string } | undefined;

  return {
    application: {
      id: application.id,
      status: application.status,
      createdAt: application.createdAt.toISOString(),
    },
    listing: {
      id: application.listing.id,
      title: application.listing.title,
      area: application.listing.area,
      city: application.listing.city,
      rent: application.listing.rent,
      deposit: application.listing.deposit,
    },
    tenant: { name: application.profile.displayName },
    landlord: { name: landlordUser?.name ?? "Landlord" },
    agreement: agreementDraft
      ? {
          reference: agreementDraft.reference,
          durationMonths: terms?.durationMonths ?? 0,
          startDate: terms?.startDate ?? "",
          endDate: terms?.endDate ?? "",
          tenantSigned: !!agreementDraft.tenantSignature,
          landlordSigned: !!agreementDraft.landlordSignature,
        }
      : null,
    payments: payments.map((p) => ({
      month: p.month,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    })),
    maintenance: maintenance.map((m) => ({
      title: m.title,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      resolvedAt: m.resolvedAt?.toISOString() ?? null,
      isOverdue:
        m.status !== "resolved" && Date.now() - m.createdAt.getTime() > 48 * 60 * 60 * 1000,
      photoUrl: m.photoUrl,
    })),
    activity: activity.map((a) => ({
      type: a.type,
      actor: a.actor,
      summary: a.summary,
      createdAt: a.createdAt.toISOString(),
    })),
    flaggedMessages: flaggedMessages.map((m) => ({
      senderRole: m.senderRole,
      body: m.body,
      reason: m.flagReason,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export type DisputeAnalysis = {
  summary: string;
  inconsistencies: string[];
  suggestedSplit: string | null;
  source: "ai" | "fallback";
  error?: string;
};

const analysisShapeSchema = z.object({
  summary: z.string(),
  inconsistencies: z.array(z.string()),
  suggestedSplit: z.string().nullable(),
});

function fallbackAnalysis(error?: string): DisputeAnalysis {
  return {
    summary:
      "AI analysis is unavailable for this dispute — an admin should review the evidence bundle below directly.",
    inconsistencies: [],
    suggestedSplit: null,
    source: "fallback",
    error,
  };
}

/**
 * Non-binding: highlights inconsistencies between the claim and the stored
 * record, and suggests a starting-point responsibility split. The admin's
 * own written resolution is what actually settles the dispute.
 */
export async function generateDisputeAnalysis(
  bundle: EvidenceBundle,
  type: string,
  description: string,
  filedByRole: "tenant" | "landlord",
): Promise<DisputeAnalysis> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) return fallbackAnalysis("Gemini is not configured.");

  const prompt = [
    "You are assisting an admin mediating a landlord-tenant rental dispute in Bangladesh.",
    "Compare the filer's claim against the platform's stored evidence record below. Do not invent facts not present in the record.",
    'Return strict JSON: {"summary": string, "inconsistencies": string[], "suggestedSplit": string | null}.',
    '"summary" is 2-4 sentences describing what the evidence shows relative to the claim.',
    '"inconsistencies" lists specific, concrete mismatches between the claim and the record (e.g. a claimed non-payment on a date the record shows a logged payment). Empty array if none found.',
    '"suggestedSplit" is one short sentence proposing a starting-point responsibility split (e.g. "Landlord 30% / Tenant 70%, based on...") or null if the evidence is too thin to suggest one. This is explicitly a non-binding starting point, not a verdict — say so is not needed in the text itself, just keep the tone tentative.',
    "",
    `Dispute type: ${type}`,
    `Filed by: ${filedByRole}`,
    `Claim: ${description}`,
    "",
    `Property: "${bundle.listing.title}" — ${bundle.listing.area}, ${bundle.listing.city}, rent BDT ${bundle.listing.rent}, deposit BDT ${bundle.listing.deposit}`,
    `Tenant: ${bundle.tenant.name} · Landlord: ${bundle.landlord.name}`,
    bundle.agreement
      ? `Agreement (Ref ${bundle.agreement.reference}): ${bundle.agreement.durationMonths} months, ${bundle.agreement.startDate} to ${bundle.agreement.endDate}. Tenant signed: ${bundle.agreement.tenantSigned}. Landlord signed: ${bundle.agreement.landlordSigned}.`
      : "Agreement: none on file.",
    `Payments (${bundle.payments.length}): ${bundle.payments.map((p) => `${p.month} BDT ${p.amount} [${p.status}] on ${p.createdAt}`).join("; ") || "none logged"}`,
    `Maintenance requests (${bundle.maintenance.length}): ${bundle.maintenance.map((m) => `"${m.title}" [${m.status}]${m.isOverdue ? " OVERDUE" : ""} filed ${m.createdAt}${m.resolvedAt ? `, resolved ${m.resolvedAt}` : ""}`).join("; ") || "none filed"}`,
    `Flagged messages (${bundle.flaggedMessages.length}): ${bundle.flaggedMessages.map((m) => `[${m.senderRole}, ${m.createdAt}, flagged for: ${m.reason ?? "key term"}] "${m.body}"`).join("; ") || "none flagged"}`,
    `Activity timeline (${bundle.activity.length} events): ${bundle.activity.map((a) => `${a.createdAt} — ${a.summary}`).join("; ") || "no events"}`,
  ].join("\n");

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    const response = await model.generateContent(prompt);
    const text = response.response
      .text()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = analysisShapeSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      return fallbackAnalysis("AI returned an unexpected shape.");
    }
    return {
      summary: parsed.data.summary,
      inconsistencies: parsed.data.inconsistencies,
      suggestedSplit: parsed.data.suggestedSplit,
      source: "ai",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed.";
    const isRateLimit = message.includes("429");
    const isPermissionDenied = message.includes("403") || message.includes("PERMISSION_DENIED");
    return fallbackAnalysis(
      isRateLimit
        ? undefined
        : isPermissionDenied
          ? "Gemini access was denied for this API key's Google Cloud project."
          : message,
    );
  }
}
