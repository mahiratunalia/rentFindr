export const MAINTENANCE_SLA_HOURS = 48;

export function isOverdue(status: string, createdAt: Date | string): boolean {
  if (status === "resolved") return false;
  const deadline = new Date(createdAt).getTime() + MAINTENANCE_SLA_HOURS * 60 * 60 * 1000;
  return Date.now() > deadline;
}
