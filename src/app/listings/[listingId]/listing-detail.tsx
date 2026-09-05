"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import placeholder1 from "@/assets/listing-1.jpg";
import placeholder2 from "@/assets/listing-2.jpg";
import placeholder3 from "@/assets/listing-3.jpg";
import { Signal, VerifiedBadge } from "@/components/trust";
import { bdt, formatDate } from "@/data/module1";
import type { LandlordPublicProfile } from "@/lib/landlord-summary.server";
import type { PropertyHistory } from "@/lib/property-history.server";

const documentTypeLabel: Record<string, string> = {
  utility_bill: "Utility bill",
  sublet_agreement: "Sub-let lease agreement",
};

const ListingMap = dynamic(() => import("@/components/listing-map"), { ssr: false });

const placeholderPhotos = [placeholder1, placeholder2, placeholder3];

function pickPlaceholder(id: string) {
  const sum = [...id].reduce((s, c) => s + c.charCodeAt(0), 0);
  return placeholderPhotos[sum % placeholderPhotos.length]!;
}

export type ListingDetailData = {
  id: string;
  title: string;
  description: string | null;
  area: string;
  city: string;
  latitude: number;
  longitude: number;
  rent: number;
  deposit: number;
  roomType: string;
  availableFrom: string;
  postedOn: string;
  landlordId: string;
  houseRules: string[];
  photoUrls: string[];
  sqft: number | null;
};

export function ListingDetail({
  listing,
  owner,
  history,
}: {
  listing: ListingDetailData;
  owner: LandlordPublicProfile;
  history: PropertyHistory;
}) {
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const hasRealPhotos = listing.photoUrls.length > 0;
  const gallery = hasRealPhotos ? listing.photoUrls : [pickPlaceholder(listing.id).src];
  const [activePhoto, setActivePhoto] = useState(0);

  // check if already saved
  useEffect(() => {
    fetch(`/api/listings/save?listingId=${listing.id}`)
      .then((r) => r.json())
      .then((d) => setSaved(d.saved))
      .catch(() => {});
  }, [listing.id]);

  // check if already applied — otherwise this always starts false, so
  // reloading the page after applying shows "Apply" again and clicking it
  // just surfaces the API's "already applied" error instead of the true state.
  useEffect(() => {
    fetch("/api/applications/mine")
      .then((r) => (r.ok ? r.json() : []))
      .then((apps: { listing: { id: string } }[]) => {
        if (apps.some((a) => a.listing.id === listing.id)) setApplied(true);
      })
      .catch(() => {});
  }, [listing.id]);

  async function apply() {
    setApplying(true);
    setApplyMsg(null);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId: listing.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.status === 401) {
        setApplyMsg("sign-in");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Application failed.");
      setApplied(true);
      setApplyMsg("Application submitted! The landlord will see you in the applicant list.");
    } catch (e) {
      setApplyMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setApplying(false);
    }
  }

  async function toggleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/listings/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId: listing.id }),
      });
      const data = (await res.json()) as { saved?: boolean; error?: string };
      if (res.status === 401) {
        setSaveMsg("sign-in");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not save listing.");
      setSaved(data.saved ?? false);
      setSaveMsg(data.saved ? "Saved to your profile." : "Removed from saved listings.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="mx-auto max-w-6xl px-5 py-12">
      <Link href="/" className="eyebrow hover:text-foreground">
        ← Back to search
      </Link>

      <header className="mt-6 grid gap-8 border-b border-border pb-10 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="eyebrow">
            {listing.roomType} · {listing.area}, {listing.city}
            {listing.sqft != null && <> · {listing.sqft} sqft</>} · listed{" "}
            {formatDate(listing.postedOn)}
          </p>
          <h1 className="mt-4 max-w-2xl font-display text-4xl font-bold uppercase leading-[1.05] tracking-tight sm:text-5xl">
            {listing.title}
          </h1>
        </div>
        <div className="text-left md:text-right">
          <div className="font-mono text-3xl tabular-nums">{bdt(listing.rent)}</div>
          <div className="eyebrow">per month · {bdt(listing.deposit)} deposit</div>
        </div>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <img
            src={gallery[activePhoto] ?? gallery[0]}
            alt={listing.title}
            width={1200}
            height={800}
            className="aspect-[3/2] w-full rounded-[1.5rem] object-cover"
          />
          {!hasRealPhotos && (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Placeholder photo — the landlord hasn&apos;t uploaded real photos for this listing
              yet.
            </p>
          )}
          {gallery.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {gallery.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActivePhoto(i)}
                  className={`shrink-0 overflow-hidden rounded-2xl border ${i === activePhoto ? "border-accent" : "border-border opacity-70 hover:opacity-100"}`}
                >
                  <img
                    src={src}
                    alt={`${listing.title} photo ${i + 1}`}
                    className="h-16 w-24 object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {listing.description && (
            <section className="mt-10">
              <h2 className="text-2xl">About this place</h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {listing.description}
              </p>
            </section>
          )}

          {listing.houseRules.length > 0 && (
            <section className="mt-10">
              <h2 className="text-2xl">House rules</h2>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {listing.houseRules.map((rule, i) => (
                  <li key={i} className="flex gap-3">
                    <span aria-hidden className="text-muted-foreground">
                      ·
                    </span>
                    {rule}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-2xl">Location</h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <ListingMap lat={listing.latitude} lng={listing.longitude} label={listing.title} />
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-2xl">History</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Aggregate record for this property — anonymized, no tenant identities.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-5 rounded-2xl border border-border bg-[var(--card)] p-6 sm:grid-cols-4">
              <Signal label="Past tenancies" value={`${history.pastTenancyCount}`} />
              <Signal
                label="Avg. tenancy length"
                value={
                  history.avgTenancyMonths != null
                    ? `${history.avgTenancyMonths} mo`
                    : "No data yet"
                }
              />
              <Signal label="Disputes resolved" value={`${history.resolvedDisputeCount}`} />
              <Signal label="Disputes filed" value={`${history.totalDisputeCount}`} />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-border bg-[var(--card)] p-6">
            <p className="eyebrow">Landlord</p>
            <h2 className="mt-2 text-2xl">{owner.name}</h2>
            <div className="mt-3">
              {owner.verified ? (
                <VerifiedBadge since={owner.verifiedSince ?? undefined} />
              ) : (
                <span className="inline-flex items-center gap-1.5 border border-destructive/40 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-destructive">
                  <span aria-hidden>○</span> Identity unverified
                </span>
              )}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-5">
              <Signal label="Total listings" value={`${owner.totalListings}`} />
              <Signal label="Total applicants" value={`${owner.totalApplicants}`} />
              <Signal label="Completed rentals" value={`${owner.completedRentals}`} />
              <Signal
                label="Avg. response time"
                value={
                  owner.avgResponseHours != null ? `${owner.avgResponseHours}h` : "No data yet"
                }
              />
              <Signal label="Available from" value={formatDate(listing.availableFrom)} />
              <Signal label="Activity" value={owner.lastActiveLabel} />
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              This card shows real, admin-verified identity status. See the History section below
              for this property&apos;s tenancy and dispute record.
            </p>
          </div>

          {owner.documents.length > 0 && (
            <div className="rounded-2xl border border-border bg-[var(--card)] p-6">
              <p className="eyebrow">Documents for inspection</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Uploaded by the verified landlord for prospective tenants to review.
              </p>
              <ul className="mt-4 space-y-2">
                {owner.documents.map((d) => (
                  <li key={d.id}>
                    <a
                      href={d.fileUrl}
                      download={d.label}
                      className="flex items-center justify-between gap-3 border-b border-border pb-2 text-sm hover:underline"
                    >
                      <span>{d.label}</span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {documentTypeLabel[d.type] ?? d.type}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-3 rounded-2xl border border-border bg-[var(--card)] p-6">
            <p className="eyebrow">Actions</p>

            {/* Save listing */}
            <button
              type="button"
              onClick={toggleSave}
              disabled={saving}
              className={`w-full rounded-full border px-4 py-3 text-sm transition-colors disabled:opacity-50 ${saved ? "border-primary bg-primary text-primary-foreground hover:opacity-90" : "border-border hover:bg-secondary"}`}
            >
              {saving ? "…" : saved ? "✓ Saved to profile" : "Save listing"}
            </button>

            {/* Apply */}
            <p className="text-sm text-muted-foreground">
              Applying attaches your account to the landlord&apos;s applicant list for this room.
            </p>
            {listing.roomType === "Shared mess" && (
              <p className="border-l-2 border-accent pl-3 text-xs text-muted-foreground">
                This is a shared room.{" "}
                <Link href="/roommates" className="underline underline-offset-4">
                  Save your roommate preferences
                </Link>{" "}
                — if another compatible tenant applies here too, the landlord sees your
                compatibility score alongside both applications.
              </p>
            )}
            <button
              type="button"
              onClick={apply}
              disabled={applying || applied}
              className="w-full rounded-full bg-accent px-4 py-3 text-sm text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {applying ? "Submitting…" : applied ? "✓ Applied" : "Apply for this room"}
            </button>

            {saveMsg &&
              (saveMsg === "sign-in" ? (
                <p className="border-l-2 border-accent pl-3 text-xs text-muted-foreground">
                  <Link href="/auth" className="underline underline-offset-4">
                    Sign in
                  </Link>{" "}
                  to save listings.
                </p>
              ) : (
                <p className="border-l-2 border-accent pl-3 text-xs text-muted-foreground">
                  {saveMsg}
                </p>
              ))}
            {applyMsg &&
              (applyMsg === "sign-in" ? (
                <p className="border-l-2 border-accent pl-3 text-xs text-muted-foreground">
                  <Link href="/auth" className="underline underline-offset-4">
                    Sign in as a tenant
                  </Link>{" "}
                  to apply for this listing.
                </p>
              ) : (
                <p className="border-l-2 border-accent pl-3 text-xs text-muted-foreground">
                  {applyMsg}
                </p>
              ))}
          </div>
        </aside>
      </div>
    </article>
  );
}
