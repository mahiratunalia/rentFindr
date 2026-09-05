import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

// Every value interpolated into an email template below is user-controlled
// (display names, comments, message bodies, admin resolution text) — escape
// unconditionally rather than trust any of it not to contain markup.
function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendEmail(payload: EmailPayload) {
  if (!process.env.GMAIL_EMAIL || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("Gmail not configured — skipping email:", payload.subject);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"rentFindr" <${process.env.GMAIL_EMAIL}>`,
      ...payload,
    });
  } catch (error) {
    console.error("sendEmail failed:", payload.subject, error);
  }
}

export function agreementDeliveryEmail(to: string, tenantName: string, reference: string) {
  const name = escapeHtml(tenantName);
  const ref = escapeHtml(reference);
  return sendEmail({
    to,
    subject: `Your rental agreement is ready — Ref ${reference}`,
    html: `<p>Hi ${name},</p><p>Your rental agreement (Ref: <strong>${ref}</strong>) has been generated and acknowledged on rentFindr. Please log in to download your signed PDF.</p><p>— rentFindr</p>`,
  });
}

export function paymentReceiptEmail(to: string, tenantName: string, amount: number, month: string) {
  const name = escapeHtml(tenantName);
  const monthEsc = escapeHtml(month);
  return sendEmail({
    to,
    subject: `Payment receipt — ৳${amount.toLocaleString("en-BD")} for ${month}`,
    html: `<p>Hi ${name},</p><p>Your rent payment of <strong>৳${amount.toLocaleString("en-BD")}</strong> for <strong>${monthEsc}</strong> has been logged on rentFindr.</p><p>— rentFindr</p>`,
  });
}

export function paymentConfirmationEmailForLandlord(
  to: string,
  landlordName: string,
  tenantName: string,
  amount: number,
  month: string,
) {
  const landlord = escapeHtml(landlordName);
  const tenant = escapeHtml(tenantName);
  const monthEsc = escapeHtml(month);
  return sendEmail({
    to,
    subject: `Rent received — ৳${amount.toLocaleString("en-BD")} from ${tenantName} for ${month}`,
    html: `<p>Hi ${landlord},</p><p><strong>${tenant}</strong> has paid <strong>৳${amount.toLocaleString("en-BD")}</strong> in rent for <strong>${monthEsc}</strong>. This payment has been logged on rentFindr and added to the tenancy's activity timeline.</p><p>— rentFindr</p>`,
  });
}

export function disputeNotificationEmail(to: string, name: string, disputeId: string) {
  const nameEsc = escapeHtml(name);
  const id = escapeHtml(disputeId);
  return sendEmail({
    to,
    subject: `Dispute filed — Ref ${disputeId}`,
    html: `<p>Hi ${nameEsc},</p><p>A dispute (Ref: <strong>${id}</strong>) has been filed on your tenancy. Log in to rentFindr to review the evidence and respond.</p><p>— rentFindr</p>`,
  });
}

export function disputeFiledConfirmationEmail(to: string, name: string, disputeId: string) {
  const nameEsc = escapeHtml(name);
  const id = escapeHtml(disputeId);
  return sendEmail({
    to,
    subject: `Your dispute has been filed — Ref ${disputeId}`,
    html: `<p>Hi ${nameEsc},</p><p>Your dispute (Ref: <strong>${id}</strong>) has been filed on rentFindr. We've bundled the agreement, payment history, and maintenance timeline for this tenancy for admin review. You'll be notified by email once it's resolved.</p><p>— rentFindr</p>`,
  });
}

export function disputeResolvedEmail(
  to: string,
  name: string,
  disputeId: string,
  resolution: string,
) {
  const nameEsc = escapeHtml(name);
  const id = escapeHtml(disputeId);
  const resolutionEsc = escapeHtml(resolution);
  return sendEmail({
    to,
    subject: `Dispute resolved — Ref ${disputeId}`,
    html: `<p>Hi ${nameEsc},</p><p>An admin has issued a resolution for dispute Ref <strong>${id}</strong>:</p><blockquote style="border-left:2px solid #ccc;margin:8px 0;padding-left:12px;">${resolutionEsc}</blockquote><p>Log in to rentFindr to view the full evidence record.</p><p>— rentFindr</p>`,
  });
}

export function expiryReminderEmail(to: string, tenantName: string, endDate: string) {
  const name = escapeHtml(tenantName);
  const date = escapeHtml(endDate);
  return sendEmail({
    to,
    subject: `Your tenancy expires on ${endDate}`,
    html: `<p>Hi ${name},</p><p>This is a reminder that your tenancy agreement expires on <strong>${date}</strong>. Please log in to rentFindr to renew or arrange a move-out.</p><p>— rentFindr</p>`,
  });
}

export function moveOutProposedEmail(
  to: string,
  tenantName: string,
  listingTitle: string,
  endDateLabel: string,
) {
  const name = escapeHtml(tenantName);
  const listing = escapeHtml(listingTitle);
  const date = escapeHtml(endDateLabel);
  return sendEmail({
    to,
    subject: `Move-out proposed — ${listingTitle}`,
    html: `<p>Hi ${name},</p><p>Your landlord has proposed ending your tenancy at <strong>${listing}</strong> on <strong>${date}</strong>. Log in to ঠিকানা to acknowledge the date and review your settlement.</p><p>— ঠিকানা</p>`,
  });
}

export function settlementFinalizedEmail(
  to: string,
  name: string,
  listingTitle: string,
  totalRentPaid: number,
  depositAmount: number,
  netRefund: number,
  refundReference: string,
) {
  const nameEsc = escapeHtml(name);
  const listing = escapeHtml(listingTitle);
  const ref = escapeHtml(refundReference);
  return sendEmail({
    to,
    subject: `Move-out settlement finalized — ${listingTitle}`,
    html: `<p>Hi ${nameEsc},</p><p>The tenancy at <strong>${listing}</strong> has been settled. Summary:</p><ul><li>Total rent paid: ৳${totalRentPaid.toLocaleString("en-BD")}</li><li>Security deposit: ৳${depositAmount.toLocaleString("en-BD")}</li><li>Net refund: <strong>৳${netRefund.toLocaleString("en-BD")}</strong></li></ul><p>Refund logged (Ref: <strong>${ref}</strong>). Log in to ঠিকানা for the full breakdown, including any itemized deductions.</p><p>— ঠিকানা</p>`,
  });
}

export function listingVacantEmail(to: string, landlordName: string, listingTitle: string) {
  const name = escapeHtml(landlordName);
  const listing = escapeHtml(listingTitle);
  return sendEmail({
    to,
    subject: `Your listing is vacant — ${listingTitle}`,
    html: `<p>Hi ${name},</p><p><strong>${listing}</strong> is now vacant following a completed move-out. It's ready to be reactivated for new applicants.</p><p>— ঠিকানা</p>`,
  });
}

export function rentDueReminderEmail(
  to: string,
  tenantName: string,
  listingTitle: string,
  monthLabel: string,
) {
  const name = escapeHtml(tenantName);
  const listing = escapeHtml(listingTitle);
  const month = escapeHtml(monthLabel);
  return sendEmail({
    to,
    subject: `Rent due soon — ${listingTitle}`,
    html: `<p>Hi ${name},</p><p>Your rent for <strong>${listing}</strong> for <strong>${month}</strong> is due in 3 days. Log in to ঠিকানা to log your payment.</p><p>— ঠিকানা</p>`,
  });
}

export function maintenanceFiledEmail(
  to: string,
  landlordName: string,
  requestTitle: string,
  listingTitle: string,
) {
  const landlord = escapeHtml(landlordName);
  const title = escapeHtml(requestTitle);
  const listing = escapeHtml(listingTitle);
  return sendEmail({
    to,
    subject: `New maintenance request — ${listingTitle}`,
    html: `<p>Hi ${landlord},</p><p>A new maintenance request has been filed on <strong>${listing}</strong>: &ldquo;${title}&rdquo;. Please log in to rentFindr to review and respond.</p><p>— rentFindr</p>`,
  });
}

export function maintenanceStatusEmail(
  to: string,
  tenantName: string,
  requestTitle: string,
  status: string,
  listingTitle: string,
) {
  const name = escapeHtml(tenantName);
  const title = escapeHtml(requestTitle);
  const listing = escapeHtml(listingTitle);
  const statusLabel = escapeHtml(status.replace("_", " "));
  return sendEmail({
    to,
    subject: `Maintenance request update — ${requestTitle}`,
    html: `<p>Hi ${name},</p><p>Your maintenance request &ldquo;${title}&rdquo; on <strong>${listing}</strong> is now <strong>${statusLabel}</strong>.</p><p>— rentFindr</p>`,
  });
}

export function verificationApprovedEmail(to: string, name: string, role: "landlord" | "tenant") {
  const nameEsc = escapeHtml(name);
  return sendEmail({
    to,
    subject: "You're verified on rentFindr",
    html: `<p>Hi ${nameEsc},</p><p>An admin has reviewed your submitted documents and approved your ${role} verification. Your verified badge is now live on rentFindr${role === "landlord" ? ", and any draft listings you had have been published as Active" : ""}.</p><p>— rentFindr</p>`,
  });
}

export function verificationRejectedEmail(
  to: string,
  name: string,
  role: "landlord" | "tenant",
  reviewNote?: string | null,
) {
  const nameEsc = escapeHtml(name);
  return sendEmail({
    to,
    subject: "Your rentFindr verification was not approved",
    html: `<p>Hi ${nameEsc},</p><p>An admin reviewed your submitted ${role} verification documents and was not able to approve them${reviewNote ? `:</p><blockquote style="border-left:2px solid #ccc;margin:8px 0;padding-left:12px;">${escapeHtml(reviewNote)}</blockquote><p>` : ". "}Please log in to rentFindr to review and resubmit.</p><p>— rentFindr</p>`,
  });
}

export function newMessageEmail(
  to: string,
  name: string,
  senderName: string,
  listingTitle: string,
) {
  const nameEsc = escapeHtml(name);
  const sender = escapeHtml(senderName);
  const listing = escapeHtml(listingTitle);
  return sendEmail({
    to,
    subject: `New message — ${listingTitle}`,
    html: `<p>Hi ${nameEsc},</p><p><strong>${sender}</strong> sent you a new message on rentFindr about <strong>${listing}</strong>. Log in to read and reply.</p><p>— rentFindr</p>`,
  });
}
