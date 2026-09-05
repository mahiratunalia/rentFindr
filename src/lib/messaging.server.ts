import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

export type MessageFlag = { flagged: boolean; reason: string | null };

const flagShapeSchema = z.object({
  flagged: z.boolean(),
  reason: z.string().nullable(),
});

/**
 * Best-effort key-term scan — a message send must never fail or block just
 * because Gemini is slow/unconfigured/erroring, so any failure here quietly
 * resolves to "not flagged" rather than surfacing an error to the sender.
 */
export async function flagMessage(body: string): Promise<MessageFlag> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) return { flagged: false, reason: null };

  const prompt = [
    "You are scanning a single message sent between a landlord and a tenant on a Bangladeshi rental platform.",
    "Flag it only if it contains one of: an implied or explicit rent change, a move-out notice or stated intent to vacate, or a payment promise/commitment (e.g. paying by a specific date).",
    "Do not flag ordinary conversation, questions, or small talk.",
    'Return strict JSON: {"flagged": boolean, "reason": string | null}.',
    '"reason" is a short (under 12 words) description of what was flagged, or null if not flagged.',
    "",
    `Message: "${body}"`,
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
    const parsed = flagShapeSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return { flagged: false, reason: null };
    return parsed.data;
  } catch {
    return { flagged: false, reason: null };
  }
}
