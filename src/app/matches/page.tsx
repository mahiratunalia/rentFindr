"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { TrustBar } from "@/components/trust";
import { bdt } from "@/data/module1";
import { matchScore, type MatchPreference, type MatchableListing } from "@/lib/match";

const roomTypes = ["Single room", "Shared mess", "Studio", "Full flat"] as const;
type RoomTypeOption = (typeof roomTypes)[number];

type SavedPreference = {
  budgetCeiling: number;
  commuteAnchorLabel: string;
  commuteAnchorLat: number;
  commuteAnchorLng: number;
  roomType: string;
  hasPets: boolean;
  smokes: boolean;
  frequentVisitors: boolean;
  mustHaves: string[];
} | null;

type ApiListing = MatchableListing & {
  id: string;
  title: string;
  area: string;
  city: string;
  availableFrom: string;
};

type FormState = {
  budgetCeiling: number;
  commuteAnchorLabel: string;
  roomType: RoomTypeOption;
  hasPets: boolean;
  smokes: boolean;
  frequentVisitors: boolean;
  mustHaves: string;
};

const defaultForm: FormState = {
  budgetCeiling: 10000,
  commuteAnchorLabel: "",
  roomType: "Single room",
  hasPets: false,
  smokes: false,
  frequentVisitors: false,
  mustHaves: "",
};

export default function MatchesPage() {
  const { status } = useSession();

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
        <p className="eyebrow">Personalized matching</p>
        <h1 className="mt-4 text-3xl">Sign in to find your best-matched listings</h1>
        <Link
          href="/auth"
          className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return <MatchesInner />;
}

function MatchesInner() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [savedPreference, setSavedPreference] = useState<SavedPreference>(null);
  const [loadingPreference, setLoadingPreference] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [listings, setListings] = useState<ApiListing[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [explaining, setExplaining] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingPreference(true);
      try {
        const res = await fetch("/api/match/preference");
        if (res.ok) {
          const data: SavedPreference = await res.json();
          if (data) {
            setSavedPreference(data);
            setForm({
              budgetCeiling: data.budgetCeiling,
              commuteAnchorLabel: data.commuteAnchorLabel,
              roomType: (roomTypes as readonly string[]).includes(data.roomType)
                ? (data.roomType as RoomTypeOption)
                : "Single room",
              hasPets: data.hasPets,
              smokes: data.smokes,
              frequentVisitors: data.frequentVisitors,
              mustHaves: data.mustHaves.join(", "),
            });
          }
        }
      } finally {
        setLoadingPreference(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingListings(true);
      try {
        const res = await fetch("/api/listings");
        setListings(res.ok ? await res.json() : []);
      } finally {
        setLoadingListings(false);
      }
    })();
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function savePreference() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/match/preference", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          budgetCeiling: form.budgetCeiling,
          commuteAnchorLabel: form.commuteAnchorLabel,
          roomType: form.roomType,
          hasPets: form.hasPets,
          smokes: form.smokes,
          frequentVisitors: form.frequentVisitors,
          mustHaves: form.mustHaves
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save your preferences.");
      setSavedPreference(data);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save your preferences.");
    } finally {
      setSaving(false);
    }
  }

  async function explain(listingId: string) {
    if (explanations[listingId]) {
      setExpandedId(expandedId === listingId ? null : listingId);
      return;
    }
    setExplaining(listingId);
    try {
      const res = await fetch("/api/match/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setExplanations((prev) => ({ ...prev, [listingId]: data.explanation }));
        setExpandedId(listingId);
      }
    } finally {
      setExplaining(null);
    }
  }

  const pref: MatchPreference | null = useMemo(
    () =>
      savedPreference
        ? {
            budgetCeiling: savedPreference.budgetCeiling,
            commuteAnchorLat: savedPreference.commuteAnchorLat,
            commuteAnchorLng: savedPreference.commuteAnchorLng,
            roomType: savedPreference.roomType,
            hasPets: savedPreference.hasPets,
            smokes: savedPreference.smokes,
            frequentVisitors: savedPreference.frequentVisitors,
          }
        : null,
    [savedPreference],
  );

  const ranked = useMemo(() => {
    if (!pref) return [];
    return listings
      .map((listing) => ({ listing, result: matchScore(pref, listing) }))
      .sort((a, b) => b.result.total - a.result.total);
  }, [listings, pref]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <header className="border-b border-border pb-8">
        <p className="eyebrow">Personalized matching</p>
        <h1 className="mt-4 max-w-2xl font-display text-4xl font-bold uppercase leading-[1.05] tracking-tight sm:text-5xl">
          Your match, scored — not guessed.
        </h1>
      </header>

      <div className="mt-10 grid gap-14 lg:grid-cols-[340px_1fr]">
        <form className="space-y-8">
          <div>
            <span className="eyebrow">Monthly budget ceiling · {bdt(form.budgetCeiling)}</span>
            <input
              type="range"
              min={4000}
              max={20000}
              step={250}
              value={form.budgetCeiling}
              onChange={(e) => set("budgetCeiling", Number(e.target.value))}
              className="mt-3 w-full accent-[var(--primary)]"
            />
          </div>

          <label className="block">
            <span className="eyebrow">Commute anchor</span>
            <input
              type="text"
              value={form.commuteAnchorLabel}
              onChange={(e) => set("commuteAnchorLabel", e.target.value)}
              placeholder="e.g. BUET, Farmgate, Uttara Sector 7"
              className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              An area, landmark, or address — used to score commute distance.
            </p>
          </label>

          <div>
            <span className="eyebrow">Room type</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {roomTypes.map((rt) => (
                <button
                  key={rt}
                  type="button"
                  onClick={() => set("roomType", rt)}
                  className={`border px-3 py-1.5 text-xs transition-colors ${
                    form.roomType === rt
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  {rt}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-6">
            <span className="eyebrow">About you (deal-breakers)</span>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.hasPets}
                onChange={(e) => set("hasPets", e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              I have pets
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.smokes}
                onChange={(e) => set("smokes", e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              I smoke
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.frequentVisitors}
                onChange={(e) => set("frequentVisitors", e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              I have frequent visitors
            </label>
          </div>

          <label className="block">
            <span className="eyebrow">Must-haves (optional)</span>
            <input
              type="text"
              value={form.mustHaves}
              onChange={(e) => set("mustHaves", e.target.value)}
              placeholder="balcony, attached bathroom, generator backup"
              className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Comma-separated. Shown as your own notes — not part of the score.
            </p>
          </label>

          <div className="space-y-3 border-t border-border pt-6">
            <button
              type="button"
              disabled={saving || !form.commuteAnchorLabel.trim()}
              onClick={savePreference}
              className="w-full rounded-full bg-accent px-4 py-3 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : savedPreference ? "Update preferences" : "Save & find matches"}
            </button>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          </div>
        </form>

        <section>
          <h2 className="text-2xl">Ranked listings</h2>
          {loadingPreference || loadingListings ? (
            <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Loading…
            </p>
          ) : !pref ? (
            <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Save your preferences to see every active listing ranked by match %.
            </p>
          ) : ranked.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No active listings right now.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {ranked.map(({ listing, result }) => (
                <li
                  key={listing.id}
                  className="rounded-2xl border border-border bg-[var(--card)] p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <Link href={`/listings/${listing.id}`} className="hover:underline">
                        <h3 className="text-xl">{listing.title}</h3>
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {listing.area}, {listing.city} · {listing.roomType} · {bdt(listing.rent)}/mo
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-3xl tabular-nums">{result.total}%</span>
                      <p className="eyebrow">match</p>
                    </div>
                  </div>

                  {result.hardBlocked && (
                    <p className="mt-4 border-l-2 border-destructive pl-3 text-xs text-destructive">
                      Blocked — {result.blockReason}.
                    </p>
                  )}

                  <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-3">
                    {result.parts.map((p) => (
                      <div key={p.label}>
                        <div className="flex items-baseline justify-between">
                          <dt className="text-xs">{p.label}</dt>
                          <dd className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {Math.round(p.value * p.weight)}/{p.weight}
                          </dd>
                        </div>
                        <div className="mt-1.5">
                          <TrustBar value={p.value * 100} />
                        </div>
                      </div>
                    ))}
                  </dl>

                  {expandedId === listing.id && explanations[listing.id] && (
                    <p className="mt-5 border-l-2 border-accent pl-3 text-sm text-muted-foreground">
                      {explanations[listing.id]}
                    </p>
                  )}

                  <div className="mt-5 flex gap-2">
                    <button
                      type="button"
                      disabled={explaining === listing.id}
                      onClick={() => explain(listing.id)}
                      className="flex-1 rounded-full border border-border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50"
                    >
                      {explaining === listing.id
                        ? "Thinking…"
                        : expandedId === listing.id
                          ? "Hide explanation"
                          : "Why this matches →"}
                    </button>
                    <Link
                      href={`/listings/${listing.id}`}
                      className="flex-1 rounded-full border border-border px-3 py-2 text-center text-xs hover:bg-secondary"
                    >
                      View listing
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
