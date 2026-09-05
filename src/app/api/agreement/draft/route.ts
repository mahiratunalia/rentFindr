import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { authOptions } from "@/auth";
import { draftAgreementClauses, agreementTermsSchema } from "@/lib/agreement.server";

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: authOptions.secret });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = agreementTermsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid agreement terms." }, { status: 400 });
  }

  const result = await draftAgreementClauses(parsed.data);
  return NextResponse.json(result);
}
