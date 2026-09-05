import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { bdt, formatDate } from "@/data/module1";
import type { AgreementTerms } from "@/lib/agreement.server";

type SharedRoommateProfileData = {
  budget: number;
  sleep: string;
  smoking: string;
  smokingNonNegotiable?: boolean;
  study: string;
  visitors: string;
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await prisma.shareLink.findUnique({ where: { token } });

  if (!link || link.revoked || link.expiresAt < new Date()) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <p className="eyebrow">Share link</p>
        <h1 className="mt-4 text-3xl">This link is no longer valid</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          It may have expired or been revoked by the sender.
        </p>
      </div>
    );
  }

  if (link.type === "agreement") {
    const draft = await prisma.agreementDraft.findUnique({ where: { id: link.resourceId } });
    if (!draft) notFound();
    const clauses = draft.clausesJson as { title: string; body: string }[];
    const terms = draft.termsJson as unknown as AgreementTerms;

    // Defends against pre-existing rows saved before termsJson had shape
    // validation at write time — malformed data here shouldn't crash a
    // public, unauthenticated page.
    if (typeof terms?.rent !== "number" || typeof terms?.deposit !== "number") {
      return (
        <div className="mx-auto max-w-2xl px-5 py-24 text-center">
          <p className="eyebrow">Share link</p>
          <h1 className="mt-4 text-3xl">This agreement can&apos;t be displayed</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Its saved data is incomplete. Ask the sender to regenerate and re-share it.
          </p>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <p className="eyebrow">Shared agreement · read-only</p>
        <h1 className="mt-4 text-3xl">Residential Rental Agreement</h1>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">Ref {draft.reference}</p>

        <div className="mt-8 grid gap-3 border border-border p-6 text-sm">
          {[
            ["Landlord", terms.landlordName],
            ["Tenant", terms.tenantName],
            ["Property", terms.propertyTitle],
            ["Rent", bdt(terms.rent) + " / month"],
            ["Deposit", bdt(terms.deposit)],
            ["Term", `${terms.durationMonths} months · ${terms.startDate} to ${terms.endDate}`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex justify-between gap-4 border-b border-border pb-2 last:border-0"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono text-xs">{value}</span>
            </div>
          ))}
        </div>

        <div className="mt-8 space-y-6">
          {clauses.map((c, i) => (
            <section key={i}>
              <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {String(i + 1).padStart(2, "0")} · {c.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed">{c.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-10 border-l-2 border-border pl-4 text-xs text-muted-foreground">
          This is a read-only view shared via rentFindr. Link expires{" "}
          {formatDate(link.expiresAt.toISOString())}.
        </p>
      </div>
    );
  }

  // roommate_session
  const session = await prisma.roommateSession.findUnique({ where: { id: link.resourceId } });
  if (!session) notFound();
  const results = session.results as {
    candidateId: string;
    score: number;
    breakdown: { label: string; value: number; weight: number }[];
  }[];
  const profileData = session.profileData as unknown as SharedRoommateProfileData;

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="eyebrow">Shared matching session · read-only</p>
      <h1 className="mt-4 text-3xl">{session.label}</h1>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        Saved {formatDate(session.createdAt.toISOString())}
      </p>

      <div className="mt-8 grid gap-3 border border-border p-6 text-sm">
        {[
          ["Budget", bdt(profileData.budget)],
          ["Sleep", profileData.sleep],
          [
            "Smoking",
            profileData.smoking + (profileData.smokingNonNegotiable ? " (non-negotiable)" : ""),
          ],
          ["Study", profileData.study],
          ["Visitors", profileData.visitors],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex justify-between gap-4 border-b border-border pb-2 last:border-0"
          >
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono text-xs">{value}</span>
          </div>
        ))}
      </div>

      <ul className="mt-8 space-y-px">
        {results.map((r, i) => (
          <li key={r.candidateId} className="border border-border p-6">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-mono text-2xl">{r.score}%</span>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {r.breakdown.map((p) => (
                <div key={p.label}>
                  <div className="flex justify-between text-xs">
                    <dt>{p.label}</dt>
                    <dd className="font-mono text-muted-foreground">
                      {Math.round(p.value * p.weight)}/{p.weight}
                    </dd>
                  </div>
                  <div className="mt-1 h-[3px] w-full bg-border">
                    <div
                      className="h-full bg-foreground"
                      style={{ width: `${Math.max(2, p.value * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <p className="mt-10 border-l-2 border-border pl-4 text-xs text-muted-foreground">
        This is a read-only view shared via rentFindr. Link expires{" "}
        {formatDate(link.expiresAt.toISOString())}.
      </p>
    </div>
  );
}
