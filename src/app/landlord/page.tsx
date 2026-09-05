"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { Signal, VerificationProgressBar } from "@/components/trust";
import { ReviewPanel } from "@/components/review-panel";
import { MoveOutPanel } from "@/components/move-out-panel";
import { ImprovementCostLog } from "@/components/improvement-cost-log";
import { ActivityTimeline, type ActivityEventItem } from "@/components/activity-timeline";
import { LandlordAnalyticsSection } from "@/components/analytics-dashboard";
import { LandlordLeaseCalendar } from "@/components/landlord-lease-calendar";
import { landlordVerificationProgress } from "@/lib/verification-progress";
import { formatLastActive, type TrustSignals } from "@/lib/trust-signals";
import {
  bdt,
  compatibility,
  formatDate,
  type ApplicantCompatibilityPair,
  type RoomType,
  type RoommateProfile,
} from "@/data/module1";

type LandlordDocument = {
  id: string;
  type: "utility_bill" | "sublet_agreement";
  label: string;
  fileUrl: string;
  createdAt: string;
};

const documentTypeLabel: Record<LandlordDocument["type"], string> = {
  utility_bill: "Utility bill",
  sublet_agreement: "Sub-let lease agreement",
};

const MAX_DOC_BYTES = 1_500_000;

function fileToBase64Doc(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

type MyListing = {
  id: string;
  title: string;
  area: string;
  rent: number;
  roomType: string;
  availableFrom: string;
  status: string;
  _count: { applications: number };
};

type ApplicationStatus =
  "draft" | "submitted" | "shortlisted" | "accepted" | "declined" | "completed";

type ApplicantHistory = {
  confirmedTenancyCount: number;
  onTimePaymentRate: number | null;
  disputeCount: number;
  resolvedDisputeCount: number;
};

type RealApplication = {
  id: string;
  note: string | null;
  status: ApplicationStatus;
  createdAt: string;
  profile: {
    id: string;
    displayName: string;
    roommatePreference: RoommateProfile | null;
    tenantVerification: { status: "pending" | "verified" | "rejected" } | null;
  };
  history: ApplicantHistory | null;
};

const roomTypeOptions: RoomType[] = ["Single room", "Shared mess", "Studio", "Full flat"];

const dhakaAreas = [
  "Shantinagar",
  "Mohammadpur",
  "Uttara Sector 7",
  "Dhanmondi",
  "Gulshan",
  "Banani",
  "Baridhara",
  "Bashundhara R/A",
  "Mirpur",
  "Khilgaon",
  "Rampura",
  "Badda",
  "Malibagh",
  "Wari",
  "Lalmatia",
  "Farmgate",
  "Mohakhali",
  "Motijheel",
  "New Market",
];

const emptyForm = {
  title: "",
  description: "",
  area: "",
  city: "Dhaka",
  latitude: "23.8103",
  longitude: "90.4125",
  rent: "",
  deposit: "",
  sqft: "",
  roomType: "Single room" as RoomType,
  availableFrom: "",
  status: "Active" as "Active" | "Draft",
  houseRulesText: "",
  photoUrls: [] as string[],
};

const MAX_PHOTO_BYTES = 1_500_000; // ~1.5MB raw, stays under the server's base64 char limit
const MAX_PHOTOS = 6;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

export default function LandlordDeskPage() {
  const { data: session, status } = useSession();
  const sessionName = session?.user?.name ?? "";

  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [selected, setSelected] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);

  const [applications, setApplications] = useState<RealApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [verificationStatus, setVerificationStatus] = useState<
    "pending" | "verified" | "rejected" | null
  >(null);
  const [verificationNote, setVerificationNote] = useState<string | null>(null);
  const [verificationDocs, setVerificationDocs] = useState<{
    nidPhotoUrl: string | null;
    ownershipProofUrl: string | null;
    selfiePhotoUrl: string | null;
    status: "pending" | "verified" | "rejected";
  } | null>(null);
  const [trustSignals, setTrustSignals] = useState<TrustSignals | null>(null);

  const [documents, setDocuments] = useState<LandlordDocument[]>([]);
  const [docLabel, setDocLabel] = useState("");
  const [docType, setDocType] = useState<LandlordDocument["type"]>("utility_bill");
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  async function loadDocuments() {
    try {
      const res = await fetch("/api/landlord/documents");
      if (res.ok) setDocuments(await res.json());
    } catch {
      // best-effort
    }
  }

  async function uploadDocument(file: File | null) {
    if (!file || !docLabel.trim()) {
      setDocError("Give the document a label and choose a file first.");
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      setDocError(`File must be under ${Math.round(MAX_DOC_BYTES / 1_000_000)}MB.`);
      return;
    }
    setDocUploading(true);
    setDocError(null);
    try {
      const fileUrl = await fileToBase64Doc(file);
      const res = await fetch("/api/landlord/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: docType, label: docLabel.trim(), fileUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not upload document.");
      setDocLabel("");
      await loadDocuments();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Could not upload document.");
    } finally {
      setDocUploading(false);
    }
  }

  async function deleteDocument(id: string) {
    setDocuments((docs) => docs.filter((d) => d.id !== id));
    await fetch(`/api/landlord/documents/${id}`, { method: "DELETE" }).catch(() => {});
  }

  const [reviewSummary, setReviewSummary] = useState<{ average: number | null; count: number }>({
    average: null,
    count: 0,
  });

  const [openTimelineId, setOpenTimelineId] = useState<string | null>(null);
  const [activityCache, setActivityCache] = useState<Record<string, ActivityEventItem[]>>({});

  async function toggleTimeline(tenantProfileId: string) {
    if (openTimelineId === tenantProfileId) {
      setOpenTimelineId(null);
      return;
    }
    setOpenTimelineId(tenantProfileId);
    if (activityCache[tenantProfileId]) return;
    try {
      const res = await fetch(
        `/api/activity?listingId=${selected}&tenantProfileId=${tenantProfileId}`,
      );
      if (res.ok) {
        const data: ActivityEventItem[] = await res.json();
        setActivityCache((prev) => ({ ...prev, [tenantProfileId]: data }));
      }
    } catch {
      // best-effort — the toggle just stays in its loading state
    }
  }

  async function loadMyListings() {
    setListingsLoading(true);
    try {
      const res = await fetch("/api/listings/mine");
      if (res.ok) {
        const data: MyListing[] = await res.json();
        setMyListings(data);
        setSelected((prev) =>
          prev && data.some((l) => l.id === prev) ? prev : (data[0]?.id ?? ""),
        );
      }
    } finally {
      setListingsLoading(false);
    }
  }

  useEffect(() => {
    if (status === "authenticated") {
      // React's own documented data-fetching pattern (set loading, then fetch, then
      // clear it) — flagged by the newer stricter set-state-in-effect rule, but not
      // a bug: only runs once `status` resolves to authenticated.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadMyListings();
      fetch("/api/landlord/verification")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) {
            setVerificationStatus(d.status);
            setVerificationNote(d.reviewNote);
            setVerificationDocs({
              nidPhotoUrl: d.nidPhotoUrl,
              ownershipProofUrl: d.ownershipProofUrl,
              selfiePhotoUrl: d.selfiePhotoUrl,
              status: d.status,
            });
          }
        })
        .catch(() => {});
      fetch("/api/landlord/trust-signals")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setTrustSignals(d);
        })
        .catch(() => {});
      loadDocuments();
      fetch("/api/reviews/received")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setReviewSummary({ average: d.average, count: d.count });
        })
        .catch(() => {});
    } else if (status !== "loading") {
      setListingsLoading(false);
    }
  }, [status]);

  async function loadApplications(listingId: string) {
    if (!listingId) {
      setApplications([]);
      return;
    }
    setApplicationsLoading(true);
    try {
      const res = await fetch(`/api/applications?listingId=${listingId}`);
      setApplications(res.ok ? await res.json() : []);
    } finally {
      setApplicationsLoading(false);
    }
  }

  useEffect(() => {
    // React's own documented data-fetching pattern (set loading, then fetch, then
    // clear it) — flagged by the newer stricter set-state-in-effect rule, but not
    // a bug: needed so switching the selected listing shows fresh applicants, not
    // the previous listing's stale list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadApplications(selected);
  }, [selected]);

  const compatPairs = useMemo(() => {
    const withPrefs = applications.filter((a) => a.profile.roommatePreference);
    const pairs: ApplicantCompatibilityPair[] = [];
    for (let i = 0; i < withPrefs.length; i++) {
      for (let j = i + 1; j < withPrefs.length; j++) {
        const a = withPrefs[i]!;
        const b = withPrefs[j]!;
        const result = compatibility(a.profile.roommatePreference!, b.profile.roommatePreference!);
        pairs.push({
          applicantAId: a.id,
          applicantBId: b.id,
          applicantAName: a.profile.displayName,
          applicantBName: b.profile.displayName,
          score: result.total,
          hardBlocked: result.hardBlocked,
        });
      }
    }
    return pairs.sort((x, y) => y.score - x.score);
  }, [applications]);

  const rankedApplications = useMemo(() => {
    const verifiedRank = (a: RealApplication) =>
      a.profile.tenantVerification?.status === "verified" ? 0 : 1;
    return [...applications].sort(
      (a, b) =>
        verifiedRank(a) - verifiedRank(b) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [applications]);

  async function setApplicationStatus(
    applicationId: string,
    next: "accepted" | "declined" | "completed",
  ) {
    setActingOn(applicationId);
    setActionError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not update application.");
      await loadApplications(selected);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update application.");
    } finally {
      setActingOn(null);
    }
  }

  function updateForm<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setFormNotice(null);
  }

  async function startEdit(listingId: string) {
    setEditLoadingId(listingId);
    setFormError(null);
    try {
      const res = await fetch(`/api/listings/${listingId}`);
      if (!res.ok) throw new Error("Could not load this listing's details.");
      const l = await res.json();
      setForm({
        title: l.title,
        description: l.description ?? "",
        area: l.area,
        city: l.city,
        latitude: String(l.latitude),
        longitude: String(l.longitude),
        rent: String(l.rent),
        deposit: String(l.deposit),
        sqft: l.sqft != null ? String(l.sqft) : "",
        roomType: l.roomType,
        availableFrom: String(l.availableFrom).slice(0, 10),
        status: l.status === "Draft" ? "Draft" : "Active",
        houseRulesText: Array.isArray(l.houseRules) ? l.houseRules.join("\n") : "",
        photoUrls: Array.isArray(l.photoUrls) ? l.photoUrls : [],
      });
      setEditingId(listingId);
      setShowForm(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not load this listing's details.");
    } finally {
      setEditLoadingId(null);
    }
  }

  async function submitListing(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    setFormNotice(null);
    try {
      const url = editingId ? `/api/listings/${editingId}` : "/api/listings";
      const method = editingId ? "PATCH" : "POST";
      const { houseRulesText, sqft, ...rest } = form;
      const payload = {
        ...rest,
        houseRules: houseRulesText
          .split("\n")
          .map((r) => r.trim())
          .filter(Boolean),
        ...(sqft.trim() ? { sqft } : {}),
      };
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? `Could not ${editingId ? "update" : "create"} listing.`);
      const wasEditing = !!editingId;
      closeForm();
      if (data.downgradedToDraft) {
        setFormNotice(
          wasEditing
            ? "Saved, but kept as a draft, not Active — only admin-verified landlords can publish active listings. It'll go live once you're verified."
            : "Saved as a draft, not Active — only admin-verified landlords can publish active listings. It'll go live once you're verified.",
        );
      }
      await loadMyListings();
      if (selected === editingId) await loadApplications(selected);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save listing.");
    } finally {
      setCreating(false);
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
        <p className="eyebrow">Landlord desk</p>
        <h1 className="mt-4 text-3xl">Sign in to access the landlord desk</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          You need a landlord account to review applicants and manage listings.
        </p>
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

  if (!isLandlord) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-24 text-center">
        <p className="eyebrow">Landlord desk</p>
        <h1 className="mt-4 text-3xl">Landlord accounts only</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          This page is only accessible to landlord accounts. Sign in with a landlord account to
          continue.
        </p>
        <Link
          href="/auth"
          className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90"
        >
          Sign in as landlord
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <header className="border-b border-border pb-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Landlord desk</p>
            <h1 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
              {sessionName}
            </h1>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <Signal label="Total listings" value={`${myListings.length}`} />
            <Signal
              label="Active listings"
              value={`${myListings.filter((l) => l.status === "Active").length}`}
            />
            <Signal
              label="Total applicants"
              value={`${myListings.reduce((sum, l) => sum + l._count.applications, 0)}`}
            />
            <Signal
              label="Review rating"
              value={
                reviewSummary.average != null
                  ? `${reviewSummary.average.toFixed(1)} ★ (${reviewSummary.count})`
                  : "—"
              }
            />
          </div>
        </div>

        {verificationStatus && verificationStatus !== "verified" && (
          <div
            className={`mt-6 border-l-2 px-4 py-3 text-sm ${
              verificationStatus === "pending"
                ? "border-accent text-muted-foreground"
                : "border-destructive text-destructive"
            }`}
          >
            {verificationStatus === "pending" ? (
              "Your NID and property documents are pending admin review. You can create draft listings now; they'll go active once you're verified."
            ) : (
              <>
                Your landlord verification was rejected
                {verificationNote ? `: ${verificationNote}` : "."} Listings stay draft-only until
                you&apos;re verified — contact an admin to resubmit.
              </>
            )}
          </div>
        )}
        {verificationStatus === "verified" && (
          <div className="mt-6 border-l-2 border-primary px-4 py-3 text-sm text-primary">
            ✓ Verified landlord — your listings can go live as Active.
          </div>
        )}
      </header>

      <section className="mt-12">
        <h2 className="text-2xl mb-1">Trust profile</h2>
        <p className="mb-6 text-xs text-muted-foreground">
          What tenants see about you at a glance — verification progress, trust signals, and
          documents you&apos;ve made available for inspection.
        </p>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-2xl border border-border bg-[var(--card)] p-6">
            <VerificationProgressBar progress={landlordVerificationProgress(verificationDocs)} />
          </div>
          <div className="grid grid-cols-2 gap-5 rounded-2xl border border-border bg-[var(--card)] p-6 sm:grid-cols-4">
            <Signal
              label="Completed rentals"
              value={trustSignals ? `${trustSignals.completedRentals}` : "…"}
            />
            <Signal
              label="Avg. response time"
              value={
                trustSignals
                  ? trustSignals.avgResponseHours != null
                    ? `${trustSignals.avgResponseHours}h`
                    : "No data yet"
                  : "…"
              }
            />
            <Signal
              label="Response rate"
              value={
                trustSignals
                  ? trustSignals.responseRate != null
                    ? `${trustSignals.responseRate}%`
                    : "No data yet"
                  : "…"
              }
            />
            <Signal
              label="Activity"
              value={trustSignals ? formatLastActive(trustSignals.lastActiveAt) : "…"}
            />
          </div>
        </div>

        {verificationStatus === "verified" && (
          <div className="mt-6 rounded-2xl border border-border bg-[var(--card)] p-6">
            <p className="eyebrow">Documents for tenant inspection</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Upload utility bills or sub-let lease agreements — verified landlords only. These are
              shown publicly on your listings, not the NID/ownership docs used for admin review.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="eyebrow">Document type</span>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as LandlordDocument["type"])}
                  className={inputCls}
                >
                  <option value="utility_bill">Utility bill</option>
                  <option value="sublet_agreement">Sub-let lease agreement</option>
                </select>
              </label>
              <label className="block flex-1">
                <span className="eyebrow">Label</span>
                <input
                  value={docLabel}
                  onChange={(e) => setDocLabel(e.target.value)}
                  placeholder="e.g. DESCO bill, July 2026"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="eyebrow">File</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={docUploading}
                  onChange={(e) => uploadDocument(e.target.files?.[0] ?? null)}
                  className="mt-2 text-xs file:mr-3 file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-xs"
                />
              </label>
            </div>
            {docError && <p className="mt-3 text-sm text-destructive">{docError}</p>}

            {documents.length > 0 && (
              <ul className="mt-5 space-y-2 border-t border-border pt-4">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      {d.label}{" "}
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {documentTypeLabel[d.type]}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteDocument(d.id)}
                      className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-2xl">Analytics</h2>
        <LandlordAnalyticsSection />
      </section>

      <section className="mt-16">
        <h2 className="text-2xl mb-1">Renewal calendar</h2>
        <p className="mb-6 text-xs text-muted-foreground">
          Every active, fully-signed tenancy across your portfolio, grouped by the month its
          renewal-decision window opens.
        </p>
        <LandlordLeaseCalendar />
      </section>

      <section className="mt-16">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl">Listings</h2>
          <button
            type="button"
            onClick={() => {
              if (showForm) closeForm();
              else setShowForm(true);
            }}
            className="rounded-full border border-border px-4 py-2 text-xs hover:bg-secondary"
          >
            {showForm ? "Cancel" : "+ New listing"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={submitListing}
            className="mt-6 grid gap-5 rounded-2xl border border-border bg-[var(--card)] p-6 sm:grid-cols-2"
          >
            {editingId && (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                Editing listing {editingId.slice(0, 8)}
              </p>
            )}
            <Field label="Title" full>
              <input
                required
                value={form.title}
                onChange={(e) => updateForm("title", e.target.value)}
                placeholder="Sunlit single room, quiet lane off Bailey Road"
                className={inputCls}
              />
            </Field>
            <Field label="Description (optional)" full>
              <textarea
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                rows={2}
                className={inputCls}
              />
            </Field>
            <Field label="Area">
              <select
                required
                value={form.area}
                onChange={(e) => updateForm("area", e.target.value)}
                className={inputCls}
              >
                <option value="" disabled>
                  Select an area
                </option>
                {(form.area && !dhakaAreas.includes(form.area)
                  ? [form.area, ...dhakaAreas]
                  : dhakaAreas
                ).map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </Field>
            <Field label="City">
              <input
                required
                value={form.city}
                onChange={(e) => updateForm("city", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Latitude">
              <input
                required
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => updateForm("latitude", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Longitude">
              <input
                required
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => updateForm("longitude", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Rent per month (৳)">
              <input
                required
                type="number"
                min={0}
                value={form.rent}
                onChange={(e) => updateForm("rent", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Deposit (৳)">
              <input
                required
                type="number"
                min={0}
                value={form.deposit}
                onChange={(e) => updateForm("deposit", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Size (sq ft, optional)">
              <input
                type="number"
                min={0}
                value={form.sqft}
                onChange={(e) => updateForm("sqft", e.target.value)}
                placeholder="e.g. 450"
                className={inputCls}
              />
            </Field>
            <Field label="Room type">
              <select
                value={form.roomType}
                onChange={(e) => updateForm("roomType", e.target.value as RoomType)}
                className={inputCls}
              >
                {roomTypeOptions.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Available from">
              <input
                required
                type="date"
                value={form.availableFrom}
                onChange={(e) => updateForm("availableFrom", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Publish as">
              <select
                value={form.status}
                onChange={(e) => updateForm("status", e.target.value as "Active" | "Draft")}
                className={inputCls}
              >
                <option value="Active">Active (visible in search)</option>
                <option value="Draft">Draft (hidden for now)</option>
              </select>
            </Field>

            <Field label="House rules (optional, one per line)" full>
              <textarea
                value={form.houseRulesText}
                onChange={(e) => updateForm("houseRulesText", e.target.value)}
                rows={3}
                placeholder={
                  "No smoking indoors\nNo overnight guests without notice\nQuiet hours after 10pm"
                }
                className={inputCls}
              />
            </Field>

            <Field label={`Photos (optional, up to ${MAX_PHOTOS})`} full>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  const room = MAX_PHOTOS - form.photoUrls.length;
                  if (room <= 0) {
                    setFormError(`You can upload at most ${MAX_PHOTOS} photos.`);
                    return;
                  }
                  const oversized = files.some((f) => f.size > MAX_PHOTO_BYTES);
                  if (oversized) {
                    setFormError(
                      `Each photo must be under ${Math.round(MAX_PHOTO_BYTES / 1_000_000)}MB.`,
                    );
                    return;
                  }
                  const encoded = await Promise.all(files.slice(0, room).map(fileToBase64));
                  updateForm("photoUrls", [...form.photoUrls, ...encoded]);
                }}
                className="mt-2 w-full text-xs file:mr-3 file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-xs"
              />
              {form.photoUrls.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {form.photoUrls.map((url, i) => (
                    <div key={i} className="relative">
                      <img
                        src={url}
                        alt={`Listing photo ${i + 1}`}
                        className="h-20 w-28 rounded-xl border border-border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateForm(
                            "photoUrls",
                            form.photoUrls.filter((_, j) => j !== i),
                          )
                        }
                        className="absolute -right-2 -top-2 flex size-5 items-center justify-center border border-border bg-paper text-xs hover:bg-destructive/10"
                        aria-label="Remove photo"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Field>

            {formError && <p className="text-sm text-destructive sm:col-span-2">{formError}</p>}

            <button
              type="submit"
              disabled={creating}
              className="rounded-full bg-accent px-4 py-3 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-50 sm:col-span-2"
            >
              {creating
                ? editingId
                  ? "Saving…"
                  : "Publishing…"
                : editingId
                  ? "Save changes"
                  : "Publish listing"}
            </button>
          </form>
        )}

        {formNotice && (
          <p className="mt-6 border-l-2 border-accent pl-3 text-sm text-muted-foreground">
            {formNotice}
          </p>
        )}

        {listingsLoading ? (
          <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Loading your listings…
          </p>
        ) : myListings.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            You haven&apos;t posted any listings yet.
          </p>
        ) : (
          <table className="mt-5 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-border">
                {["Ref", "Listing", "Rent", "Available", "Applicants", "Status", ""].map((h) => (
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
              {myListings.map((l) => (
                <tr key={l.id} className="border-b border-border align-top">
                  <td className="py-4 pr-4 font-mono text-xs text-muted-foreground">
                    {l.id.slice(0, 8)}
                  </td>
                  <td className="max-w-sm py-4 pr-4">
                    <Link href={`/listings/${l.id}`} className="hover:underline">
                      {l.title}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {l.roomType} · {l.area}
                    </p>
                  </td>
                  <td className="py-4 pr-4 font-mono tabular-nums">{bdt(l.rent)}</td>
                  <td className="py-4 pr-4 font-mono text-xs">{formatDate(l.availableFrom)}</td>
                  <td className="py-4 pr-4">
                    <button
                      type="button"
                      onClick={() => setSelected(l.id)}
                      className={`font-mono text-xs underline-offset-4 hover:underline ${selected === l.id ? "text-accent" : ""}`}
                    >
                      {l._count.applications} · review
                    </button>
                  </td>
                  <td className="py-4 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {l.status}
                  </td>
                  <td className="py-4 pl-4 text-right">
                    <button
                      type="button"
                      disabled={editLoadingId === l.id}
                      onClick={() => startEdit(l.id)}
                      className="font-mono text-xs underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      {editLoadingId === l.id ? "…" : "Edit"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-16">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl">Applicants</h2>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {selected
              ? `${selected.slice(0, 8)} · verified first, then by application date`
              : "select a listing above"}
          </p>
        </div>

        {actionError && <p className="mt-4 text-sm text-destructive">{actionError}</p>}

        {applicationsLoading ? (
          <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Loading applicants…
          </p>
        ) : applications.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
            No applications on this listing yet.
          </p>
        ) : (
          <>
            <p className="mt-4 max-w-2xl text-xs text-muted-foreground">
              Ranked by real identity verification status first, application date as tiebreak. Each
              applicant&apos;s history panel below shows their real payment and dispute record.
            </p>
            <ol className="mt-4 space-y-4">
              {rankedApplications.map((a, i) => (
                <li
                  key={a.id}
                  className="grid gap-6 rounded-2xl border border-border bg-[var(--card)] p-6 sm:grid-cols-[auto_1fr_180px]"
                >
                  <div className="font-mono text-3xl tabular-nums text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl">{a.profile.displayName}</h3>
                      {a.profile.tenantVerification?.status === "verified" ? (
                        <span className="inline-flex items-center gap-1.5 border border-primary/40 bg-primary/5 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-primary">
                          <span aria-hidden>✓</span> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                          <span aria-hidden>○</span> Unverified
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Applied {formatDate(a.createdAt)}
                    </p>
                    {a.note && (
                      <p className="mt-3 text-xs text-muted-foreground italic">
                        &ldquo;{a.note}&rdquo;
                      </p>
                    )}
                    {a.history && (
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
                        <span>{a.history.confirmedTenancyCount} confirmed tenancies</span>
                        <span>
                          {a.history.onTimePaymentRate != null
                            ? `${a.history.onTimePaymentRate}% on-time payments`
                            : "No payment history"}
                        </span>
                        <span>
                          {a.history.resolvedDisputeCount}/{a.history.disputeCount} disputes
                          resolved
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="eyebrow">Status</span>
                      <span
                        className={`font-mono text-xs uppercase tracking-wider ${
                          a.status === "accepted" || a.status === "completed"
                            ? "text-trust-high"
                            : a.status === "declined"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }`}
                      >
                        {a.status}
                      </span>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        disabled={actingOn === a.id || a.status !== "submitted"}
                        onClick={() => setApplicationStatus(a.id, "accepted")}
                        className={`flex-1 rounded-full px-3 py-2 text-xs transition-colors disabled:opacity-60 ${
                          a.status === "accepted"
                            ? "bg-primary text-paper"
                            : "bg-accent text-accent-foreground hover:opacity-90"
                        }`}
                      >
                        {actingOn === a.id
                          ? "…"
                          : a.status === "accepted"
                            ? "✓ Accepted"
                            : "Accept"}
                      </button>
                      <button
                        type="button"
                        disabled={actingOn === a.id || a.status !== "submitted"}
                        onClick={() => setApplicationStatus(a.id, "declined")}
                        className={`flex-1 rounded-full border px-3 py-2 text-xs transition-colors disabled:opacity-60 ${
                          a.status === "declined"
                            ? "border-destructive/50 text-destructive"
                            : "border-border hover:bg-secondary"
                        }`}
                      >
                        {actingOn === a.id
                          ? "…"
                          : a.status === "declined"
                            ? "✗ Declined"
                            : "Decline"}
                      </button>
                    </div>
                    {a.status === "accepted" && (
                      <div className="mt-3 flex flex-col items-center gap-1">
                        <Link
                          href={`/agreement?applicationId=${a.id}`}
                          className="text-center text-xs underline underline-offset-4"
                        >
                          Draft agreement →
                        </Link>
                        <Link
                          href="/maintenance"
                          className="text-center text-xs underline underline-offset-4"
                        >
                          Maintenance →
                        </Link>
                        <Link
                          href={`/messages/${a.id}`}
                          className="text-center text-xs underline underline-offset-4"
                        >
                          Message →
                        </Link>
                        <Link
                          href="/disputes"
                          className="text-center text-xs underline underline-offset-4"
                        >
                          File a dispute →
                        </Link>
                        <button
                          type="button"
                          onClick={() => toggleTimeline(a.profile.id)}
                          className="text-center text-xs text-muted-foreground underline underline-offset-4"
                        >
                          {openTimelineId === a.profile.id
                            ? "Hide timeline ▴"
                            : "Activity timeline ▾"}
                        </button>
                        <MoveOutPanel applicationId={a.id} viewerIsLandlord />
                        <ImprovementCostLog applicationId={a.id} viewerIsLandlord />
                      </div>
                    )}
                    {a.status === "completed" && (
                      <>
                        <div className="flex flex-col items-center gap-1">
                          <Link
                            href={`/messages/${a.id}`}
                            className="text-center text-xs underline underline-offset-4"
                          >
                            Message →
                          </Link>
                          <Link
                            href="/disputes"
                            className="text-center text-xs underline underline-offset-4"
                          >
                            File a dispute →
                          </Link>
                        </div>
                        <ReviewPanel applicationId={a.id} viewerIsTenant={false} />
                      </>
                    )}
                  </div>
                  {a.status === "accepted" && openTimelineId === a.profile.id && (
                    <div className="sm:col-span-3">
                      {activityCache[a.profile.id] ? (
                        <ActivityTimeline events={activityCache[a.profile.id]!} />
                      ) : (
                        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                          Loading…
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      {compatPairs.length > 0 && (
        <section className="mt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl">Applicant compatibility</h2>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {selected.slice(0, 8)} · budget 30 · sleep 20 · smoking 20 · study 15 · visitors 15
            </p>
          </div>
          <ol className="mt-6 space-y-3">
            {compatPairs.map((pair) => (
              <li
                key={`${pair.applicantAId}-${pair.applicantBId}`}
                className="flex items-center justify-between gap-6 rounded-2xl border border-border bg-[var(--card)] px-6 py-4"
              >
                <span className="text-sm">
                  {pair.applicantAName}
                  <span className="mx-2 font-mono text-[11px] text-muted-foreground">+</span>
                  {pair.applicantBName}
                </span>
                {pair.hardBlocked ? (
                  <span className="border border-destructive/50 px-2 py-0.5 font-mono text-[11px] text-destructive">
                    Hard conflict — smoking
                  </span>
                ) : (
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      pair.score >= 70
                        ? "text-trust-high"
                        : pair.score >= 45
                          ? "text-accent"
                          : "text-trust-low"
                    }`}
                  >
                    {pair.score}% compatible
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

const inputCls =
  "mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground";

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}
