import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  listingId: z.string(),
  amount: z.number().positive(),
  month: z.string(),
});

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: String(token.sub) },
    include: { profile: true },
  });
  if (!user?.profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const { listingId, amount, month } = parsed.data;

  // Only the accepted tenant on this listing can log rent for it — otherwise
  // the "tamper-evident" activity trail this feeds could be seeded with
  // payments from accounts that have no real tenancy on the listing.
  const tenancy = await prisma.application.findFirst({
    where: { profileId: user.profile.id, listingId, status: "accepted" },
  });
  if (!tenancy) {
    return NextResponse.json(
      { error: "You don't have an accepted tenancy on this listing." },
      { status: 403 },
    );
  }

  const storeId = process.env.SSLCOMMERZ_STORE_ID;
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD;
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  if (!storeId || !storePassword) {
    return NextResponse.json({ error: "SSLCOMMERZ not configured" }, { status: 503 });
  }

  const transactionId = `BK-${Date.now()}-${listingId}`;

  const params = new URLSearchParams({
    store_id: storeId,
    store_passwd: storePassword,
    total_amount: String(amount),
    currency: "BDT",
    tran_id: transactionId,
    success_url: `${baseUrl}/api/payment/ipn?status=success`,
    fail_url: `${baseUrl}/api/payment/ipn?status=fail`,
    cancel_url: `${baseUrl}/api/payment/ipn?status=cancel`,
    ipn_url: `${baseUrl}/api/payment/ipn`,
    product_name: `Rent for listing ${listingId}`,
    product_category: "Rent",
    product_profile: "general",
    cus_name: String(token.name ?? "Tenant"),
    cus_email: String(token.email ?? ""),
    cus_add1: "Dhaka",
    cus_city: "Dhaka",
    cus_country: "Bangladesh",
    cus_phone: "01700000000",
    shipping_method: "NO",
    num_of_item: "1",
    weight_of_items: "0",
    logistic_pickup_id: "0",
    product_amount: String(amount),
    vat: "0",
    discount_amount: "0",
    convenience_fee: "0",
  });

  const sslRes = await fetch("https://sandbox.sslcommerz.com/gwprocess/v4/api.php", {
    method: "POST",
    body: params,
  });

  const sslData = (await sslRes.json()) as { status: string; GatewayPageURL?: string };

  if (sslData.status !== "SUCCESS" || !sslData.GatewayPageURL) {
    return NextResponse.json({ error: "Payment gateway error" }, { status: 502 });
  }

  // Log the pending payment in DB
  await prisma.payment.create({
    data: {
      transactionId,
      listingId,
      profileId: user.profile.id,
      amount,
      month,
      status: "pending",
    },
  });

  return NextResponse.json({ url: sslData.GatewayPageURL, transactionId });
}
