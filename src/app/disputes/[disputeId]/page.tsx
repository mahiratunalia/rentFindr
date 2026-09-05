"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ActivityTimeline, type ActivityEventItem } from "@/components/activity-timeline";
import { DISPUTE_TYPE_LABEL as typeLabel } from "@/lib/disputes";

type Evidence = {
  application: { id: string; status: string; createdAt: string };
  listing: { id: string; title: string; area: string; city: string; rent: number; deposit: number };
  tenant: { name: string };
  landlord: { name: string };
  agreement: {
    reference: string;
    durationMonths: number;
    startDate: string;
    endDate: string;
    tenantSigned: boolean;
    landlordSigned: boolean;
  } | null;
  payments: { month: string; amount: number; status: string; createdAt: string }[];
  maintenance: {
    title: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
    isOverdue: boolean;
    photoUrl: string | null;
  }[];
  activity: { type: string; actor: string; summary: string; createdAt: string }[];
  flaggedMessages?: {
    senderRole: string;
    body: string;
    reason: string | null;
    createdAt: string;
  }[];
};

type DisputeDetail = {
  id: string;
  type: string;
  status: "open" | "resolved";
  description: string;
  filedByRole: string;
  filedByName: string;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  evidence: Evidence;
  aiSummary: string | null;
  aiInconsistencies: string[] | null;
  aiSuggestedSplit: string | null;
  aiSource: string | null;
  canResolve: boolean;
};

export default function DisputeDetailPage({ params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = usePromise(params);
  const { status: sessionStatus } = useSession();
  const [dispute, setDispute] = useState<DisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not load this dispute.");
      setDispute(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this dispute.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, disputeId]);

  async function resolve(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not issue resolution.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue resolution.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-24 text-center">
        <p className="font-mono text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (sessionStatus === "unauthenticated") {
    return (
      <div className="mx-auto max-w-4xl px-5 py-24 text-center">
        <h1 className="text-3xl">Sign in to view this dispute</h1>
        <Link
          href="/auth"
          className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (error && !dispute) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-24 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Link href="/disputes" className="mt-6 inline-block text-sm underline">
          ← Back to disputes
        </Link>
      </div>
    );
  }

  if (!dispute) return null;

  const ev = dispute.evidence;
  // Evidence is a frozen snapshot taken at filing time — disputes filed
  // before flagged-message bundling existed simply don't have this field.
  const flaggedMessages = ev.flaggedMessages ?? [];
  const activityItems: ActivityEventItem[] = ev.activity.map((a, i) => ({
    id: `${i}-${a.createdAt}`,
    type: a.type,
    actor: a.actor,
    summary: a.summary,
    createdAt: a.createdAt,
  }));

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <Link href="/disputes" className="text-xs text-muted-foreground hover:underline">
        ← All disputes
      </Link>

      <header className="mt-4 border-b border-border pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="eyebrow">Ref {dispute.id}</p>
          <span
            className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
              dispute.status === "open"
                ? "border-accent/50 text-accent"
                : "border-primary/40 text-primary"
            }`}
          >
            {dispute.status}
          </span>
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">
          {typeLabel[dispute.type] ?? dispute.type}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ev.listing.title} · {ev.listing.area}, {ev.listing.city} — filed by {dispute.filedByName}{" "}
          ({dispute.filedByRole}) on {new Date(dispute.createdAt).toLocaleDateString()}
        </p>
      </header>

      <section className="mt-8">
        <h2 className="eyebrow">Claim</h2>
        <p className="mt-2 rounded-2xl border border-border bg-[var(--card)] p-5 text-sm">
          {dispute.description}
        </p>
      </section>

      <section className="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6">
        <h2 className="eyebrow text-primary">AI evidence summary</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          A non-binding starting point for the admin — the written resolution below is what actually
          settles this dispute.
        </p>
        <p className="mt-4 text-sm">{dispute.aiSummary}</p>
        {dispute.aiInconsistencies && dispute.aiInconsistencies.length > 0 && (
          <div className="mt-4">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Inconsistencies found
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {dispute.aiInconsistencies.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {dispute.aiSuggestedSplit && (
          <p className="mt-4 text-sm">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Suggested split:{" "}
            </span>
            {dispute.aiSuggestedSplit}
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-2xl">Evidence bundle</h2>

        <div className="mt-4 rounded-2xl border border-border bg-[var(--card)] p-6">
          <p className="eyebrow">Agreement</p>
          {ev.agreement ? (
            <p className="mt-2 text-sm">
              Ref {ev.agreement.reference} · {ev.agreement.durationMonths} months,{" "}
              {ev.agreement.startDate} to {ev.agreement.endDate} · Tenant signed:{" "}
              {ev.agreement.tenantSigned ? "yes" : "no"} · Landlord signed:{" "}
              {ev.agreement.landlordSigned ? "yes" : "no"}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No agreement on file for this tenancy.
            </p>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-[var(--card)] p-6">
          <p className="eyebrow">Payment history ({ev.payments.length})</p>
          {ev.payments.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No payments logged.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {ev.payments.map((p, i) => (
                <li key={i} className="flex justify-between py-2 text-sm">
                  <span>{p.month}</span>
                  <span className="font-mono">
                    ৳{p.amount.toLocaleString("en-BD")} · {p.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-[var(--card)] p-6">
          <p className="eyebrow">Maintenance timeline ({ev.maintenance.length})</p>
          {ev.maintenance.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No maintenance requests filed.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {ev.maintenance.map((m, i) => (
                <li key={i} className="py-2 text-sm">
                  <div className="flex justify-between">
                    <span>{m.title}</span>
                    <span className="font-mono text-xs">
                      {m.status}
                      {m.isOverdue ? " · overdue" : ""}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    Filed {new Date(m.createdAt).toLocaleDateString()}
                    {m.resolvedAt
                      ? ` · resolved ${new Date(m.resolvedAt).toLocaleDateString()}`
                      : ""}
                  </p>
                  {m.photoUrl && (
                    <img
                      src={m.photoUrl}
                      alt="Maintenance evidence"
                      className="mt-2 h-24 w-32 rounded-xl border border-border object-cover"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-[var(--card)] p-6">
          <p className="eyebrow">Flagged messages ({flaggedMessages.length})</p>
          {flaggedMessages.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No messages were flagged for this tenancy.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {flaggedMessages.map((m, i) => (
                <li key={i} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      {m.senderRole}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1">&ldquo;{m.body}&rdquo;</p>
                  {m.reason && <p className="mt-1 text-xs text-accent">Flagged for: {m.reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-[var(--card)] p-6">
          <p className="eyebrow">Activity timeline</p>
          <div className="mt-4">
            <ActivityTimeline events={activityItems} />
          </div>
        </div>
      </section>

      {dispute.status === "resolved" ? (
        <section className="mt-10 rounded-2xl border border-primary/40 bg-primary/5 p-6">
          <h2 className="eyebrow text-primary">Resolution</h2>
          <p className="mt-2 text-sm">{dispute.resolution}</p>
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
            Resolved {dispute.resolvedAt ? new Date(dispute.resolvedAt).toLocaleString() : ""}
          </p>
        </section>
      ) : dispute.canResolve ? (
        <section className="mt-10">
          <h2 className="text-2xl">Issue resolution</h2>
          <form
            onSubmit={resolve}
            className="mt-4 grid gap-4 rounded-2xl border border-border bg-[var(--card)] p-6"
          >
            <textarea
              required
              rows={4}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Write the final, binding resolution for this dispute."
              className="w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="justify-self-start rounded-full bg-accent px-4 py-3 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Issue resolution"}
            </button>
          </form>
        </section>
      ) : (
        <section className="mt-10">
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            This dispute is open and awaiting admin review.
          </p>
        </section>
      )}
    </div>
  );
}
