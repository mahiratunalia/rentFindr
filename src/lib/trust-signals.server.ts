import { prisma } from "@/lib/prisma";
import type { TrustSignals } from "@/lib/trust-signals";

export type { TrustSignals };

// Walks a thread's messages in order and measures, for each time the
// counterparty spoke, whether/how fast this profile's role sent the next
// message — i.e. first-response latency per conversational turn, not every
// individual message (a run of follow-up messages from the same side would
// otherwise skew the average).
function responseSignalsFromMessages(
  messages: { applicationId: string; senderRole: string; createdAt: Date }[],
  ownRole: "tenant" | "landlord",
): { avgResponseHours: number | null; responseRate: number | null } {
  const byThread = new Map<string, { senderRole: string; createdAt: Date }[]>();
  for (const m of messages) {
    const list = byThread.get(m.applicationId);
    if (list) list.push(m);
    else byThread.set(m.applicationId, [m]);
  }

  let turns = 0;
  let repliedTurns = 0;
  const latenciesHours: number[] = [];

  for (const thread of byThread.values()) {
    let waitingSince: Date | null = null;
    for (const m of thread) {
      if (m.senderRole !== ownRole) {
        if (!waitingSince) {
          waitingSince = m.createdAt;
          turns += 1;
        }
      } else if (waitingSince) {
        repliedTurns += 1;
        latenciesHours.push((m.createdAt.getTime() - waitingSince.getTime()) / 3_600_000);
        waitingSince = null;
      }
    }
  }

  return {
    avgResponseHours:
      latenciesHours.length > 0
        ? Math.round((latenciesHours.reduce((a, b) => a + b, 0) / latenciesHours.length) * 10) / 10
        : null,
    responseRate: turns > 0 ? Math.round((repliedTurns / turns) * 100) : null,
  };
}

export async function getTenantTrustSignals(profileId: string): Promise<TrustSignals> {
  const [profile, completedRentals, applicationIds] = await Promise.all([
    prisma.profile.findUnique({ where: { id: profileId }, select: { lastActiveAt: true } }),
    prisma.application.count({ where: { profileId, status: "completed" } }),
    prisma.application.findMany({ where: { profileId }, select: { id: true } }),
  ]);

  const messages = await prisma.message.findMany({
    where: { applicationId: { in: applicationIds.map((a) => a.id) } },
    orderBy: { createdAt: "asc" },
    select: { applicationId: true, senderRole: true, createdAt: true },
  });
  const { avgResponseHours, responseRate } = responseSignalsFromMessages(messages, "tenant");

  return {
    completedRentals,
    avgResponseHours,
    responseRate,
    lastActiveAt: profile?.lastActiveAt?.toISOString() ?? null,
  };
}

export async function getLandlordTrustSignals(
  profileId: string,
  landlordUserId: string,
): Promise<TrustSignals> {
  const [profile, completedRentals, applicationIds] = await Promise.all([
    prisma.profile.findUnique({ where: { id: profileId }, select: { lastActiveAt: true } }),
    prisma.application.count({
      where: { status: "completed", listing: { landlordId: landlordUserId } },
    }),
    prisma.application.findMany({
      where: { listing: { landlordId: landlordUserId } },
      select: { id: true },
    }),
  ]);

  const messages = await prisma.message.findMany({
    where: { applicationId: { in: applicationIds.map((a) => a.id) } },
    orderBy: { createdAt: "asc" },
    select: { applicationId: true, senderRole: true, createdAt: true },
  });
  const { avgResponseHours, responseRate } = responseSignalsFromMessages(messages, "landlord");

  return {
    completedRentals,
    avgResponseHours,
    responseRate,
    lastActiveAt: profile?.lastActiveAt?.toISOString() ?? null,
  };
}
