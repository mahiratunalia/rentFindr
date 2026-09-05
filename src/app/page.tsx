"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BedSingle,
  Building2,
  CalendarDays,
  Home,
  MapPin,
  Ruler,
  Search,
  Users,
} from "lucide-react";

import heroImage from "@/assets/hero-dhaka.jpg";
import placeholder1 from "@/assets/listing-1.jpg";
import placeholder2 from "@/assets/listing-2.jpg";
import placeholder3 from "@/assets/listing-3.jpg";
import { VerifiedBadge } from "@/components/trust";
import { bdt, formatDate, type RoomType } from "@/data/module1";
import type { LandlordSummary } from "@/lib/landlord-summary.server";
import { matchScore, type MatchPreference } from "@/lib/match";

const placeholderPhotos = [placeholder1, placeholder2, placeholder3];

const roomTypeTiles: { type: RoomType; icon: typeof Home }[] = [
  { type: "Single room", icon: BedSingle },
  { type: "Shared mess", icon: Users },
  { type: "Studio", icon: Home },
  { type: "Full flat", icon: Building2 },
];
const roomTypeValues = roomTypeTiles.map((t) => t.type as string);

type ApiListing = {
  id: string;
  title: string;
  area: string;
  city: string;
  rent: number;
  roomType: string;
  availableFrom: string;
  landlordId: string;
  landlord: LandlordSummary;
  photoUrls: string[];
  sqft: number | null;
  latitude: number;
  longitude: number;
  description: string | null;
  houseRules: string[];
  _count: { applications: number };
};

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const searchParams = useSearchParams();
  const requestedRoomType = searchParams.get("roomType");
  const { data: session } = useSession();

  const [listings, setListings] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [matchPref, setMatchPref] = useState<MatchPreference | null>(null);

  const [area, setArea] = useState("Any area");
  const [roomType, setRoomType] = useState<RoomType | "Any">(
    requestedRoomType && roomTypeValues.includes(requestedRoomType)
      ? (requestedRoomType as RoomType)
      : "Any",
  );
  // null = not touched by the user yet, so the slider bounds (derived from real
  // listing prices below) apply as the effective range. A hardcoded ceiling here
  // previously made any listing priced above it permanently unfindable, no
  // matter what the user set the filter to — the slider itself couldn't reach it.
  const [minRent, setMinRent] = useState<number | null>(null);
  const [maxRent, setMaxRent] = useState<number | null>(null);
  // Empty = no filter. A hardcoded default date here would silently hide any
  // listing whose move-in date falls after it — including brand new ones.
  const [availableBy, setAvailableBy] = useState("");
  const [sort, setSort] = useState<"verified" | "rent" | "match">("verified");

  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session?.user?.role === "LANDLORD" || session?.user?.accountType === "landlord") return;
    let cancelled = false;
    fetch("/api/match/preference")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setMatchPref(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/listings")
      .then((res) => {
        if (!res.ok) throw new Error("Could not load listings.");
        return res.json() as Promise<ApiListing[]>;
      })
      .then((data) => {
        if (!cancelled) setListings(data);
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Could not load listings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!requestedRoomType) return;
    document.getElementById("listings")?.scrollIntoView({ behavior: "smooth" });
    // only on arrival with a room-type param, not on every re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const areas = useMemo(
    () => ["Any area", ...Array.from(new Set(listings.map((l) => l.area)))],
    [listings],
  );

  // Slider bounds always stretch to cover every real listing's price, so the
  // ceiling can never make an actual listing unreachable regardless of how
  // cheap or expensive it is.
  const rentBounds = useMemo(() => {
    const rents = listings.map((l) => l.rent);
    return {
      min: rents.length ? Math.min(4000, ...rents) : 4000,
      max: rents.length ? Math.max(20000, ...rents) : 20000,
    };
  }, [listings]);
  const effectiveMinRent = minRent ?? rentBounds.min;
  const effectiveMaxRent = maxRent ?? rentBounds.max;

  // Personalized Listing Match Score — deterministic, computed client-side
  // per listing (same on-the-fly pattern as Roommate Compatibility), only
  // when the tenant has saved a preference on /matches.
  const matchByListingId = useMemo(() => {
    if (!matchPref) return null;
    const map = new Map<string, number>();
    for (const l of listings) map.set(l.id, matchScore(matchPref, l).total);
    return map;
  }, [listings, matchPref]);

  const results = useMemo(() => {
    return listings
      .filter((l) => (area === "Any area" ? true : l.area === area))
      .filter((l) => (roomType === "Any" ? true : l.roomType === roomType))
      .filter((l) => l.rent >= effectiveMinRent && l.rent <= effectiveMaxRent)
      .filter((l) => !availableBy || new Date(l.availableFrom) <= new Date(availableBy))
      .sort((a, b) =>
        sort === "match" && matchByListingId
          ? (matchByListingId.get(b.id) ?? 0) - (matchByListingId.get(a.id) ?? 0)
          : sort === "rent"
            ? a.rent - b.rent
            : Number(b.landlord.verified) - Number(a.landlord.verified) ||
              b.landlord.totalApplicants - a.landlord.totalApplicants,
      );
  }, [
    listings,
    area,
    roomType,
    effectiveMinRent,
    effectiveMaxRent,
    availableBy,
    sort,
    matchByListingId,
  ]);

  const verifiedLandlordCount = useMemo(
    () => new Set(listings.filter((l) => l.landlord.verified).map((l) => l.landlordId)).size,
    [listings],
  );
  const landlordCount = useMemo(() => new Set(listings.map((l) => l.landlordId)).size, [listings]);
  const totalApplicants = useMemo(
    () => listings.reduce((sum, l) => sum + l._count.applications, 0),
    [listings],
  );

  function scrollListings(dir: -1 | 1) {
    scrollerRef.current?.scrollBy({ left: dir * 420, behavior: "smooth" });
  }

  return (
    <>
      {/* Hero */}
      <section className="relative">
        <img
          src={heroImage.src}
          alt="Aerial view of dense Dhaka residential rooftops at golden hour"
          width={1600}
          height={900}
          className="aspect-[4/5] w-full object-cover sm:aspect-[16/8]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20" />

        <div className="absolute inset-x-0 top-6 flex items-start justify-between px-6 font-mono text-[11px] uppercase tracking-[0.2em] text-white/70 sm:top-8 sm:px-10">
          <span>Dhaka, Bangladesh</span>
          <span className="max-w-[220px] text-right leading-relaxed">
            Admin-verified landlords. Applications the landlord actually sees.
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-6 px-6 pb-8 sm:flex-row sm:items-end sm:justify-between sm:px-10 sm:pb-12">
          <div>
            <h1 className="font-display text-[15vw] font-bold leading-[0.85] tracking-tight text-white sm:text-[6.5rem]">
              rentFindr
            </h1>
            <p className="mt-2 font-mono text-sm uppercase tracking-[0.2em] text-white/80">
              find your somewhere
            </p>
          </div>
          <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-3">
            <div className="rounded-full border border-white/25 bg-white/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.15em] text-white backdrop-blur-sm">
              {listings.length} active listing{listings.length === 1 ? "" : "s"} · {landlordCount}{" "}
              landlords
            </div>
            <a
              href="#listings"
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
              aria-label="Jump to listings"
            >
              <ArrowDown className="size-5" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      {/* Statement */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <div className="grid gap-6 sm:grid-cols-[1.3fr_1fr] sm:items-end">
          <h2 className="font-display text-3xl font-bold uppercase leading-[1.05] tracking-tight sm:text-5xl">
            Rent on a record,
            <br />
            not a promise
          </h2>
          <p className="font-mono text-[11px] uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
            From identity checks to application ranking, every layer of rentFindr is built to close
            the trust gap in informal rentals.
          </p>
        </div>

        <p className="mt-8 max-w-3xl text-xl leading-relaxed text-muted-foreground sm:text-2xl">
          <span className="text-foreground">We believe</span> a rental market runs on{" "}
          <span className="text-foreground">verified identity</span>, not word of mouth. It is the
          connection between{" "}
          <span className="text-foreground">real applications, real landlords,</span> and a record
          both sides can trust.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-4">
          <StatCard value={`${listings.length}`} label="Active listings" />
          <StatCard value={`${landlordCount}`} label="Landlords listed" />
          <StatCard value={`${verifiedLandlordCount}`} label="Admin-verified" />
          <StatCard value={`${totalApplicants}`} label="Real applications" />
        </div>
      </section>

      {/* Quick search */}
      <section className="mx-auto max-w-6xl px-5">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-accent" aria-hidden />
            <p className="eyebrow">Quick search</p>
          </div>
          <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Area">
              <select value={area} onChange={(e) => setArea(e.target.value)} className={inputCls}>
                {areas.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </Field>
            <Field label={`Rent from ${bdt(effectiveMinRent)}`}>
              <input
                type="range"
                min={rentBounds.min}
                max={rentBounds.max}
                step={500}
                value={effectiveMinRent}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setMinRent(next);
                  if (next > effectiveMaxRent) setMaxRent(next);
                }}
                className="mt-3 w-full accent-[var(--accent)]"
              />
            </Field>
            <Field label={`Rent up to ${bdt(effectiveMaxRent)}`}>
              <input
                type="range"
                min={rentBounds.min}
                max={rentBounds.max}
                step={500}
                value={effectiveMaxRent}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setMaxRent(next);
                  if (next < effectiveMinRent) setMinRent(next);
                }}
                className="mt-3 w-full accent-[var(--accent)]"
              />
            </Field>
            <Field label="Available by (optional)">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={availableBy}
                  onChange={(e) => setAvailableBy(e.target.value)}
                  className={inputCls}
                />
                {availableBy && (
                  <button
                    type="button"
                    onClick={() => setAvailableBy("")}
                    className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </Field>
            <Field label="Sort by">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "verified" | "rent" | "match")}
                className={inputCls}
              >
                <option value="verified">Verified landlords first</option>
                <option value="rent">Lowest rent</option>
                {matchByListingId && <option value="match">Best match for you</option>}
              </select>
            </Field>
          </div>
        </div>
      </section>

      {/* Room type tiles */}
      <section className="mx-auto max-w-6xl px-5 pt-16">
        <p className="eyebrow">Browse by room type</p>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {roomTypeTiles.map(({ type, icon: Icon }) => {
            const active = roomType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setRoomType(active ? "Any" : type)}
                className={`group rounded-2xl border p-5 text-left transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card hover:border-foreground/40"
                }`}
              >
                <Icon
                  className={`size-6 ${active ? "text-background" : "text-accent"}`}
                  aria-hidden
                />
                <p className="mt-8 font-display text-lg font-bold leading-tight">{type}</p>
                <p
                  className={`mt-1 font-mono text-[10px] uppercase tracking-[0.15em] ${active ? "text-background/70" : "text-muted-foreground"}`}
                >
                  {active ? "Showing this ›" : "Filter ›"}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Listings */}
      <section id="listings" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="font-display text-3xl font-bold uppercase tracking-tight sm:text-5xl">
            Available now
          </h2>
          <div className="flex items-center gap-4">
            {!loading && !loadError && (
              <p className="eyebrow">
                {results.length} listing{results.length === 1 ? "" : "s"} match
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => scrollListings(-1)}
                className="flex size-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-foreground"
                aria-label="Scroll left"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => scrollListings(1)}
                className="flex size-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-foreground"
                aria-label="Scroll right"
              >
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="mt-10 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Loading listings…
          </p>
        ) : loadError ? (
          <p className="mt-10 border-l-2 border-destructive pl-3 text-sm text-destructive">
            {loadError}
          </p>
        ) : results.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-border p-14 text-center text-sm text-muted-foreground">
            No listing matches these filters yet.
          </p>
        ) : (
          <div
            ref={scrollerRef}
            className="mt-8 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {results.map((l, i) => {
              const owner = l.landlord;
              const gallery = l.photoUrls.length > 0 ? l.photoUrls : undefined;
              const photoSrc = gallery?.[0] ?? placeholderPhotos[i % placeholderPhotos.length]!.src;
              return (
                <Link
                  key={l.id}
                  href={`/listings/${l.id}`}
                  className="group relative block w-[320px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-foreground/40"
                >
                  {matchByListingId && (
                    <span className="absolute left-3 top-3 z-10 rounded-full bg-primary/90 px-2.5 py-1 font-mono text-[11px] tabular-nums text-primary-foreground backdrop-blur">
                      {matchByListingId.get(l.id) ?? 0}% match
                    </span>
                  )}
                  <img
                    src={photoSrc}
                    alt={l.title}
                    loading="lazy"
                    width={1200}
                    height={800}
                    className="aspect-[3/2] w-full object-cover"
                  />
                  {gallery && gallery.length > 1 && (
                    <div className="flex gap-1.5 p-2">
                      {gallery.slice(0, 5).map((src, j) => (
                        <img
                          key={j}
                          src={src}
                          alt=""
                          aria-hidden
                          className={`h-10 flex-1 rounded-lg object-cover ${j === 0 ? "ring-1 ring-accent" : "opacity-70"}`}
                        />
                      ))}
                    </div>
                  )}
                  <div className="p-5 pt-3">
                    <h3 className="font-display text-xl font-bold leading-snug">{l.title}</h3>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <BedSingle className="size-3.5" aria-hidden /> {l.roomType}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-3.5" aria-hidden /> {l.area}
                      </span>
                      {l.sqft != null && (
                        <span className="flex items-center gap-1.5">
                          <Ruler className="size-3.5" aria-hidden /> {l.sqft} sqft
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" aria-hidden />{" "}
                        {formatDate(l.availableFrom)}
                      </span>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-4">
                      <div>
                        <p className="font-mono text-lg font-semibold tabular-nums">
                          {bdt(l.rent)}
                        </p>
                        <p className="eyebrow">per month</p>
                      </div>
                      {owner.verified ? (
                        <VerifiedBadge since={owner.verifiedSince ?? undefined} />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-destructive">
                          <span aria-hidden>○</span> Unverified
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <p className="font-display text-3xl font-bold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

const inputCls =
  "mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}
