"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { DISPUTE_TYPE_LABEL as typeLabel } from "@/lib/disputes";

type Tenancy = {
  id: string;
  status: string;
  listing: { id: string; title: string; area: string };
};

type DisputeListItem = {
  id: string;
  type: string;
  status: "open" | "resolved";
  createdAt: string;
  filedByRole: string;
  filedByName: string;
  listingTitle: string;
};

export default function DisputesPage() {
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
        <p className="eyebrow">Disputes</p>
        <h1 className="mt-4 text-3xl">Sign in to view or file a dispute</h1>
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

  return <DisputesView isLandlord={isLandlord} />;
}

function DisputesView({ isLandlord }: { isLandlord: boolean }) {
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [loadingTenancies, setLoadingTenancies] = useState(true);
  const [disputes, setDisputes] = useState<DisputeListItem[]>([]);
  const [loadingDisputes, setLoadingDisputes] = useState(true);

  const [selected, setSelected] = useState("");
  const [type, setType] = useState<keyof typeof typeLabel>("unpaid_deposit");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDisputes() {
    setLoadingDisputes(true);
    try {
      const res = await fetch("/api/disputes/mine");
      setDisputes(res.ok ? await res.json() : []);
    } finally {
      setLoadingDisputes(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoadingTenancies(true);
      try {
        const res = await fetch(
          isLandlord ? "/api/applications/landlord" : "/api/applications/mine",
        );
        const data = res.ok ? await res.json() : [];
        const eligible: Tenancy[] = isLandlord
          ? data
          : data.filter(
              (a: { status: string }) => a.status === "accepted" || a.status === "completed",
            );
        setTenancies(eligible);
        setSelected((prev) =>
          prev && eligible.some((t) => t.id === prev) ? prev : (eligible[0]?.id ?? ""),
        );
      } finally {
        setLoadingTenancies(false);
      }
    })();
  }, [isLandlord]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDisputes();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId: selected, type, description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not file dispute.");
      setDescription("");
      await loadDisputes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not file dispute.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <header className="border-b border-border pb-8">
        <p className="eyebrow">Smart Evidence Resolution</p>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
          Disputes
        </h1>
      </header>

      <section className="mt-10">
        <h2 className="text-2xl">File a dispute</h2>
        {loadingTenancies ? (
          <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Loading…
          </p>
        ) : tenancies.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            You don&apos;t have an active or completed tenancy to file a dispute on yet.
          </p>
        ) : (
          <form
            onSubmit={submit}
            className="mt-6 grid gap-5 rounded-2xl border border-border bg-[var(--card)] p-6"
          >
            <label className="block">
              <span className="eyebrow">Tenancy</span>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
              >
                {tenancies.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.listing.title} · {t.listing.area}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="eyebrow">Dispute type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as keyof typeof typeLabel)}
                className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
              >
                {Object.entries(typeLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="eyebrow">What happened</span>
              <textarea
                required
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the claim — dates, amounts, and what you expected to happen."
                className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
              />
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-accent px-4 py-3 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Filing…" : "File dispute"}
            </button>
          </form>
        )}
      </section>

      <section className="mt-16">
        <h2 className="text-2xl">Your disputes</h2>
        {loadingDisputes ? (
          <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Loading…
          </p>
        ) : disputes.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No disputes on record.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {disputes.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/disputes/${d.id}`}
                  className="block rounded-2xl border border-border bg-[var(--card)] p-6 transition-colors hover:border-foreground"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{typeLabel[d.type] ?? d.type}</h3>
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
                      <p className="mt-1 text-sm text-muted-foreground">
                        {d.listingTitle} · filed by {d.filedByName} ({d.filedByRole})
                      </p>
                    </div>
                    <p className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
