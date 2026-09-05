"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { bdt, formatDate, getLandlord, listings } from "@/data/module1";
import { downloadAgreementPdf } from "@/lib/agreement-pdf";
import { SharePanel } from "@/components/share-panel";
import { SignaturePad } from "@/components/signature-pad";
import {
  ExportSettings,
  downloadCsv,
  downloadSimplePdf,
  formatScore,
  type ExportField,
  type ScoreFormat,
} from "@/components/export-settings";

type AgreementClause = { title: string; body: string };

type AgreementListing = {
  id: string;
  title: string;
  roomType: string;
  area: string;
  city: string;
  rent: number;
  deposit: number;
  availableFrom: string;
  landlordId: string;
  coords: string;
  houseRules: string[];
};

type AgreementTenant = { name: string; nid: string; phone: string };

const demoListing = listings[0]!;
const DEMO_LISTING: AgreementListing = {
  id: demoListing.id,
  title: demoListing.title,
  roomType: demoListing.roomType,
  area: demoListing.area,
  city: demoListing.city,
  rent: demoListing.rent,
  deposit: demoListing.deposit,
  availableFrom: demoListing.availableFrom,
  landlordId: demoListing.landlordId,
  coords: `${demoListing.coords.lat.toFixed(4)}, ${demoListing.coords.lng.toFixed(4)}`,
  houseRules: demoListing.houseRules,
};
const DEMO_TENANT: AgreementTenant = {
  name: "Tanzila Rahman",
  nid: "1994 7712 8830",
  phone: "+880 1712 445 908",
};

const DEFAULT_FIELDS: ExportField[] = [
  { key: "reference", label: "Reference", enabled: true },
  { key: "landlord", label: "Landlord", enabled: true },
  { key: "tenant", label: "Tenant", enabled: true },
  { key: "property", label: "Property", enabled: true },
  { key: "rent", label: "Monthly rent", enabled: true },
  { key: "deposit", label: "Security deposit", enabled: true },
  { key: "term", label: "Term", enabled: true },
  { key: "houseRules", label: "House rules", enabled: true },
  { key: "clauses", label: "Agreement clauses", enabled: true },
  { key: "source", label: "Draft source (AI / fallback)", enabled: false },
];

export default function AgreementPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-5 py-24 text-center">
          <p className="font-mono text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <AgreementPage />
    </Suspense>
  );
}

function AgreementPage() {
  const { status } = useSession();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("applicationId");

  const [loadingReal, setLoadingReal] = useState(!!applicationId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [realListing, setRealListing] = useState<AgreementListing | null>(null);
  const [realTenant, setRealTenant] = useState<AgreementTenant | null>(null);
  const [realLandlordName, setRealLandlordName] = useState<string | null>(null);
  const [realLandlordVerifiedSince, setRealLandlordVerifiedSince] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    // React's own documented data-fetching pattern (set loading, then fetch, then
    // clear it) — flagged by the newer stricter set-state-in-effect rule, but not
    // a bug: needed so switching applicationId shows a fresh loading state, not
    // stale data from the previous one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingReal(true);
    setLoadError(null);
    fetch(`/api/applications/${applicationId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load this application.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setRealListing({
          id: data.listing.id,
          title: data.listing.title,
          roomType: data.listing.roomType,
          area: data.listing.area,
          city: data.listing.city,
          rent: data.listing.rent,
          deposit: data.listing.deposit,
          availableFrom: data.listing.availableFrom,
          landlordId: data.listing.landlordId,
          coords: `${data.listing.latitude.toFixed(4)}, ${data.listing.longitude.toFixed(4)}`,
          houseRules: data.listing.houseRules ?? [],
        });
        setRealTenant({
          name: data.tenantName,
          nid: "NID verification pending",
          phone: "Not yet on file",
        });
        setRealLandlordName(data.landlordName);
        setRealLandlordVerifiedSince(data.landlordVerifiedSince ?? null);
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Could not load this application.");
      })
      .finally(() => {
        if (!cancelled) setLoadingReal(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const listing = realListing ?? DEMO_LISTING;
  const tenant = realTenant ?? DEMO_TENANT;
  const mockOwner = getLandlord(listing.landlordId);
  // For a real application, listing.landlordId is a real DB id that's never in
  // the mock landlordsById map, so getLandlord() always falls back to its
  // "unknown landlord" placeholder (verifiedSince "—") — only overriding
  // `name` used to leave that bogus placeholder in place even for landlords
  // who are genuinely admin-verified, both on screen and in the terms sent to
  // Gemini for drafting.
  const owner =
    applicationId && realLandlordName
      ? {
          ...mockOwner,
          name: realLandlordName,
          verifiedSince: realLandlordVerifiedSince ?? "Not yet verified",
        }
      : mockOwner;

  const [duration, setDuration] = useState(12);
  const [clauses, setClauses] = useState<AgreementClause[] | null>(null);
  const [source, setSource] = useState<"ai" | "fallback" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tenantSignature, setTenantSignature] = useState<string | null>(null);
  const [landlordSignature, setLandlordSignature] = useState<string | null>(null);
  const [signingRole, setSigningRole] = useState<"tenant" | "landlord" | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [signingBusy, setSigningBusy] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [exportFields, setExportFields] = useState<ExportField[]>(DEFAULT_FIELDS);
  const [scoreFormat, setScoreFormat] = useState<ScoreFormat>("number");
  const tenantSigned = !!tenantSignature;
  const landlordSigned = !!landlordSignature;
  const bothSigned = tenantSigned && landlordSigned;

  const startDate = listing.availableFrom;
  const endDate = useMemo(
    () =>
      new Date(new Date(startDate).setMonth(new Date(startDate).getMonth() + duration))
        .toISOString()
        .slice(0, 10),
    [duration, startDate],
  );
  const reference = `${listing.id}/${duration}M`;

  // Lets generate() detect, when its fetches resolve, whether the user has
  // since changed the duration (which changes `reference` and terms) — a
  // slower in-flight response for the old duration must not overwrite
  // whatever the user is now looking at.
  const latestReferenceRef = useRef(reference);
  useEffect(() => {
    latestReferenceRef.current = reference;
  }, [reference]);

  useEffect(() => {
    if (bothSigned && reference) {
      fetch("/api/agreement/deliver", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference }),
      }).catch(() => {});
    }
  }, [bothSigned, reference]);

  const terms = {
    reference,
    landlordName: owner.name,
    landlordVerifiedSince: owner.verifiedSince,
    tenantName: tenant.name,
    tenantNid: tenant.nid,
    tenantPhone: tenant.phone,
    propertyTitle: listing.title,
    roomType: listing.roomType,
    area: listing.area,
    city: listing.city,
    coords: listing.coords,
    rent: listing.rent,
    deposit: listing.deposit,
    durationMonths: duration,
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    houseRules: listing.houseRules,
  };

  async function generate() {
    const requestedReference = reference;
    setBusy(true);
    setNotice(null);
    // Regenerating (same or different duration) must invalidate any existing
    // signatures — they were made against clause text that's about to change,
    // and re-signing them silently against new wording would be signing
    // something nobody actually re-reviewed.
    setTenantSignature(null);
    setLandlordSignature(null);
    setSigningRole(null);
    setSignError(null);
    setDraftId(null);
    try {
      const response = await fetch("/api/agreement/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(terms),
      });
      const result = (await response.json()) as {
        clauses: AgreementClause[];
        source: "ai" | "fallback";
        error?: string;
      };
      if (latestReferenceRef.current !== requestedReference) return; // stale — duration changed mid-flight
      setClauses(result.clauses);
      setSource(result.source);
      if (result.error && result.source === "fallback")
        setNotice(`${result.error} Showing the standard clause set instead.`);

      // save draft to DB for sharing
      const saveRes = await fetch("/api/agreement/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reference,
          termsJson: terms,
          clausesJson: result.clauses,
          source: result.source,
        }),
      });
      if (latestReferenceRef.current !== requestedReference) return;
      if (saveRes.ok) {
        const saved = await saveRes.json();
        setDraftId(saved.id);
      }
    } catch (error) {
      if (latestReferenceRef.current !== requestedReference) return;
      // quota/access errors — silently fall back, clauses already set by API route
      const msg = error instanceof Error ? error.message : "";
      if (!msg.includes("429") && !msg.includes("403"))
        setNotice(msg || "Could not draft the agreement.");
    } finally {
      if (latestReferenceRef.current === requestedReference) setBusy(false);
    }
  }

  function buildRow(): Record<string, string> {
    const row: Record<string, string> = {};
    const enabled = new Set(exportFields.filter((f) => f.enabled).map((f) => f.key));
    if (enabled.has("reference")) row["Reference"] = reference;
    if (enabled.has("landlord"))
      row["Landlord"] = `${owner.name} · verified ${owner.verifiedSince}`;
    if (enabled.has("tenant"))
      row["Tenant"] = `${tenant.name} · NID ${tenant.nid} · ${tenant.phone}`;
    if (enabled.has("property"))
      row["Property"] = `${listing.title}, ${listing.area}, ${listing.city}`;
    if (enabled.has("rent")) row["Monthly Rent"] = bdt(listing.rent);
    if (enabled.has("deposit")) row["Deposit"] = bdt(listing.deposit);
    if (enabled.has("term"))
      row["Term"] = `${duration} months · ${formatDate(startDate)} to ${formatDate(endDate)}`;
    if (enabled.has("houseRules")) row["House Rules"] = listing.houseRules.join("; ");
    if (enabled.has("clauses") && clauses)
      row["Clauses"] = clauses.map((c, i) => `${i + 1}. ${c.title}: ${c.body}`).join(" | ");
    if (enabled.has("source") && source) row["Draft Source"] = source;
    return row;
  }

  function handleDownloadCsv() {
    downloadCsv(`rentFindr-agreement-${reference.replace(/\//g, "-")}.csv`, [buildRow()]);
  }

  function handleDownloadPdf() {
    if (!clauses) return;
    downloadAgreementPdf({
      reference,
      generatedOn: formatDate(new Date().toISOString()),
      landlordName: owner.name,
      tenantName: tenant.name,
      propertyLine: `${listing.title} — ${listing.roomType}, ${listing.area}, ${listing.city}`,
      rentLine: `Rent: ${bdt(listing.rent)} per month · Deposit: ${bdt(listing.deposit)}`,
      termLine: `Term: ${duration} months, ${formatDate(startDate)} to ${formatDate(endDate)}`,
      clauses: exportFields.find((f) => f.key === "clauses")?.enabled ? clauses : [],
      tenantSignature,
      landlordSignature,
    });
  }

  async function submitSignature(role: "tenant" | "landlord", dataUrl: string) {
    if (!draftId) {
      setSignError("Save the draft before signing — try generating it again.");
      return;
    }
    setSigningBusy(true);
    setSignError(null);
    try {
      const res = await fetch("/api/agreement/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId, role, signature: dataUrl }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save signature.");
      if (role === "tenant") setTenantSignature(dataUrl);
      else setLandlordSignature(dataUrl);
      setSigningRole(null);
    } catch (e) {
      setSignError(e instanceof Error ? e.message : "Could not save signature.");
    } finally {
      setSigningBusy(false);
    }
  }

  if (applicationId && loadingReal) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-24 text-center">
        <p className="font-mono text-sm text-muted-foreground">Loading application…</p>
      </div>
    );
  }

  if (applicationId && loadError) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-24 text-center">
        <p className="eyebrow">Agreement</p>
        <h1 className="mt-4 text-3xl">Can&apos;t open this agreement</h1>
        <p className="mt-4 text-sm text-muted-foreground">{loadError}</p>
        <Link
          href="/profile"
          className="mt-8 inline-block bg-foreground px-6 py-3 text-sm text-paper hover:opacity-90"
        >
          Back to profile
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <header className="border-b border-border pb-8">
        <p className="eyebrow">Application accepted · {listing.id}</p>
        <h1 className="mt-4 max-w-2xl text-4xl leading-tight sm:text-5xl">
          The agreement becomes the <em className="italic">legal anchor.</em>
        </h1>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-8">
          <Block title="Parties">
            <Row label="Landlord" value={`${owner.name} · verified ${owner.verifiedSince}`} />
            <Row label="Tenant" value={`${tenant.name} · NID ${tenant.nid}`} />
            <Row label="Contact" value={tenant.phone} />
          </Block>
          <Block title="Terms">
            <Row label="Property" value={`${listing.area}, ${listing.city}`} />
            <Row label="Monthly rent" value={bdt(listing.rent)} />
            <Row label="Security deposit" value={bdt(listing.deposit)} />
            <Row label="Start" value={formatDate(startDate)} />
            <Row label="End" value={formatDate(endDate)} />
            <div className="pt-4">
              <span className="eyebrow">Duration · {duration} months</span>
              <input
                type="range"
                min={6}
                max={24}
                step={6}
                value={duration}
                onChange={(e) => {
                  setDuration(Number(e.target.value));
                  setClauses(null);
                  setSource(null);
                  setNotice(null);
                  setTenantSignature(null);
                  setLandlordSignature(null);
                  setSigningRole(null);
                  setSignError(null);
                  setDraftId(null);
                }}
                className="mt-3 w-full accent-[var(--primary)]"
              />
            </div>
          </Block>

          {status === "authenticated" ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={generate}
                disabled={busy}
                className="w-full bg-foreground px-4 py-3 text-sm text-paper hover:opacity-90 disabled:opacity-50"
              >
                {busy
                  ? "Drafting with Gemini…"
                  : clauses
                    ? "Regenerate draft"
                    : "Generate agreement draft"}
              </button>
              <ExportSettings
                fields={exportFields}
                scoreFormat={scoreFormat}
                onFieldsChange={setExportFields}
                onScoreFormatChange={setScoreFormat}
                onDownloadCsv={handleDownloadCsv}
                onDownloadPdf={handleDownloadPdf}
                disabled={!clauses}
              />
              <SharePanel type="agreement" resourceId={draftId} disabled={!draftId} />
            </div>
          ) : (
            <div className="border border-dashed border-border p-5 text-sm text-muted-foreground">
              <Link href="/auth" className="underline underline-offset-4">
                Sign in as a tenant or landlord
              </Link>{" "}
              to draft, export, and share the agreement.
            </div>
          )}
          {notice && (
            <p className="border-l-2 border-accent pl-3 text-xs text-muted-foreground">{notice}</p>
          )}
        </aside>

        <section>
          {!clauses ? (
            <div className="flex h-full min-h-80 items-center justify-center border border-dashed border-border p-10 text-center">
              <p className="max-w-xs text-sm text-muted-foreground">
                No draft yet. Generate one from the accepted application&apos;s terms — the clauses
                are written by Gemini from the listing data, then laid out and exported as a PDF.
              </p>
            </div>
          ) : (
            <article className="border border-border bg-card p-8 sm:p-12">
              <p className="eyebrow">
                {bothSigned ? "Acknowledged" : "Draft · not yet acknowledged"} ·{" "}
                {source === "ai" ? "clauses drafted by Gemini" : "standard clause set"}
              </p>
              <h2 className="mt-4 text-3xl">Residential Rental Agreement</h2>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                Ref {reference} · generated {formatDate(new Date().toISOString())}
              </p>

              <div className="mt-8 space-y-6 text-[15px] leading-relaxed">
                {clauses.map((clause, i) => (
                  <Clause key={clause.title + i} n={i + 1} title={clause.title}>
                    {clause.body}
                  </Clause>
                ))}
              </div>

              <div className="mt-10 grid gap-6 border-t border-border pt-8 sm:grid-cols-2">
                <SignatureBox
                  role="tenant"
                  label="Tenant"
                  name={tenant.name}
                  signature={tenantSignature}
                  active={signingRole === "tenant"}
                  busy={signingBusy}
                  error={signingRole === "tenant" ? signError : null}
                  onStart={() => {
                    setSigningRole("tenant");
                    setSignError(null);
                  }}
                  onCancel={() => setSigningRole(null)}
                  onSave={(dataUrl) => submitSignature("tenant", dataUrl)}
                />
                <SignatureBox
                  role="landlord"
                  label="Landlord"
                  name={owner.name}
                  signature={landlordSignature}
                  active={signingRole === "landlord"}
                  busy={signingBusy}
                  error={signingRole === "landlord" ? signError : null}
                  onStart={() => {
                    setSigningRole("landlord");
                    setSignError(null);
                  }}
                  onCancel={() => setSigningRole(null)}
                  onSave={(dataUrl) => submitSignature("landlord", dataUrl)}
                />
              </div>

              <p
                className={`mt-8 border-l-2 pl-4 text-sm ${bothSigned ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
              >
                {bothSigned
                  ? "Acknowledged by both parties. Download the signed PDF — it is attached to the tenancy record and to any future maintenance request or dispute."
                  : "Awaiting acknowledgement from both parties before the PDF is issued."}
              </p>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border p-6">
      <p className="eyebrow">{title}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-xs tabular-nums">{value}</span>
    </div>
  );
}

function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {String(n).padStart(2, "0")} · {title}
      </h3>
      <p className="mt-2">{children}</p>
    </section>
  );
}

function SignatureBox({
  label,
  name,
  signature,
  active,
  busy,
  error,
  onStart,
  onCancel,
  onSave,
}: {
  role: "tenant" | "landlord";
  label: string;
  name: string;
  signature: string | null;
  active: boolean;
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onCancel: () => void;
  onSave: (dataUrl: string) => void;
}) {
  return (
    <div className="border border-border p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-4 text-lg">{name}</p>

      {signature ? (
        <div className="mt-4">
          <img
            src={signature}
            alt={`${label} signature`}
            className="h-16 w-full rounded-sm border border-border bg-white object-contain"
          />
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-primary">
            ✓ Signed
          </p>
        </div>
      ) : active ? (
        <SignaturePad onSave={onSave} onCancel={onCancel} saving={busy} />
      ) : (
        <button
          type="button"
          onClick={onStart}
          className="mt-6 w-full border border-foreground px-3 py-2 text-xs hover:bg-foreground hover:text-paper"
        >
          Sign digitally
        </button>
      )}
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </div>
  );
}
