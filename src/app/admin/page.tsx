"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { DISPUTE_TYPE_LABEL as disputeTypeLabel } from "@/lib/disputes";

type Verification = {
  id: string;
  nidNumber: string;
  phone: string;
  propertyAddress: string;
  nidPhotoUrl: string | null;
  ownershipProofUrl: string | null;
  selfiePhotoUrl: string | null;
  status: "pending" | "verified" | "rejected";
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  profile: {
    displayName: string;
    user: { email: string };
  };
};

type TenantVerification = {
  id: string;
  nidNumber: string;
  phone: string;
  nidPhotoUrl: string | null;
  status: "pending" | "verified" | "rejected";
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  profile: {
    displayName: string;
    user: { email: string };
  };
};

type AdminDispute = {
  id: string;
  type: string;
  status: "open" | "resolved";
  createdAt: string;
  filedByRole: string;
  filedByName: string;
  listingTitle: string;
};

type AdminInvite = {
  id: string;
  code: string;
  usedByEmail: string | null;
  usedAt: string | null;
  createdAt: string;
  expiresAt: string;
  createdBy: { displayName: string };
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [tenantVerifications, setTenantVerifications] = useState<TenantVerification[]>([]);
  const [loading, setLoading] = useState(true);
  // A Set, not a single id — otherwise starting an action on row B while row
  // A's request is still in flight overwrites the "acting on" id and
  // re-enables A's buttons mid-request, letting it be double-submitted.
  const [actingOn, setActingOn] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [generating, setGenerating] = useState(false);
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [landlordRes, tenantRes, invitesRes, disputesRes] = await Promise.all([
        fetch("/api/admin/verifications"),
        fetch("/api/admin/tenant-verifications"),
        fetch("/api/admin/invites"),
        fetch("/api/disputes"),
      ]);
      if (landlordRes.ok) setVerifications(await landlordRes.json());
      if (tenantRes.ok) setTenantVerifications(await tenantRes.json());
      if (invitesRes.ok) setInvites(await invitesRes.json());
      if (disputesRes.ok) setDisputes(await disputesRes.json());
    } finally {
      setLoading(false);
    }
  }

  async function generateInvite() {
    setGenerating(true);
    setNewInviteUrl(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/invites", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not generate an invite.");
      setNewInviteUrl(data.url);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate an invite.");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    // React's own documented data-fetching pattern (set loading, then fetch, then
    // clear it) — flagged by the newer stricter set-state-in-effect rule, but not
    // a bug: `load` only runs in response to `status` resolving, not on every render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") load();
    else if (status !== "loading") setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function review(id: string, next: "verified" | "rejected") {
    setActingOn((prev) => new Set(prev).add(id));
    setError(null);
    try {
      const res = await fetch(`/api/admin/verifications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next, reviewNote: noteDrafts[id] || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not update this verification.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this verification.");
    } finally {
      setActingOn((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function reviewTenant(id: string, next: "verified" | "rejected") {
    setActingOn((prev) => new Set(prev).add(id));
    setError(null);
    try {
      const res = await fetch(`/api/admin/tenant-verifications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next, reviewNote: noteDrafts[id] || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not update this verification.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this verification.");
    } finally {
      setActingOn((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-6xl px-5 py-24 text-center">
        <p className="font-mono text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto max-w-6xl px-5 py-24 text-center">
        <p className="eyebrow">Admin</p>
        <h1 className="mt-4 text-3xl">Sign in required</h1>
        <Link
          href="/auth"
          className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const isAdmin = session?.user?.role === "ADMIN";
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-24 text-center">
        <p className="eyebrow">Admin</p>
        <h1 className="mt-4 text-3xl">Admin accounts only</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          This page is only accessible to platform admins.
        </p>
      </div>
    );
  }

  const pending = verifications.filter((v) => v.status === "pending");
  const reviewed = verifications.filter((v) => v.status !== "pending");
  const pendingTenants = tenantVerifications.filter((v) => v.status === "pending");
  const reviewedTenants = tenantVerifications.filter((v) => v.status !== "pending");

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <header className="border-b border-border pb-8">
        <p className="eyebrow">Admin</p>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
          Admin access
        </h1>
        <p className="mt-4 max-w-xl text-sm text-muted-foreground">
          Invite another admin without sharing the platform-wide signup code.
        </p>
      </header>

      {error && <p className="mt-6 text-sm text-destructive">{error}</p>}

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-2xl">Disputes</h2>
          {disputes.filter((d) => d.status === "open").length > 0 && (
            <span className="border border-accent/50 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-accent">
              {disputes.filter((d) => d.status === "open").length} open
            </span>
          )}
        </div>
        {disputes.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No disputes filed yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {disputes.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/disputes/${d.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-[var(--card)] p-5 transition-colors hover:border-foreground"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {disputeTypeLabel[d.type] ?? d.type}
                      </span>
                      <span
                        className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                          d.status === "open"
                            ? "border-accent/50 text-accent"
                            : "border-primary/40 text-primary"
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {d.listingTitle} · filed by {d.filedByName} ({d.filedByRole})
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 rounded-2xl border border-border bg-[var(--card)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl">Invite another admin</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Generates a one-time link, valid for 7 days. Anyone who signs up with it becomes an
              admin without needing the shared invite code.
            </p>
          </div>
          <button
            type="button"
            onClick={generateInvite}
            disabled={generating}
            className="shrink-0 rounded-full bg-accent px-4 py-2.5 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            {generating ? "Generating…" : "Generate invite link"}
          </button>
        </div>

        {newInviteUrl && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-5">
            <code className="flex-1 break-all rounded-lg bg-muted px-3 py-2 text-xs">
              {newInviteUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(newInviteUrl).then(() => setCopied(true));
              }}
              className="shrink-0 rounded-full border border-border px-3 py-2 text-xs hover:bg-secondary"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        )}

        {invites.length > 0 && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="eyebrow mb-3">Recent invites</p>
            <ul className="space-y-2 text-xs">
              {invites.map((inv) => {
                const expired = new Date(inv.expiresAt) < new Date();
                const state = inv.usedAt ? "used" : expired ? "expired" : "active";
                return (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0"
                  >
                    <span className="font-mono">{inv.code}</span>
                    <span className="text-muted-foreground">
                      {inv.usedByEmail
                        ? `used by ${inv.usedByEmail}`
                        : `by ${inv.createdBy.displayName}`}
                    </span>
                    <span
                      className={`font-mono uppercase tracking-wider ${
                        state === "used"
                          ? "text-trust-mid"
                          : state === "expired"
                            ? "text-destructive"
                            : "text-trust-high"
                      }`}
                    >
                      {state}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <header className="mt-20 border-b border-border pb-8">
        <p className="eyebrow">Admin</p>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
          Landlord verification
        </h1>
        <p className="mt-4 max-w-xl text-sm text-muted-foreground">
          Review submitted NID and property ownership documents. Only verified landlords can publish
          active listings — everyone else is limited to drafts.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="text-2xl">Pending review ({loading ? "…" : pending.length})</h2>
        {loading ? (
          <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Loading…
          </p>
        ) : pending.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nothing waiting on review.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {pending.map((v) => (
              <li key={v.id} className="rounded-2xl border border-border bg-[var(--card)] p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <div>
                    <h3 className="text-xl">{v.profile.displayName}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{v.profile.user.email}</p>
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Submitted {new Date(v.submittedAt).toLocaleDateString()}
                  </p>
                </div>

                <dl className="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                  <div className="flex justify-between border-b border-border pb-2">
                    <dt className="text-muted-foreground">NID number</dt>
                    <dd className="font-mono text-xs">{v.nidNumber}</dd>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="font-mono text-xs">{v.phone}</dd>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2 sm:col-span-2">
                    <dt className="text-muted-foreground">Property address</dt>
                    <dd className="text-right text-xs">{v.propertyAddress}</dd>
                  </div>
                </dl>

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="eyebrow">NID photo</p>
                    {v.nidPhotoUrl && (
                      <img
                        src={v.nidPhotoUrl}
                        alt="Submitted NID"
                        className="mt-2 max-h-48 w-full rounded-xl border border-border object-contain"
                      />
                    )}
                  </div>
                  <div>
                    <p className="eyebrow">Ownership proof</p>
                    {v.ownershipProofUrl && (
                      <img
                        src={v.ownershipProofUrl}
                        alt="Submitted ownership proof"
                        className="mt-2 max-h-48 w-full rounded-xl border border-border object-contain"
                      />
                    )}
                  </div>
                  <div>
                    <p className="eyebrow">Selfie with NID</p>
                    {v.selfiePhotoUrl && (
                      <img
                        src={v.selfiePhotoUrl}
                        alt="Submitted selfie with NID"
                        className="mt-2 max-h-48 w-full rounded-xl border border-border object-contain"
                      />
                    )}
                  </div>
                </div>

                <label className="mt-5 block">
                  <span className="eyebrow">Review note (optional, shown on rejection)</span>
                  <input
                    value={noteDrafts[v.id] ?? ""}
                    onChange={(e) => setNoteDrafts((d) => ({ ...d, [v.id]: e.target.value }))}
                    className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
                    placeholder="e.g. NID photo is blurry, please resubmit"
                  />
                </label>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={actingOn.has(v.id)}
                    onClick={() => review(v.id, "verified")}
                    className="flex-1 rounded-full bg-accent px-3 py-2 text-xs text-accent-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {actingOn.has(v.id) ? "…" : "✓ Approve & verify"}
                  </button>
                  <button
                    type="button"
                    disabled={actingOn.has(v.id)}
                    onClick={() => review(v.id, "rejected")}
                    className="flex-1 rounded-full border border-destructive/50 px-3 py-2 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-60"
                  >
                    {actingOn.has(v.id) ? "…" : "✗ Reject"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reviewed.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl">Reviewed ({reviewed.length})</h2>
          <table className="mt-5 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-border">
                {["Landlord", "Email", "Status", "Reviewed", "Note"].map((h) => (
                  <th
                    key={h}
                    className="py-2 pr-4 font-mono text-[10px] font-normal uppercase tracking-widest text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviewed.map((v) => (
                <tr key={v.id} className="border-b border-border align-top">
                  <td className="py-3 pr-4">{v.profile.displayName}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{v.profile.user.email}</td>
                  <td
                    className={`py-3 pr-4 font-mono text-[11px] uppercase tracking-wider ${v.status === "verified" ? "text-trust-high" : "text-destructive"}`}
                  >
                    {v.status}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">
                    {v.reviewedAt ? new Date(v.reviewedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-3 text-xs text-muted-foreground">{v.reviewNote || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <header className="mt-20 border-b border-border pb-8">
        <p className="eyebrow">Admin</p>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
          Tenant identity verification
        </h1>
        <p className="mt-4 max-w-xl text-sm text-muted-foreground">
          Optional NID checks tenants can submit from their profile. Verified tenants are ranked
          ahead of unverified ones when a landlord reviews applicants.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="text-2xl">Pending review ({loading ? "…" : pendingTenants.length})</h2>
        {loading ? (
          <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Loading…
          </p>
        ) : pendingTenants.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nothing waiting on review.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {pendingTenants.map((v) => (
              <li key={v.id} className="rounded-2xl border border-border bg-[var(--card)] p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <div>
                    <h3 className="text-xl">{v.profile.displayName}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{v.profile.user.email}</p>
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Submitted {new Date(v.submittedAt).toLocaleDateString()}
                  </p>
                </div>

                <dl className="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                  <div className="flex justify-between border-b border-border pb-2">
                    <dt className="text-muted-foreground">NID number</dt>
                    <dd className="font-mono text-xs">{v.nidNumber}</dd>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="font-mono text-xs">{v.phone}</dd>
                  </div>
                </dl>

                <div className="mt-5">
                  <p className="eyebrow">NID photo</p>
                  {v.nidPhotoUrl && (
                    <img
                      src={v.nidPhotoUrl}
                      alt="Submitted NID"
                      className="mt-2 max-h-48 w-full rounded-xl border border-border object-contain sm:w-1/2"
                    />
                  )}
                </div>

                <label className="mt-5 block">
                  <span className="eyebrow">Review note (optional, shown on rejection)</span>
                  <input
                    value={noteDrafts[v.id] ?? ""}
                    onChange={(e) => setNoteDrafts((d) => ({ ...d, [v.id]: e.target.value }))}
                    className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
                    placeholder="e.g. NID photo is blurry, please resubmit"
                  />
                </label>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={actingOn.has(v.id)}
                    onClick={() => reviewTenant(v.id, "verified")}
                    className="flex-1 rounded-full bg-accent px-3 py-2 text-xs text-accent-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {actingOn.has(v.id) ? "…" : "✓ Approve & verify"}
                  </button>
                  <button
                    type="button"
                    disabled={actingOn.has(v.id)}
                    onClick={() => reviewTenant(v.id, "rejected")}
                    className="flex-1 rounded-full border border-destructive/50 px-3 py-2 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-60"
                  >
                    {actingOn.has(v.id) ? "…" : "✗ Reject"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reviewedTenants.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl">Reviewed ({reviewedTenants.length})</h2>
          <table className="mt-5 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-border">
                {["Tenant", "Email", "Status", "Reviewed", "Note"].map((h) => (
                  <th
                    key={h}
                    className="py-2 pr-4 font-mono text-[10px] font-normal uppercase tracking-widest text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviewedTenants.map((v) => (
                <tr key={v.id} className="border-b border-border align-top">
                  <td className="py-3 pr-4">{v.profile.displayName}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{v.profile.user.email}</td>
                  <td
                    className={`py-3 pr-4 font-mono text-[11px] uppercase tracking-wider ${v.status === "verified" ? "text-trust-high" : "text-destructive"}`}
                  >
                    {v.status}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">
                    {v.reviewedAt ? new Date(v.reviewedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-3 text-xs text-muted-foreground">{v.reviewNote || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
