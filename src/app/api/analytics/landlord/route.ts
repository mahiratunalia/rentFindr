import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getLandlordAnalytics } from "@/lib/analytics.server";

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const analytics = await getLandlordAnalytics(String(token.sub));
  return NextResponse.json(analytics);
}
