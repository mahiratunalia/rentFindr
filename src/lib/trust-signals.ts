// Pure, Prisma-free types/helpers shared between server aggregation
// (trust-signals.server.ts) and client components — kept out of the
// `.server.ts` file so client components can import them without pulling
// Prisma into the browser bundle.

export type TrustSignals = {
  completedRentals: number;
  avgResponseHours: number | null;
  responseRate: number | null;
  lastActiveAt: string | null;
};

export function formatLastActive(iso: string | null): string {
  if (!iso) return "No activity yet";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffHours = diffMs / 3_600_000;
  if (diffHours < 1) return "Active just now";
  if (diffHours < 24) return `Active ${Math.round(diffHours)}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `Active ${diffDays}d ago`;
  return `Last active ${new Date(iso).toLocaleDateString()}`;
}
