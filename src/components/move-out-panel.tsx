"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const MAX_PHOTO_BYTES = 1_500_000;

type Deduction = { description: string; amount: number; photoUrl?: string };

type MoveOutState = {
  id: string;
  status: "proposed" | "acknowledged" | "settled" | "disputed";
  proposedEndDate: string;
  tenantAcknowledgedAt: string | null;
  totalRentPaid: number;
  depositAmount: number;
  deductionsJson: Deduction[];
  netRefund: number;
  landlordConfirmedAt: string | null;
  tenantConfirmedAt: string | null;
  refundReference: string | null;
  disputeId: string | null;
  improvementAdjustment: { tenantCredit: number; landlordDebit: number; net: number };
  isTenant: boolean;
  isLandlord: boolean;
} | null;

function bdt(n: number) {
  return `৳${n.toLocaleString("en-BD")}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

export function MoveOutPanel({
  applicationId,
  viewerIsLandlord,
}: {
  applicationId: string;
  viewerIsLandlord: boolean;
}) {
  const [moveOut, setMoveOut] = useState<MoveOutState | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Landlord: propose form
  const [proposing, setProposing] = useState(false);
  const [endDate, setEndDate] = useState("");

  // Landlord: deductions form
  const [editingDeductions, setEditingDeductions] = useState(false);
  const [deductions, setDeductions] = useState<Deduction[]>([]);

  // Tenant: dispute form
  const [disputing, setDisputing] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  async function load() {
    const res = await fetch(`/api/move-out/${applicationId}`);
    setMoveOut(res.ok ? await res.json() : null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  useEffect(() => {
    // Syncs the editable draft from the freshly-loaded record (e.g. after a
    // landlord confirms elsewhere and this re-fetches) — a deliberate mirror,
    // not a derived value computable at render time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (moveOut) setDeductions(moveOut.deductionsJson ?? []);
  }, [moveOut]);

  async function act(action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/move-out/${applicationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not complete that action.");
      await load();
      setEditingDeductions(false);
      setDisputing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete that action.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPropose(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/move-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId, proposedEndDate: endDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not initiate move-out.");
      setProposing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not initiate move-out.");
    } finally {
      setBusy(false);
    }
  }

  if (moveOut === undefined) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Loading move-out status…
      </p>
    );
  }

  // ── No move-out yet ────────────────────────────────────────────────────
  if (!moveOut) {
    if (!viewerIsLandlord) return null;
    return (
      <div className="mt-4 border-t border-border pt-4">
        {proposing ? (
          <form onSubmit={submitPropose} className="space-y-3">
            <label className="block text-xs">
              <span className="eyebrow">Proposed end date</span>
              <input
                required
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
              />
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-accent px-4 py-2 text-xs text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Propose move-out"}
              </button>
              <button
                type="button"
                onClick={() => setProposing(false)}
                className="text-xs text-muted-foreground underline underline-offset-4"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setProposing(true)}
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            Initiate move-out →
          </button>
        )}
      </div>
    );
  }

  const endDateLabel = new Date(moveOut.proposedEndDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Move-out</span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {moveOut.status}
        </span>
      </div>
      <p className="text-sm">
        Proposed end date: <strong>{endDateLabel}</strong>
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* proposed: tenant needs to acknowledge */}
      {moveOut.status === "proposed" && (
        <>
          {moveOut.isTenant ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => act("acknowledge")}
              className="rounded-full bg-accent px-4 py-2 text-xs text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "…" : "Acknowledge move-out date"}
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">Awaiting tenant acknowledgment.</p>
          )}
        </>
      )}

      {/* acknowledged: settlement breakdown, deductions, confirm/dispute */}
      {(moveOut.status === "acknowledged" || moveOut.status === "settled") && (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs">
            <dt className="text-muted-foreground">Total rent paid</dt>
            <dd className="text-right">{bdt(moveOut.totalRentPaid)}</dd>
            <dt className="text-muted-foreground">Security deposit</dt>
            <dd className="text-right">{bdt(moveOut.depositAmount)}</dd>
            <dt className="text-muted-foreground">Deductions</dt>
            <dd className="text-right">
              {bdt(moveOut.deductionsJson.reduce((s, d) => s + d.amount, 0))}
            </dd>
            {moveOut.improvementAdjustment.net !== 0 && (
              <>
                <dt className="text-muted-foreground">Approved improvement costs</dt>
                <dd
                  className={`text-right ${moveOut.improvementAdjustment.net > 0 ? "text-primary" : "text-destructive"}`}
                >
                  {moveOut.improvementAdjustment.net > 0 ? "+" : "-"}
                  {bdt(Math.abs(moveOut.improvementAdjustment.net))}
                </dd>
              </>
            )}
            <dt className="font-medium text-foreground">Net refund</dt>
            <dd className="text-right font-medium text-foreground">{bdt(moveOut.netRefund)}</dd>
          </dl>

          {moveOut.deductionsJson.length > 0 && (
            <ul className="space-y-2">
              {moveOut.deductionsJson.map((d, i) => (
                <li key={i} className="flex items-start justify-between gap-3 text-xs">
                  <span>{d.description}</span>
                  <span className="whitespace-nowrap font-mono">{bdt(d.amount)}</span>
                  {d.photoUrl && (
                    <img
                      src={d.photoUrl}
                      alt={d.description}
                      className="h-10 w-14 rounded border border-border object-cover"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          {moveOut.status === "acknowledged" && moveOut.isLandlord && (
            <div>
              {editingDeductions ? (
                <div className="space-y-2">
                  {deductions.map((d, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        value={d.description}
                        onChange={(e) =>
                          setDeductions((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, description: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="Description"
                        className="flex-1 border-b border-input bg-transparent py-1 text-xs outline-none focus:border-foreground"
                      />
                      <input
                        type="number"
                        min={0}
                        value={d.amount}
                        onChange={(e) =>
                          setDeductions((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, amount: Number(e.target.value) } : x,
                            ),
                          )
                        }
                        className="w-24 border-b border-input bg-transparent py-1 text-xs outline-none focus:border-foreground"
                      />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          if (file.size > MAX_PHOTO_BYTES) {
                            setError(
                              `Photo must be under ${Math.round(MAX_PHOTO_BYTES / 1_000_000)}MB.`,
                            );
                            return;
                          }
                          const encoded = await fileToBase64(file);
                          setDeductions((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, photoUrl: encoded } : x)),
                          );
                        }}
                        className="text-[10px]"
                      />
                      <button
                        type="button"
                        onClick={() => setDeductions((prev) => prev.filter((_, j) => j !== i))}
                        className="text-xs text-destructive"
                        aria-label="Remove deduction"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setDeductions((prev) => [...prev, { description: "", amount: 0 }])
                    }
                    className="text-xs underline underline-offset-4"
                  >
                    + Add deduction
                  </button>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act("set_deductions", { deductions })}
                      className="rounded-full bg-accent px-4 py-2 text-xs text-accent-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? "Saving…" : "Save deductions"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingDeductions(false)}
                      className="text-xs text-muted-foreground underline underline-offset-4"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDeductions(true)}
                  className="text-xs underline underline-offset-4"
                >
                  {moveOut.deductionsJson.length > 0 ? "Edit deductions" : "Itemize deductions →"}
                </button>
              )}
            </div>
          )}

          {moveOut.status === "acknowledged" && (
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {moveOut.landlordConfirmedAt
                  ? "✓ Landlord confirmed"
                  : "Landlord: not yet confirmed"}
                {" · "}
                {moveOut.tenantConfirmedAt ? "✓ Tenant confirmed" : "Tenant: not yet confirmed"}
              </p>
              {((viewerIsLandlord && !moveOut.landlordConfirmedAt) ||
                (!viewerIsLandlord && !moveOut.tenantConfirmedAt)) && (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act("confirm")}
                    className="rounded-full bg-primary px-4 py-2 text-xs text-paper hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "…" : "Confirm settlement"}
                  </button>
                  {moveOut.isTenant && !disputing && (
                    <button
                      type="button"
                      onClick={() => setDisputing(true)}
                      className="text-xs text-destructive underline underline-offset-4"
                    >
                      Dispute this settlement →
                    </button>
                  )}
                </div>
              )}
              {disputing && (
                <div className="space-y-2 border-l-2 border-destructive/50 pl-3">
                  <textarea
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    rows={2}
                    placeholder="What's wrong with this settlement?"
                    className="w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
                  />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={busy || !disputeReason.trim()}
                      onClick={() => act("dispute", { description: disputeReason })}
                      className="rounded-full border border-destructive/50 px-4 py-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      {busy ? "…" : "File dispute"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisputing(false)}
                      className="text-xs text-muted-foreground underline underline-offset-4"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {moveOut.status === "settled" && (
            <p className="border-l-2 border-primary pl-3 text-sm text-primary">
              Settled — refund logged (Ref {moveOut.refundReference}).
            </p>
          )}
        </div>
      )}

      {/* disputed */}
      {moveOut.status === "disputed" && moveOut.disputeId && (
        <p className="border-l-2 border-destructive/50 pl-3 text-sm">
          Escalated to Smart Evidence Resolution.{" "}
          <Link href={`/disputes/${moveOut.disputeId}`} className="underline underline-offset-4">
            View dispute →
          </Link>
        </p>
      )}
    </div>
  );
}
