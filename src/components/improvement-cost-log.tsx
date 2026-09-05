"use client";

import { useEffect, useState } from "react";

const MAX_PHOTO_BYTES = 1_500_000;

type ImprovementCost = {
  id: string;
  loggedByRole: string;
  title: string;
  description: string;
  amount: number;
  photoUrl: string | null;
  settlementMethod: "deduct_from_deposit" | "deduct_from_rent" | "reimburse_separately";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

const METHOD_LABEL: Record<ImprovementCost["settlementMethod"], string> = {
  deduct_from_deposit: "Deduct from deposit",
  deduct_from_rent: "Deduct from rent",
  reimburse_separately: "Reimburse separately",
};

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

export function ImprovementCostLog({
  applicationId,
  viewerIsLandlord,
}: {
  applicationId: string;
  viewerIsLandlord: boolean;
}) {
  const [costs, setCosts] = useState<ImprovementCost[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [settlementMethod, setSettlementMethod] =
    useState<ImprovementCost["settlementMethod"]>("deduct_from_deposit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewerRole = viewerIsLandlord ? "landlord" : "tenant";

  async function load() {
    const res = await fetch(`/api/improvement-costs?applicationId=${applicationId}`);
    setCosts(res.ok ? await res.json() : []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/improvement-costs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          applicationId,
          title,
          description,
          amount: Number(amount),
          photoUrl,
          settlementMethod,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not log this cost.");
      setTitle("");
      setDescription("");
      setAmount("");
      setPhotoUrl(undefined);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log this cost.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(costId: string, action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/improvement-costs/${costId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not record that decision.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that decision.");
    } finally {
      setBusy(false);
    }
  }

  if (costs === null) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Loading improvement costs…
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <p className="eyebrow">Renovation & improvement costs</p>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {costs.length > 0 && (
        <ul className="space-y-3">
          {costs.map((c) => (
            <li key={c.id} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{c.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    Logged by {c.loggedByRole} · {METHOD_LABEL[c.settlementMethod]}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm tabular-nums">{bdt(c.amount)}</p>
                  <p
                    className={`mt-1 font-mono text-[11px] uppercase tracking-wider ${
                      c.status === "approved"
                        ? "text-primary"
                        : c.status === "rejected"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {c.status}
                  </p>
                </div>
              </div>
              {c.photoUrl && (
                <img
                  src={c.photoUrl}
                  alt={c.title}
                  className="mt-3 h-24 w-full rounded-lg border border-border object-cover"
                />
              )}
              {c.status === "pending" && c.loggedByRole !== viewerRole && (
                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => decide(c.id, "approve")}
                    className="rounded-full bg-primary px-3 py-1.5 text-xs text-paper hover:opacity-90 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => decide(c.id, "reject")}
                    className="rounded-full border border-destructive/50 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <form onSubmit={submit} className="space-y-3">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Repainted living room"
            className="w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
          />
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What was done and why"
            className="w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
          />
          <div className="flex flex-wrap gap-3">
            <input
              required
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (৳)"
              className="flex-1 border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
            />
            <select
              value={settlementMethod}
              onChange={(e) =>
                setSettlementMethod(e.target.value as ImprovementCost["settlementMethod"])
              }
              className="flex-1 border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
            >
              <option value="deduct_from_deposit">Deduct from deposit</option>
              <option value="deduct_from_rent">Deduct from rent</option>
              <option value="reimburse_separately">Reimburse separately</option>
            </select>
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > MAX_PHOTO_BYTES) {
                setError(`Photo must be under ${Math.round(MAX_PHOTO_BYTES / 1_000_000)}MB.`);
                return;
              }
              setPhotoUrl(await fileToBase64(file));
            }}
            className="text-xs"
          />
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-accent px-4 py-2 text-xs text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Logging…" : "Log cost"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-muted-foreground underline underline-offset-4"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-xs underline underline-offset-4"
        >
          Log an improvement cost →
        </button>
      )}
    </div>
  );
}
