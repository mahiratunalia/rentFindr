"use client";

import { useState } from "react";

function currentMonthLabel() {
  return new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function PayRentForm({ listingId, rent }: { listingId: string; rent: number }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(currentMonthLabel);
  const [amount, setAmount] = useState(String(rent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payment/initiate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId, amount: Number(amount), month }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not start payment.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-block text-sm underline underline-offset-4"
      >
        Log rent payment →
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap gap-4">
        <label className="flex-1 text-xs">
          <span className="eyebrow">Month</span>
          <input
            required
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
          />
        </label>
        <label className="flex-1 text-xs">
          <span className="eyebrow">Amount (৳)</span>
          <input
            required
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
          />
        </label>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-accent px-4 py-2 text-xs text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Redirecting…" : "Pay via SSLCOMMERZ"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground underline underline-offset-4"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
