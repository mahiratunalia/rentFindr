// Pure date math, no Prisma/API of its own — per the Interactive Lease
// Timeline spec, this is purely derived from existing agreement data. Shared
// with src/lib/reminders.server.ts (Vacancy & Agreement Expiry Notification
// System) so both features compute the exact same lease end date from the
// exact same inputs, rather than two copies that could quietly drift apart.
export function computeLeaseEndDate(availableFrom: Date, durationMonths: number): Date {
  const end = new Date(availableFrom);
  end.setMonth(end.getMonth() + durationMonths);
  return end;
}

// Matches the 30-day reminder threshold in reminders.server.ts — the
// "renewal-decision window" is defined as the same stretch that already
// triggers the first expiry email, not a separate, disconnected concept.
export const RENEWAL_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type LeaseTimeline = {
  moveInDate: string;
  endDate: string;
  totalDays: number;
  elapsedDays: number;
  elapsedPercent: number;
  daysRemaining: number;
  renewalWindowStart: string;
  renewalWindowPercent: number;
  inRenewalWindow: boolean;
  isExpired: boolean;
};

export function computeLeaseTimeline(
  availableFrom: Date,
  durationMonths: number,
  now: Date = new Date(),
): LeaseTimeline {
  const endDate = computeLeaseEndDate(availableFrom, durationMonths);
  const totalMs = Math.max(1, endDate.getTime() - availableFrom.getTime());
  const elapsedMs = now.getTime() - availableFrom.getTime();
  const renewalWindowStart = new Date(endDate.getTime() - RENEWAL_WINDOW_DAYS * DAY_MS);

  return {
    moveInDate: availableFrom.toISOString(),
    endDate: endDate.toISOString(),
    totalDays: Math.round(totalMs / DAY_MS),
    elapsedDays: Math.round(elapsedMs / DAY_MS),
    elapsedPercent: Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100))),
    daysRemaining: Math.round((endDate.getTime() - now.getTime()) / DAY_MS),
    renewalWindowStart: renewalWindowStart.toISOString(),
    renewalWindowPercent: Math.min(
      100,
      Math.max(
        0,
        Math.round(((renewalWindowStart.getTime() - availableFrom.getTime()) / totalMs) * 100),
      ),
    ),
    inRenewalWindow: now >= renewalWindowStart && now <= endDate,
    isExpired: now > endDate,
  };
}
