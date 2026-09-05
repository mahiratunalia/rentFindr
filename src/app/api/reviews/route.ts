import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  LANDLORD_REVIEW_CATEGORIES,
  TENANT_REVIEW_CATEGORIES,
  overallFromCategories,
} from "@/lib/reviews";

const landlordCategorySchema = z.object(
  Object.fromEntries(
    LANDLORD_REVIEW_CATEGORIES.map((c) => [c.key, z.number().int().min(1).max(5)]),
  ) as Record<(typeof LANDLORD_REVIEW_CATEGORIES)[number]["key"], z.ZodNumber>,
);
const tenantCategorySchema = z.object(
  Object.fromEntries(
    TENANT_REVIEW_CATEGORIES.map((c) => [c.key, z.number().int().min(1).max(5)]),
  ) as Record<(typeof TENANT_REVIEW_CATEGORIES)[number]["key"], z.ZodNumber>,
);

const createSchema = z.object({
  applicationId: z.string().min(1),
  categoryRatings: z.record(z.string(), z.number()),
  comment: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const applicationId = request.nextUrl.searchParams.get("applicationId");
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { listing: true, profile: true },
  });
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  const userId = String(token.sub);
  const isTenant = application.profile.userId === userId;
  const isLandlord = application.listing.landlordId === userId;
  if (!isTenant && !isLandlord) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reviews = await prisma.review.findMany({
    where: { applicationId },
    include: { raterProfile: { select: { displayName: true } } },
  });

  return NextResponse.json(
    reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      categoryRatings: r.categoryRatings,
      createdAt: r.createdAt,
      raterIsTenant: r.raterProfileId === application.profileId,
      raterName: r.raterProfile.displayName,
    })),
  );
}

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid review" }, { status: 400 });

  const application = await prisma.application.findUnique({
    where: { id: parsed.data.applicationId },
    include: { listing: true, profile: true },
  });
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  const userId = String(token.sub);
  const isTenant = application.profile.userId === userId;
  const isLandlord = application.listing.landlordId === userId;
  if (!isTenant && !isLandlord) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (application.status !== "completed") {
    return NextResponse.json(
      { error: "Reviews unlock once this tenancy has ended." },
      { status: 409 },
    );
  }

  const raterProfileId = isTenant
    ? application.profileId
    : (await prisma.profile.findUnique({ where: { userId } }))?.id;
  if (!raterProfileId) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // A tenant rates the landlord, so their categories are the landlord set,
  // and vice versa — reject the wrong category set outright rather than
  // silently accepting mismatched keys.
  const categorySchema = isTenant ? landlordCategorySchema : tenantCategorySchema;
  const categoryParsed = categorySchema.safeParse(parsed.data.categoryRatings);
  if (!categoryParsed.success) {
    return NextResponse.json({ error: "Invalid category ratings for this role." }, { status: 400 });
  }

  try {
    const review = await prisma.review.create({
      data: {
        applicationId: application.id,
        raterProfileId,
        rating: overallFromCategories(categoryParsed.data),
        comment: parsed.data.comment,
        categoryRatings: categoryParsed.data,
      },
    });
    return NextResponse.json(review, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "You've already reviewed this tenancy." }, { status: 409 });
    }
    throw err;
  }
}
