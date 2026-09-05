import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

export const agreementTermsSchema = z.object({
  reference: z.string().min(1),
  landlordName: z.string(),
  landlordVerifiedSince: z.string(),
  tenantName: z.string(),
  tenantNid: z.string(),
  tenantPhone: z.string(),
  propertyTitle: z.string(),
  roomType: z.string(),
  area: z.string(),
  city: z.string(),
  coords: z.string(),
  rent: z.number(),
  deposit: z.number(),
  durationMonths: z.number(),
  startDate: z.string(),
  endDate: z.string(),
  houseRules: z.array(z.string()),
});

export type AgreementTerms = z.infer<typeof agreementTermsSchema>;

export type AgreementClause = { title: string; body: string };

const clauseItemSchema = z.object({ title: z.string(), body: z.string() });
const clauseListShapeSchema = z.object({ clauses: z.array(z.unknown()) });

function fallbackClauses(t: AgreementTerms): AgreementClause[] {
  const clauses: AgreementClause[] = [
    {
      title: "Parties",
      body: `This agreement is made between ${t.landlordName} (the "Landlord"), a rentFindr-verified property owner since ${t.landlordVerifiedSince}, and ${t.tenantName} (the "Tenant"), holder of National ID ${t.tenantNid}, contactable on ${t.tenantPhone}.`,
    },
    {
      title: "Premises",
      body: `The Landlord lets the ${t.roomType.toLowerCase()} described as "${t.propertyTitle}" at ${t.area}, ${t.city}, pinned at ${t.coords}.`,
    },
    {
      title: "Term",
      body: `The tenancy runs ${t.durationMonths} months from ${t.startDate} to ${t.endDate}, renewable by mutual written acknowledgement on the platform.`,
    },
    {
      title: "Rent and deposit",
      body: `Rent is BDT ${t.rent.toLocaleString("en-BD")} per month, payable by the 5th and logged on rentFindr. A refundable security deposit of BDT ${t.deposit.toLocaleString("en-BD")} is held and returned at final settlement, less documented deductions.`,
    },
  ];
  if (t.houseRules.length > 0) {
    clauses.push({ title: "House rules", body: `${t.houseRules.join("; ")}.` });
  }
  clauses.push({
    title: "Record of tenancy",
    body: "Every payment, maintenance request and message exchanged on the platform forms part of the tenancy record and may be relied on by either party in a dispute.",
  });
  return clauses;
}

export async function draftAgreementClauses(
  terms: AgreementTerms,
): Promise<{ clauses: AgreementClause[]; source: "ai" | "fallback"; error?: string }> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) {
    return {
      clauses: fallbackClauses(terms),
      source: "fallback",
      error: "Gemini is not configured.",
    };
  }

  const prompt = [
    "Draft the numbered clauses of a residential rental agreement for Bangladesh in plain, formal English.",
    "Return 6 to 9 clauses. Each clause has a short title (2-4 words) and a body of 2-4 sentences.",
    "Cover: parties, premises, term, rent and deposit, house rules (if any given), maintenance and repairs, termination and notice, dispute resolution using the platform record.",
    "Use only the facts below; never invent names, amounts or dates. Amounts are Bangladeshi Taka, written as 'BDT 9,500'.",
    "Do not use markdown, bullet points, or clause numbers inside the text.",
    "",
    `Reference: ${terms.reference}`,
    `Landlord: ${terms.landlordName} (rentFindr-verified since ${terms.landlordVerifiedSince})`,
    `Tenant: ${terms.tenantName}, National ID ${terms.tenantNid}, phone ${terms.tenantPhone}`,
    `Property: "${terms.propertyTitle}" — ${terms.roomType} at ${terms.area}, ${terms.city} (${terms.coords})`,
    `Monthly rent: BDT ${terms.rent.toLocaleString("en-BD")}, payable by the 5th`,
    `Security deposit: BDT ${terms.deposit.toLocaleString("en-BD")}, refundable`,
    `Term: ${terms.durationMonths} months, ${terms.startDate} to ${terms.endDate}`,
    ...(terms.houseRules.length > 0 ? [`House rules: ${terms.houseRules.join("; ")}`] : []),
    "Both parties acknowledge the agreement inside rentFindr, and the platform record of payments, maintenance requests and messages is admissible evidence in any dispute.",
  ].join("\n");

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    const response = await model.generateContent(
      `${prompt}\n\nReturn strict JSON in the form {"clauses":[{"title":"...","body":"..."}]}`,
    );
    const text = response.response
      .text()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const shapeParsed = clauseListShapeSchema.safeParse(JSON.parse(text));
    // Validate each clause independently rather than the whole array at once —
    // one malformed clause from Gemini shouldn't discard every other good one.
    const clauses = (shapeParsed.success ? shapeParsed.data.clauses : [])
      .map((c) => clauseItemSchema.safeParse(c))
      .filter((r): r is { success: true; data: AgreementClause } => r.success)
      .map((r) => r.data)
      .filter((c) => c.title && c.body)
      .slice(0, 12);
    if (clauses.length === 0) {
      return {
        clauses: fallbackClauses(terms),
        source: "fallback",
        error: "AI returned empty clauses.",
      };
    }
    return { clauses, source: "ai" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed.";
    // 429 (rate limit) is transient and expected under normal free-tier use — no need to alarm the user.
    // 403 (permission denied) means the underlying Google Cloud project itself has been blocked —
    // that's a persistent, actionable problem the user needs to know about, not routine noise.
    const isRateLimit = message.includes("429");
    const isPermissionDenied = message.includes("403") || message.includes("PERMISSION_DENIED");
    return {
      clauses: fallbackClauses(terms),
      source: "fallback",
      error: isRateLimit
        ? undefined
        : isPermissionDenied
          ? "Gemini access was denied for this API key's Google Cloud project — this needs to be resolved in Google AI Studio, not something the app can retry past."
          : message,
    };
  }
}
