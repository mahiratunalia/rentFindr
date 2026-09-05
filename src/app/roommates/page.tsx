"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

import { TrustBar } from "@/components/trust";
import { SharePanel } from "@/components/share-panel";
import {
  ExportSettings,
  downloadCsv,
  downloadSimplePdf,
  formatScore,
  type ExportField,
  type ScoreFormat,
} from "@/components/export-settings";
import { bdt, compatibility, type RoommateProfile } from "@/data/module1";

type Candidate = {
  id: string;
  name: string;
  detail: string;
  email: string;
} & RoommateProfile;

type CandidateApiResponse = {
  profileId: string;
  displayName: string;
  email: string;
  memberSince: string;
} & RoommateProfile;

const DEFAULT_FIELDS: ExportField[] = [
  { key: "name", label: "Candidate name", enabled: true },
  { key: "detail", label: "Detail", enabled: true },
  { key: "score", label: "Compatibility score", enabled: true },
  { key: "budget", label: "Budget", enabled: true },
  { key: "sleep", label: "Sleep schedule", enabled: true },
  { key: "smoking", label: "Smoking", enabled: true },
  { key: "cooking", label: "Cooking habits", enabled: true },
  { key: "study", label: "Study habits", enabled: true },
  { key: "visitors", label: "Visitor tolerance", enabled: true },
  { key: "breakdown", label: "Score breakdown", enabled: false },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function memberSince(iso: string) {
  const d = new Date(iso);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `Member since ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export default function RoommatesPage() {
  const { status } = useSession();
  const [profile, setProfile] = useState<RoommateProfile>({
    budget: 6500,
    sleep: "Late",
    smoking: "No",
    smokingNonNegotiable: true,
    cooking: "Occasionally",
    study: "Quiet",
    visitors: "Rare",
  });
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [exportFields, setExportFields] = useState<ExportField[]>(DEFAULT_FIELDS);
  const [scoreFormat, setScoreFormat] = useState<ScoreFormat>("number");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [hasSavedPreference, setHasSavedPreference] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadCandidates() {
    setCandidatesLoading(true);
    try {
      const res = await fetch("/api/roommates/candidates");
      if (res.ok) {
        const data = await res.json();
        setCandidates(
          (data as CandidateApiResponse[]).map((c) => ({
            id: c.profileId,
            name: c.displayName,
            detail: memberSince(c.memberSince),
            email: c.email,
            budget: c.budget,
            sleep: c.sleep,
            smoking: c.smoking,
            smokingNonNegotiable: c.smokingNonNegotiable,
            cooking: c.cooking,
            study: c.study,
            visitors: c.visitors,
          })),
        );
      }
    } finally {
      setCandidatesLoading(false);
    }
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/roommates/preference")
      .then((r) => (r.ok ? r.json() : null))
      .then((saved) => {
        if (saved) {
          setProfile({
            budget: saved.budget,
            sleep: saved.sleep,
            smoking: saved.smoking,
            smokingNonNegotiable: saved.smokingNonNegotiable,
            cooking: saved.cooking,
            study: saved.study,
            visitors: saved.visitors,
          });
          setHasSavedPreference(true);
        }
      })
      .catch(() => {});
    // React's own documented data-fetching pattern (set loading, then fetch, then
    // clear it) — flagged by the newer stricter set-state-in-effect rule, but not
    // a bug: only runs once `status` resolves to authenticated.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const matches = useMemo(
    () =>
      candidates
        .map((c) => ({ candidate: c, result: compatibility(profile, c) }))
        .sort((a, b) => b.result.total - a.result.total),
    [profile, candidates],
  );

  const set = <K extends keyof RoommateProfile>(key: K, value: RoommateProfile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));

  async function savePreference() {
    setSavingPreference(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/roommates/preference", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (res.status === 401) {
        setStatusMsg("sign-in");
        return;
      }
      if (!res.ok) throw new Error("Could not save your preferences.");
      setHasSavedPreference(true);
      setStatusMsg(
        "Saved to your profile — you're now visible to other tenants' matches, and to landlords when you apply alongside another applicant.",
      );
      await loadCandidates();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Could not save your preferences.");
    } finally {
      setSavingPreference(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <header className="border-b border-border pb-8">
        <p className="eyebrow">Shared mess accommodation</p>
        <h1 className="mt-4 max-w-2xl font-display text-4xl font-bold uppercase leading-[1.05] tracking-tight sm:text-5xl">
          Compatibility is arithmetic, not a guess.
        </h1>
      </header>

      <div className="mt-10 grid gap-14 lg:grid-cols-[340px_1fr]">
        <form className="space-y-8">
          <div>
            <span className="eyebrow">Monthly budget · {bdt(profile.budget)}</span>
            <input
              type="range"
              min={4000}
              max={12000}
              step={250}
              value={profile.budget}
              onChange={(e) => set("budget", Number(e.target.value))}
              className="mt-3 w-full accent-[var(--primary)]"
            />
          </div>

          <Choice
            label="Sleep schedule"
            options={["Early", "Flexible", "Late"] as const}
            value={profile.sleep}
            onChange={(v) => set("sleep", v)}
          />
          <Choice
            label="Smoking"
            options={["No", "Tolerant", "Yes"] as const}
            value={profile.smoking}
            onChange={(v) => set("smoking", v)}
          />
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={profile.smokingNonNegotiable}
              onChange={(e) => set("smokingNonNegotiable", e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            Smoking preference is non-negotiable
          </label>
          <Choice
            label="Cooking habits"
            options={["Rarely", "Occasionally", "Daily"] as const}
            value={profile.cooking}
            onChange={(v) => set("cooking", v)}
          />
          <Choice
            label="Study habits"
            options={["Quiet", "Mixed", "Social"] as const}
            value={profile.study}
            onChange={(v) => set("study", v)}
          />
          <Choice
            label="Visitor tolerance"
            options={["Rare", "Occasional", "Frequent"] as const}
            value={profile.visitors}
            onChange={(v) => set("visitors", v)}
          />

          <div className="space-y-4 border-t border-border pt-6">
            <button
              type="button"
              disabled={savingPreference}
              onClick={savePreference}
              className="w-full rounded-full bg-accent px-4 py-3 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {savingPreference
                ? "Saving…"
                : hasSavedPreference
                  ? "Update my saved preferences"
                  : "Save preferences & find matches"}
            </button>
            <p className="text-xs text-muted-foreground">
              Saving makes you visible to other tenants&apos; matches here, and to landlords
              comparing co-applicants on a shared listing.
            </p>
            {statusMsg &&
              (statusMsg === "sign-in" ? (
                <p className="border-l-2 border-accent pl-3 text-xs text-muted-foreground">
                  <Link href="/auth" className="underline underline-offset-4">
                    Sign in
                  </Link>{" "}
                  to save your preferences.
                </p>
              ) : (
                <p className="border-l-2 border-accent pl-3 text-xs text-muted-foreground">
                  {statusMsg}
                </p>
              ))}

            <label className="block pt-4">
              <span className="eyebrow">Session name</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Mohammadpur mess, September"
                className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const res = await fetch("/api/roommates/session", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      label: label || "Untitled session",
                      profileData: profile,
                      results: matches.map(({ candidate, result }) => ({
                        candidateId: candidate.id,
                        score: result.total,
                        breakdown: result.parts,
                      })),
                    }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setSavedSessionId(data.id ?? null);
                    setStatusMsg(`Session "${label || "Untitled"}" saved to your profile.`);
                  } else setStatusMsg("Sign in to save sessions to your profile.");
                } catch {
                  setStatusMsg("Could not save session.");
                } finally {
                  setSaving(false);
                }
              }}
              className="w-full rounded-full border border-border px-4 py-3 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save this matching session"}
            </button>
            <ExportSettings
              fields={exportFields}
              scoreFormat={scoreFormat}
              onFieldsChange={setExportFields}
              onScoreFormatChange={setScoreFormat}
              onDownloadCsv={(fields, fmt) => {
                const enabled = new Set(fields.filter((f) => f.enabled).map((f) => f.key));
                const rows = matches.map(({ candidate, result }) => {
                  const row: Record<string, string> = {};
                  if (enabled.has("name")) row["Name"] = candidate.name;
                  if (enabled.has("detail")) row["Detail"] = candidate.detail;
                  if (enabled.has("score")) row["Score"] = formatScore(result.total, fmt);
                  if (enabled.has("budget")) row["Budget"] = bdt(candidate.budget);
                  if (enabled.has("sleep")) row["Sleep"] = candidate.sleep;
                  if (enabled.has("smoking")) row["Smoking"] = candidate.smoking;
                  if (enabled.has("cooking")) row["Cooking"] = candidate.cooking;
                  if (enabled.has("study")) row["Study"] = candidate.study;
                  if (enabled.has("visitors")) row["Visitors"] = candidate.visitors;
                  if (enabled.has("breakdown"))
                    row["Breakdown"] = result.parts
                      .map(
                        (p) =>
                          `${p.label}: ${formatScore(Math.round(p.value * p.weight), fmt)}/${p.weight}`,
                      )
                      .join("; ");
                  return row;
                });
                downloadCsv(`rentFindr-roommates-${label || "session"}.csv`, rows);
              }}
              onDownloadPdf={(fields, fmt) => {
                const enabled = new Set(fields.filter((f) => f.enabled).map((f) => f.key));
                const rows = matches.map(({ candidate, result }) => {
                  const row: Record<string, string> = {};
                  if (enabled.has("name")) row["Name"] = candidate.name;
                  if (enabled.has("detail")) row["Detail"] = candidate.detail;
                  if (enabled.has("score")) row["Score"] = formatScore(result.total, fmt);
                  if (enabled.has("budget")) row["Budget"] = bdt(candidate.budget);
                  if (enabled.has("sleep")) row["Sleep"] = candidate.sleep;
                  if (enabled.has("smoking")) row["Smoking"] = candidate.smoking;
                  if (enabled.has("cooking")) row["Cooking"] = candidate.cooking;
                  if (enabled.has("study")) row["Study"] = candidate.study;
                  if (enabled.has("visitors")) row["Visitors"] = candidate.visitors;
                  if (enabled.has("breakdown"))
                    row["Breakdown"] = result.parts
                      .map(
                        (p) =>
                          `${p.label}: ${formatScore(Math.round(p.value * p.weight), fmt)}/${p.weight}`,
                      )
                      .join("; ");
                  return row;
                });
                downloadSimplePdf(
                  `rentFindr-roommates-${label || "session"}.pdf`,
                  label || "Roommate Matching Session",
                  rows,
                );
              }}
            />
            <SharePanel
              type="roommate_session"
              resourceId={savedSessionId}
              disabled={!savedSessionId}
            />
            <p className="text-xs text-muted-foreground">
              <Link href="/profile" className="underline underline-offset-4">
                Open profile
              </Link>{" "}
              to revisit saved sessions.
            </p>
          </div>
        </form>

        <section>
          <h2 className="text-2xl">Your roommate matches</h2>

          {status !== "authenticated" ? (
            <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <Link href="/auth" className="underline underline-offset-4">
                Sign in
              </Link>{" "}
              to see compatibility against real tenants who&apos;ve saved their preferences.
            </p>
          ) : candidatesLoading ? (
            <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Loading matches…
            </p>
          ) : candidates.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No other tenants have saved their preferences yet — be the first. Once others save
              theirs, real matches show up here.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {matches.map(({ candidate, result }) => (
                <li
                  key={candidate.id}
                  className="rounded-2xl border border-border bg-[var(--card)] p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs">
                        {initials(candidate.name)}
                      </span>
                      <div>
                        <h3 className="text-xl">{candidate.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{candidate.detail}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-3xl tabular-nums">{result.total}%</span>
                      <p className="eyebrow">compatible</p>
                    </div>
                  </div>

                  {result.hardBlocked && (
                    <p className="mt-4 border-l-2 border-destructive pl-3 text-xs text-destructive">
                      Blocked by a non-negotiable smoking preference — scored 0 regardless of the
                      other signals.
                    </p>
                  )}

                  <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
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

                  {expandedId === candidate.id && (
                    <p className="mt-5 font-mono text-[11px] text-muted-foreground">
                      {bdt(candidate.budget)} budget · sleeps {candidate.sleep.toLowerCase()} ·
                      cooks {candidate.cooking.toLowerCase()} · {candidate.study.toLowerCase()}{" "}
                      study · {candidate.visitors.toLowerCase()} visitors
                    </p>
                  )}

                  <div className="mt-5 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(expandedId === candidate.id ? null : candidate.id)
                      }
                      className="flex-1 rounded-full border border-border px-3 py-2 text-xs hover:bg-secondary"
                    >
                      {expandedId === candidate.id ? "Hide profile" : "Profile"}
                    </button>
                    <a
                      href={`mailto:${candidate.email}?subject=${encodeURIComponent("Roommate match on rentFindr")}&body=${encodeURIComponent(`Hi ${candidate.name}, we matched at ${result.total}% compatible on rentFindr. Want to both apply to the same shared listing?`)}`}
                      className="flex-1 rounded-full border border-border px-3 py-2 text-center text-xs hover:bg-secondary"
                    >
                      Message
                    </a>
                    <Link
                      href="/?roomType=Shared+mess#listings"
                      className="flex-1 rounded-full bg-accent px-3 py-2 text-center text-xs text-accent-foreground hover:opacity-90"
                    >
                      Find a shared listing
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

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-3 flex">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`flex-1 border px-3 py-2 text-xs transition-colors first:rounded-l-full last:rounded-r-full ${value === option ? "border-accent bg-accent text-accent-foreground" : "border-border hover:bg-secondary"}`}
          >
            {option}
          </button>
        ))}
      </div>
    </label>
  );
}
