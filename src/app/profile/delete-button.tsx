"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  type: "savedListing" | "application" | "roommateSession" | "agreementDraft";
};

export function DeleteButton({ id, type }: Props) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/delete", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, type }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not delete this.");
        return;
      }
      setConfirm(false);
      router.refresh();
    } catch {
      setError("Could not delete this.");
    } finally {
      setBusy(false);
    }
  }

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="font-mono text-[11px] text-muted-foreground hover:text-destructive"
      >
        delete
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span className="font-mono text-[11px] text-destructive">{error}</span>
      ) : (
        <span className="font-mono text-[11px] text-muted-foreground">sure?</span>
      )}
      <button
        type="button"
        onClick={del}
        disabled={busy}
        className="font-mono text-[11px] text-destructive hover:underline disabled:opacity-50"
      >
        {busy ? "…" : "yes"}
      </button>
      <button
        type="button"
        onClick={() => {
          setConfirm(false);
          setError(null);
        }}
        className="font-mono text-[11px] text-muted-foreground hover:underline"
      >
        no
      </button>
    </div>
  );
}
