import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { agreementDeliveryEmail } from "@/lib/gmail.server";

const schema = z.object({ reference: z.string() });

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: String(token.sub) } });
  if (!user?.email) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await agreementDeliveryEmail(user.email, user.name ?? "Tenant", parsed.data.reference);
  return NextResponse.json({ ok: true });
}
