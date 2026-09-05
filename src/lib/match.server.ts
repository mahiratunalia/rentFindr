import { GoogleGenerativeAI } from "@google/generative-ai";
import type { MatchPreference, MatchResult, MatchableListing } from "@/lib/match";

export type GeocodeResult = { lat: number; lng: number; displayName: string } | null;

/**
 * Nominatim (OpenStreetMap) geocoding — free, no API key, but its usage
 * policy requires a descriptive User-Agent and forbids unattended bulk
 * lookups. Called once per preference save (a tenant typing their commute
 * anchor), never per-listing or per-search, so it stays well within that.
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${query}, Dhaka, Bangladesh`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Thikana/1.0 (CSE471 student project)" },
    });
    if (!res.ok) return null;
    const results = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    const first = results[0];
    if (!first) return null;
    return { lat: Number(first.lat), lng: Number(first.lon), displayName: first.display_name };
  } catch (error) {
    console.error("Nominatim geocode failed:", error);
    return null;
  }
}

function fallbackExplanation(result: MatchResult): string {
  if (result.hardBlocked) {
    return `Not a match — ${result.blockReason}.`;
  }
  return result.parts.map((p) => p.detail).join("; ") + ".";
}

/**
 * The score itself is entirely deterministic (matchScore() in match.ts) —
 * Gemini only phrases the one-sentence "why" underneath it, never touches
 * the number. Same fallback-on-any-failure posture as every other AI call
 * in this codebase.
 */
export async function explainMatch(
  pref: MatchPreference,
  listing: MatchableListing & { title: string; area: string },
  result: MatchResult,
): Promise<{ explanation: string; source: "ai" | "fallback" }> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) return { explanation: fallbackExplanation(result), source: "fallback" };

  const prompt = [
    "Write one short, plain-English sentence (under 25 words) explaining why this rental listing does or doesn't match a tenant's preferences.",
    "Use only the facts given below — don't invent anything. Be specific and concrete, not generic.",
    "",
    `Listing: "${listing.title}" — ${listing.area}, ${listing.roomType}, ৳${listing.rent}/month`,
    `Deal-breaker: ${result.hardBlocked ? result.blockReason : "none"}`,
    ...result.parts.map((p) => `${p.label}: ${p.detail}`),
    `Overall match: ${result.total}%`,
  ].join("\n");

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    const response = await model.generateContent(prompt);
    const text = response.response.text().trim();
    if (!text) return { explanation: fallbackExplanation(result), source: "fallback" };
    return { explanation: text, source: "ai" };
  } catch (error) {
    console.error("explainMatch Gemini call failed:", error);
    return { explanation: fallbackExplanation(result), source: "fallback" };
  }
}
