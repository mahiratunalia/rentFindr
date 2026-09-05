import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const MAX_FILE_CHARS = 2_200_000; // ~1.6MB raw, base64-inflated — matches the register/listing-photo convention

const createSchema = z.object({
  type: z.enum(["utility_bill", "sublet_agreement"]),
  label: z.string().min(1).max(120),
  fileUrl: z.string().min(1).max(MAX_FILE_CHARS),
});

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { userId: String(token.sub) } });
  if (!profile) return NextResponse.json({ error: "No profile found" }, { status: 404 });

  const documents = await prisma.landlordDocument.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(documents);
}

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (token.role !== "LANDLORD")
    return NextResponse.json({ error: "Landlord accounts only" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const profile = await prisma.profile.findUnique({
    where: { userId: String(token.sub) },
    include: { landlordVerification: true },
  });
  if (!profile) return NextResponse.json({ error: "No profile found" }, { status: 404 });
  if (profile.landlordVerification?.status !== "verified") {
    return NextResponse.json(
      { error: "Only verified landlords can upload documents for tenant inspection." },
      { status: 403 },
    );
  }

  const document = await prisma.landlordDocument.create({
    data: {
      profileId: profile.id,
      type: parsed.data.type,
      label: parsed.data.label,
      fileUrl: parsed.data.fileUrl,
    },
  });
  return NextResponse.json(document);
}
