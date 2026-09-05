import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { extractInviteCode } from "@/lib/admin-invite";

const MAX_PHOTO_CHARS = 2_200_000; // ~1.6MB raw, base64-inflated

const baseSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1).max(100),
  accountType: z.enum(["tenant", "landlord"]),
  requestAdmin: z.boolean().optional(),
  adminCode: z.string().optional(),
});

const landlordFieldsSchema = z.object({
  nidNumber: z.string().min(5).max(30),
  phone: z.string().min(6).max(20),
  propertyAddress: z.string().min(5).max(300),
  nidPhoto: z.string().min(1).max(MAX_PHOTO_CHARS),
  ownershipProof: z.string().min(1).max(MAX_PHOTO_CHARS),
  selfiePhoto: z.string().min(1).max(MAX_PHOTO_CHARS),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedBase = baseSchema.safeParse(body);
  if (!parsedBase.success) {
    return NextResponse.json({ error: "Invalid registration payload." }, { status: 400 });
  }

  let landlordFields: z.infer<typeof landlordFieldsSchema> | null = null;
  if (parsedBase.data.accountType === "landlord") {
    const parsedLandlord = landlordFieldsSchema.safeParse(body);
    if (!parsedLandlord.success) {
      return NextResponse.json(
        {
          error:
            "Landlord accounts require NID number, phone, property address, both document photos, and a selfie with your NID.",
        },
        { status: 400 },
      );
    }
    landlordFields = parsedLandlord.data;
  }

  let role: "TENANT" | "LANDLORD" | "ADMIN" =
    parsedBase.data.accountType === "landlord" ? "LANDLORD" : "TENANT";
  let claimedInviteId: string | null = null;
  if (parsedBase.data.requestAdmin) {
    const code = parsedBase.data.adminCode ? extractInviteCode(parsedBase.data.adminCode) : "";
    const staticCode = process.env.ADMIN_SIGNUP_CODE;
    const isStaticMatch = !!code && !!staticCode && code === staticCode;

    if (!isStaticMatch && code) {
      // Claim atomically in the same statement that checks validity — an
      // `updateMany` guarded by `usedAt: null` can only ever succeed for one
      // concurrent request, unlike a separate findUnique-then-later-update,
      // which lets two simultaneous requests both pass the check and both
      // mint an admin account off a single-use invite.
      const claim = await prisma.adminInvite.updateMany({
        where: { code, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date(), usedByEmail: parsedBase.data.email },
      });
      if (claim.count === 1) {
        const invite = await prisma.adminInvite.findUnique({ where: { code } });
        claimedInviteId = invite?.id ?? null;
      }
    }

    if (!isStaticMatch && !claimedInviteId) {
      return NextResponse.json({ error: "Invalid or expired admin invite code." }, { status: 403 });
    }
    role = "ADMIN";
  }

  const existing = await prisma.user.findUnique({ where: { email: parsedBase.data.email } });
  if (existing) {
    if (claimedInviteId) {
      // Release the invite we just claimed — this request isn't going to use it.
      await prisma.adminInvite.update({
        where: { id: claimedInviteId },
        data: { usedAt: null, usedByEmail: null },
      });
    }
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  let user: { id: string; email: string };
  try {
    user = await prisma.user.create({
      data: {
        email: parsedBase.data.email,
        name: parsedBase.data.displayName,
        passwordHash: await hash(parsedBase.data.password, 10),
        role,
        profile: {
          create: {
            displayName: parsedBase.data.displayName,
            accountType: parsedBase.data.accountType,
            ...(landlordFields
              ? {
                  landlordVerification: {
                    create: {
                      nidNumber: landlordFields.nidNumber,
                      phone: landlordFields.phone,
                      propertyAddress: landlordFields.propertyAddress,
                      nidPhotoUrl: landlordFields.nidPhoto,
                      ownershipProofUrl: landlordFields.ownershipProof,
                      selfiePhotoUrl: landlordFields.selfiePhoto,
                      status: "pending",
                    },
                  },
                }
              : {}),
          },
        },
      },
      select: { id: true, email: true },
    });
  } catch (err) {
    if (claimedInviteId) {
      await prisma.adminInvite.update({
        where: { id: claimedInviteId },
        data: { usedAt: null, usedByEmail: null },
      });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Lost a race against a concurrent registration for the same email.
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }
    throw err;
  }

  return NextResponse.json({ user });
}
