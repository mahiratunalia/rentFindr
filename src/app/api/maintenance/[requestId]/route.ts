import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOverdue } from "@/lib/maintenance";
import { maintenanceStatusEmail } from "@/lib/gmail.server";

const schema = z.object({
  status: z.enum(["acknowledged", "in_progress", "resolved"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { requestId } = await params;
  const maintenanceRequest = await prisma.maintenanceRequest.findUnique({
    where: { id: requestId },
    include: { application: { include: { listing: true, profile: true } } },
  });
  if (!maintenanceRequest) {
    return NextResponse.json({ error: "Maintenance request not found" }, { status: 404 });
  }
  if (maintenanceRequest.application.listing.landlordId !== String(token.sub)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const timestampField =
    parsed.data.status === "acknowledged"
      ? "acknowledgedAt"
      : parsed.data.status === "in_progress"
        ? "inProgressAt"
        : "resolvedAt";

  const updated = await prisma.maintenanceRequest.update({
    where: { id: requestId },
    data: { status: parsed.data.status, [timestampField]: new Date() },
  });

  const tenant = await prisma.user.findUnique({
    where: { id: maintenanceRequest.application.profile.userId },
  });
  if (tenant?.email) {
    await maintenanceStatusEmail(
      tenant.email,
      maintenanceRequest.application.profile.displayName,
      updated.title,
      updated.status,
      maintenanceRequest.application.listing.title,
    ).catch(() => {});
  }

  return NextResponse.json({ ...updated, isOverdue: isOverdue(updated.status, updated.createdAt) });
}
