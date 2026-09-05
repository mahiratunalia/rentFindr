"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bdt } from "@/data/module1";

type CompareRow = {
  savedId: string;
  listingId: string;
  title: string;
  area: string;
  city: string;
  rent: number;
  roomType: string;
  landlordTrustScore: number | null;
  matchPercent: number | null;
  distanceKm: number | null;
};

export function SavedListingsCompare() {
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [landmarkInput, setLandmarkInput] = useState("");
  const [activeLandmark, setActiveLandmark] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function load(landmark?: string) {
    const isLandmarkUpdate = landmark !== undefined;
    if (isLandmarkUpdate) setGeocoding(true);
    else setLoading(true);
    setError(null);
    try {
      const url = landmark
        ? `/api/listings/compare?landmark=${encodeURIComponent(landmark)}`
        : "/api/listings/compare";
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not load your saved listings.");
      setRows(data.rows);
      setActiveLandmark(data.landmark?.label ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your saved listings.");
    } finally {
      setLoading(false);
      setGeocoding(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function remove(listingId: string, savedId: string) {
    setRemovingId(savedId);
    try {
      await fetch("/api/listings/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      await load(activeLandmark ?? undefined);
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Loading…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No saved listings yet — bookmark a few while browsing to compare them side by side here.
      </p>
    );
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (landmarkInput.trim()) load(landmarkInput.trim());
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="block flex-1 min-w-[220px]">
          <span className="eyebrow">Distance to a landmark (optional)</span>
          <input
            type="text"
            value={landmarkInput}
            onChange={(e) => setLandmarkInput(e.target.value)}
            placeholder="e.g. BUET, New Market, Gulshan 1"
            className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
          />
        </label>
        <button
          type="submit"
          disabled={geocoding || !landmarkInput.trim()}
          className="rounded-full border border-border px-4 py-2 text-xs hover:bg-secondary disabled:opacity-50"
        >
          {geocoding ? "Locating…" : "Update distances"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {activeLandmark && (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          Distances measured from: {activeLandmark}
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-[var(--card)] font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <th className="p-4 font-normal">Listing</th>
              <th className="p-4 font-normal">Rent</th>
              <th className="p-4 font-normal">Landlord trust</th>
              <th className="p-4 font-normal">Match %</th>
              {activeLandmark && <th className="p-4 font-normal">Distance</th>}
              <th className="p-4 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.savedId} className="border-b border-border last:border-0">
                <td className="p-4">
                  <Link href={`/listings/${r.listingId}`} className="hover:underline">
                    <span className="font-medium">{r.title}</span>
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.area}, {r.city} · {r.roomType}
                  </p>
                </td>
                <td className="p-4 font-mono tabular-nums">{bdt(r.rent)}</td>
                <td className="p-4 font-mono tabular-nums">
                  {r.landlordTrustScore != null ? r.landlordTrustScore : "—"}
                </td>
                <td className="p-4 font-mono tabular-nums">
                  {r.matchPercent != null ? (
                    `${r.matchPercent}%`
                  ) : (
                    <Link href="/matches" className="text-xs underline underline-offset-4">
                      Set preferences
                    </Link>
                  )}
                </td>
                {activeLandmark && (
                  <td className="p-4 font-mono tabular-nums">
                    {r.distanceKm != null ? `${r.distanceKm} km` : "—"}
                  </td>
                )}
                <td className="p-4">
                  <button
                    type="button"
                    disabled={removingId === r.savedId}
                    onClick={() => remove(r.listingId, r.savedId)}
                    className="font-mono text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    {removingId === r.savedId ? "…" : "remove"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
