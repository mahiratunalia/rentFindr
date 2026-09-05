import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getLandlordTrustSignals } from "@/lib/trust-signals.server";

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { userId: String(token.sub) } });
  if (!profile) return NextResponse.json({ error: "No profile found" }, { status: 404 });

  const signals = await getLandlordTrustSignals(profile.id, String(token.sub));
  return NextResponse.json(signals);
}
