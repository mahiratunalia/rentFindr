"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

type Status = "pending" | "acknowledged" | "in_progress" | "resolved";

const statusLabel: Record<Status, string> = {
  pending: "Pending",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  resolved: "Resolved",
};

const MAX_PHOTO_BYTES = 1_500_000; // ~1.5MB raw, stays under the server's base64 char limit

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

type TenantRequest = {
  id: string;
  title: string;
  description: string;
  photoUrl: string | null;
  status: Status;
  createdAt: string;
  isOverdue: boolean;
};

type LandlordRequest = TenantRequest & {
  listingId: string;
  listingTitle: string;
  tenantName: string;
};

type MyApplication = {
  id: string;
  status: string;
  listing: { id: string; title: string; area: string };
};

export default function MaintenancePage() {
  const { data: session, status } = useSession();

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
        <p className="eyebrow">Maintenance</p>
        <h1 className="mt-4 text-3xl">Sign in to view maintenance requests</h1>
        <Link
          href="/auth"
          className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const isLandlord =
    session?.user?.role === "LANDLORD" || session?.user?.accountType === "landlord";

  return isLandlord ? <LandlordView /> : <TenantView />;
}

function LandlordView() {
  const [requests, setRequests] = useState<LandlordRequest[]>([]);
  const [loading, setLoading] = useState(true);
  // A Set, not a single id — advancing request B while request A is still in
  // flight would otherwise overwrite the "acting on" id and re-enable A's
  // button mid-request.
  const [actingOn, setActingOn] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/maintenance/landlord");
      setRequests(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const nextStep: Partial<Record<Status, { label: string; next: Status }>> = {
    pending: { label: "Acknowledge", next: "acknowledged" },
    acknowledged: { label: "Start progress", next: "in_progress" },
    in_progress: { label: "Mark resolved", next: "resolved" },
  };

  async function advance(id: string, next: Status) {
    setActingOn((prev) => new Set(prev).add(id));
    setError(null);
    try {
      const res = await fetch(`/api/maintenance/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not update request.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update request.");
    } finally {
      setActingOn((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const overdueCount = requests.filter((r) => r.isOverdue).length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <header className="border-b border-border pb-8">
        <p className="eyebrow">Maintenance</p>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
          Requests across your listings
        </h1>
        {overdueCount > 0 && (
          <p className="mt-4 border-l-2 border-destructive pl-3 text-sm text-destructive">
            {overdueCount} request{overdueCount > 1 ? "s" : ""} past the 48-hour SLA.
          </p>
        )}
      </header>

      {error && <p className="mt-6 text-sm text-destructive">{error}</p>}

      <section className="mt-10">
        {loading ? (
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Loading…
          </p>
        ) : requests.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No maintenance requests yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {requests.map((r) => (
              <li
                key={r.id}
                className={`rounded-2xl border p-6 ${
                  r.isOverdue
                    ? "border-destructive/60 bg-destructive/5"
                    : "border-border bg-[var(--card)]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-medium">{r.title}</h3>
                      {r.isOverdue && (
                        <span className="border border-destructive/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-destructive">
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      <Link href={`/listings/${r.listingId}`} className="hover:underline">
                        {r.listingTitle}
                      </Link>{" "}
                      · {r.tenantName}
                    </p>
                    <p className="mt-3 text-sm">{r.description}</p>
                    {r.photoUrl && (
                      <img
                        src={r.photoUrl}
                        alt="Maintenance evidence"
                        className="mt-3 h-32 w-44 rounded-xl border border-border object-cover"
                      />
                    )}
                    <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                      Filed {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      {statusLabel[r.status]}
                    </span>
                    {nextStep[r.status] && (
                      <button
                        type="button"
                        disabled={actingOn.has(r.id)}
                        onClick={() => advance(r.id, nextStep[r.status]!.next)}
                        className="mt-3 block rounded-full bg-accent px-4 py-2 text-xs text-accent-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {actingOn.has(r.id) ? "…" : nextStep[r.status]!.label}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TenantView() {
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [selected, setSelected] = useState("");

  const [requests, setRequests] = useState<TenantRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  // Guards against a slower response for a previously-selected tenancy
  // landing after a faster one for the currently-selected tenancy, which
  // would otherwise silently overwrite the list with the wrong tenancy's data.
  const requestSeq = useRef(0);

  const [form, setForm] = useState({ title: "", description: "", photoUrl: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingApps(true);
      try {
        const res = await fetch("/api/applications/mine");
        const data: MyApplication[] = res.ok ? await res.json() : [];
        const accepted = data.filter((a) => a.status === "accepted");
        setApplications(accepted);
        setSelected((prev) =>
          prev && accepted.some((a) => a.id === prev) ? prev : (accepted[0]?.id ?? ""),
        );
      } finally {
        setLoadingApps(false);
      }
    })();
  }, []);

  async function loadRequests(applicationId: string) {
    const seq = ++requestSeq.current;
    if (!applicationId) {
      setRequests([]);
      return;
    }
    setLoadingRequests(true);
    try {
      const res = await fetch(`/api/maintenance?applicationId=${applicationId}`);
      const data = res.ok ? await res.json() : [];
      // A newer request has since started (tenancy switched again) — discard
      // this now-stale response instead of overwriting the newer data.
      if (seq !== requestSeq.current) return;
      setRequests(data);
    } finally {
      if (seq === requestSeq.current) setLoadingRequests(false);
    }
  }

  useEffect(() => {
    // React's own documented data-fetching pattern (set loading, then fetch, then
    // clear it) — flagged by the newer stricter set-state-in-effect rule, but not
    // a bug: needed so switching the selected tenancy shows fresh requests, not
    // the previous tenancy's stale list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRequests(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId: selected, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not file request.");
      setForm({ title: "", description: "", photoUrl: "" });
      await loadRequests(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not file request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <header className="border-b border-border pb-8">
        <p className="eyebrow">Maintenance</p>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
          File a request
        </h1>
      </header>

      {loadingApps ? (
        <p className="mt-10 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Loading your tenancies…
        </p>
      ) : applications.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          You don&apos;t have an active tenancy yet — maintenance requests open up once a landlord
          accepts one of your applications.
        </p>
      ) : (
        <>
          <section className="mt-10">
            {applications.length > 1 && (
              <label className="block max-w-sm">
                <span className="eyebrow">Tenancy</span>
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
                >
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.listing.title} · {a.listing.area}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <form
              onSubmit={submit}
              className="mt-6 grid gap-5 rounded-2xl border border-border bg-[var(--card)] p-6"
            >
              <label className="block">
                <span className="eyebrow">Title</span>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Kitchen tap leaking"
                  className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
                />
              </label>
              <label className="block">
                <span className="eyebrow">Description</span>
                <textarea
                  required
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What's wrong, and since when?"
                  className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
                />
              </label>
              <label className="block">
                <span className="eyebrow">Photo evidence (optional)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (file.size > MAX_PHOTO_BYTES) {
                      setError(`Photo must be under ${Math.round(MAX_PHOTO_BYTES / 1_000_000)}MB.`);
                      return;
                    }
                    const encoded = await fileToBase64(file);
                    setForm((f) => ({ ...f, photoUrl: encoded }));
                  }}
                  className="mt-2 w-full text-xs file:mr-3 file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-xs"
                />
                {form.photoUrl && (
                  <img
                    src={form.photoUrl}
                    alt="Selected evidence"
                    className="mt-3 h-24 w-32 rounded-xl border border-border object-cover"
                  />
                )}
              </label>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-accent px-4 py-3 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Filing…" : "File request"}
              </button>
            </form>
          </section>

          <section className="mt-16">
            <h2 className="text-2xl">Your requests for this tenancy</h2>
            {loadingRequests ? (
              <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                Loading…
              </p>
            ) : requests.length === 0 ? (
              <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No requests filed yet for this tenancy.
              </p>
            ) : (
              <ul className="mt-6 space-y-4">
                {requests.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-border bg-[var(--card)] p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{r.title}</h3>
                          {r.isOverdue && (
                            <span className="border border-destructive/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-destructive">
                              Overdue
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{r.description}</p>
                        <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                          Filed {new Date(r.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        {statusLabel[r.status]}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
