import { TRUST_WEIGHTS, trustScore, type Landlord, type TrustBreakdown } from "@/data/module1";
import type { VerificationProgress } from "@/lib/verification-progress";

function toneFor(score: number) {
  if (score >= 85) return "text-trust-high";
  if (score >= 70) return "text-trust-mid";
  return "text-trust-low";
}

export function TrustScoreBadge({
  breakdown,
  size = "md",
}: {
  breakdown: TrustBreakdown;
  size?: "sm" | "md" | "lg";
}) {
  const score = trustScore(breakdown);
  const dims = size === "lg" ? "text-5xl" : size === "sm" ? "text-xl" : "text-3xl";
  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-mono tabular-nums leading-none ${dims} ${toneFor(score)}`}>
        {score}
      </span>
      <span className="eyebrow">Trust</span>
    </div>
  );
}

export function TrustBar({ value }: { value: number }) {
  return (
    <div className="h-[3px] w-full bg-border">
      <div
        className="h-full bg-foreground"
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function TrustBreakdownTable({ breakdown }: { breakdown: TrustBreakdown }) {
  return (
    <dl className="divide-y divide-border border-y border-border">
      {TRUST_WEIGHTS.map((w) => (
        <div key={w.key} className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 py-3">
          <dt className="text-sm">
            {w.label}
            <span className="ml-2 font-mono text-[11px] text-muted-foreground">
              {Math.round(w.weight * 100)}%
            </span>
            <p className="mt-0.5 text-xs text-muted-foreground">{w.measures}</p>
          </dt>
          <dd className="font-mono text-sm tabular-nums">{breakdown[w.key]}</dd>
          <div className="col-span-2">
            <TrustBar value={breakdown[w.key]} />
          </div>
        </div>
      ))}
    </dl>
  );
}

export function VerifiedBadge({ since }: { since?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-primary/40 bg-primary/5 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-primary">
      <span aria-hidden>✓</span> Verified{since ? ` · ${since}` : ""}
    </span>
  );
}

/**
 * Renders the step-by-step verification progress (docs submitted → admin
 * review) rather than only the binary pending/verified/rejected badge —
 * surfaced on every profile per the Landlord Verification proposal item.
 */
export function VerificationProgressBar({ progress }: { progress: VerificationProgress }) {
  const tone =
    progress.status === "verified"
      ? "text-trust-high"
      : progress.status === "rejected"
        ? "text-destructive"
        : "text-trust-mid";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Verification progress</span>
        <span className={`font-mono text-xs tabular-nums ${tone}`}>{progress.percent}%</span>
      </div>
      <TrustBar value={progress.percent} />
      <ul className="mt-3 space-y-1.5">
        {progress.steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span aria-hidden className={s.done ? "text-primary" : ""}>
              {s.done ? "✓" : "○"}
            </span>
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

/** Inline pass/pending status pill used for individual verification checks. */
export function VerificationStatus({
  label,
  state,
  note,
}: {
  label: string;
  state: "verified" | "pending" | "watch";
  note?: string;
}) {
  const tone =
    state === "verified"
      ? "border-primary/40 text-primary"
      : state === "watch"
        ? "border-accent/50 text-accent"
        : "border-destructive/40 text-destructive";
  const glyph = state === "verified" ? "✓" : state === "watch" ? "!" : "○";
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[11px] ${tone}`}
      title={note}
    >
      <span aria-hidden>{glyph}</span>
      {label}
    </span>
  );
}

function credibilityBand(score: number) {
  if (score >= 85) return { label: "Strong record", tone: "text-trust-high" };
  if (score >= 70) return { label: "Mixed record", tone: "text-trust-mid" };
  return { label: "Thin record", tone: "text-trust-low" };
}

/**
 * Credibility strip: the four listing-level trust signals with inline
 * verification statuses, so a tenant can judge a landlord at a glance.
 */
export function CredibilityStrip({
  owner,
  compact = false,
}: {
  owner: Landlord;
  compact?: boolean;
}) {
  const score = trustScore(owner.trust);
  const band = credibilityBand(score);
  const fast = owner.avgResponseHours <= 12;
  const experienced = owner.completedRentals >= 5;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        <VerificationStatus
          label={
            owner.verified ? `Identity & ownership · ${owner.verifiedSince}` : "Identity unverified"
          }
          state={owner.verified ? "verified" : "pending"}
          note="NID, property ownership proof and phone number checked by rentFindr"
        />
        <VerificationStatus
          label={`Replies in ~${owner.avgResponseHours}h`}
          state={fast ? "verified" : "watch"}
          note={`${owner.responseRate}% of applicant messages answered`}
        />
        <VerificationStatus
          label={`${owner.completedRentals} tenancies completed`}
          state={experienced ? "verified" : "watch"}
          note="Leases that ran to term on their original agreement"
        />
        <VerificationStatus
          label={`${owner.trust.disputes >= 80 ? "Clean" : "Contested"} dispute record`}
          state={owner.trust.disputes >= 80 ? "verified" : "watch"}
          note="Share of disputes resolved in favour or with no fault found"
        />
      </div>
      {!compact && (
        <p className={`mt-3 font-mono text-[11px] uppercase tracking-widest ${band.tone}`}>
          {band.label} · Trust {score}/100
        </p>
      )}
    </div>
  );
}
