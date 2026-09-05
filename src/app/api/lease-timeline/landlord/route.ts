import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getLandlordLeaseTimelines } from "@/lib/lease-timeline.server";

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await getLandlordLeaseTimelines(String(token.sub));
  return NextResponse.json(items);
}
