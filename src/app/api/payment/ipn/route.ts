import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity.server";
import { finalizePayment } from "@/lib/payment.server";

async function markFailed(transactionId: string, reason: string) {
  const payment = await prisma.payment.findUnique({ where: { transactionId } });
  if (!payment || payment.status === "paid") return;
  await prisma.payment.update({ where: { transactionId }, data: { status: "failed" } });
  await logActivity({
    listingId: payment.listingId,
    tenantProfileId: payment.profileId,
    type: "payment_failed",
    actor: "system",
    summary: `Rent payment for ${payment.month} was not completed (${reason}).`,
    metadata: { transactionId },
  });
}

// SSLCOMMERZ's server-to-server IPN callback — the authoritative path in a real
// deployment. Trusts nothing from the posted form directly: a success status
// still goes through finalizePayment(), which re-validates with SSLCOMMERZ
// before marking anything paid.
export async function POST(request: Request) {
  const body = await request.formData().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const status = body.get("status") as string | null;
  const transactionId = body.get("tran_id") as string | null;
  const validationId = body.get("val_id") as string | null;

  if (!transactionId) return NextResponse.json({ error: "Missing tran_id" }, { status: 400 });

  try {
    if (status === "VALID" || status === "VALIDATED") {
      await finalizePayment(transactionId, validationId);
    } else {
      await markFailed(transactionId, status || "cancelled");
    }
  } catch (error) {
    console.error("payment IPN handling failed:", error);
    // Still ack with 200 — SSLCOMMERZ retries on non-2xx, and the browser
    // redirect path (GET, below) provides a second, independent chance to
    // finalize the same transactionId idempotently.
  }

  return NextResponse.json({ received: true });
}

// SSLCOMMERZ also redirects the tenant's browser to success/fail/cancel URLs.
// IPN webhooks can't reach a localhost dev server, so this redirect path also
// finalizes the payment when tran_id/val_id are present — same validated,
// idempotent finalizePayment() call, so it's safe even if IPN also fires.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const transactionId = searchParams.get("tran_id");
  const validationId = searchParams.get("val_id");

  if (status === "success" && transactionId) {
    await finalizePayment(transactionId, validationId).catch((error) =>
      console.error("finalizePayment (redirect) failed:", error),
    );
    return NextResponse.redirect(new URL("/profile?payment=success", request.url));
  }
  if (status === "fail") {
    if (transactionId) await markFailed(transactionId, "fail").catch(() => {});
    return NextResponse.redirect(new URL("/profile?payment=failed", request.url));
  }
  if (transactionId) await markFailed(transactionId, "cancelled").catch(() => {});
  return NextResponse.redirect(new URL("/profile?payment=cancelled", request.url));
}
