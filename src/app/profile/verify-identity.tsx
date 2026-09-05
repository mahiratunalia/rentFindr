"use client";

import { useState } from "react";

const MAX_PHOTO_BYTES = 1_500_000; // ~1.5MB raw, stays under the server's base64 char limit

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

const inputCls =
  "mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground";

export function VerifyIdentity({
  initialStatus,
  initialNote,
}: {
  initialStatus: "pending" | "verified" | "rejected" | null;
  initialNote: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [reviewNote] = useState(initialNote);
  const [nidNumber, setNidNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [nidPhoto, setNidPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function handlePhoto(file: File | null) {
    if (file && file.size > MAX_PHOTO_BYTES) {
      setMessage(
        `That photo is too large — please use one under ${Math.round(MAX_PHOTO_BYTES / 1_000_000)}MB.`,
      );
      return;
    }
    setNidPhoto(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nidNumber || !phone || !nidPhoto) {
      setMessage("NID number, phone, and an NID photo are all required.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tenant/verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nidNumber,
          phone,
          nidPhoto: await fileToBase64(nidPhoto),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not submit verification.");
      setStatus("pending");
      setMessage("Submitted — an admin will review it shortly.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "verified") {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
        <p className="eyebrow text-primary">✓ Identity verified</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Landlords see this on your applications, and it&apos;s the first factor in ranked
          applicant lists.
        </p>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="rounded-2xl border border-border bg-[var(--card)] p-6">
        <p className="eyebrow">Verification pending</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Your NID and phone are with an admin for review. You&apos;ll see this update once
          it&apos;s checked.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-[var(--card)] p-6">
      <p className="eyebrow">Verify your identity</p>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        Optional — but verified tenants are ranked ahead of unverified ones when a landlord reviews
        applicants for a listing.
      </p>
      {status === "rejected" && (
        <p className="mt-3 border-l-2 border-destructive pl-3 text-xs text-destructive">
          Your previous submission was rejected{reviewNote ? `: ${reviewNote}` : "."} You can
          resubmit below.
        </p>
      )}
      <form onSubmit={submit} className="mt-5 space-y-5">
        <label className="block">
          <span className="eyebrow">NID number</span>
          <input
            value={nidNumber}
            onChange={(e) => setNidNumber(e.target.value)}
            className={inputCls}
            placeholder="1994 7712 8830"
          />
        </label>
        <label className="block">
          <span className="eyebrow">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputCls}
            placeholder="+880 1XXX XXXXXX"
          />
        </label>
        <label className="block">
          <span className="eyebrow">NID photo</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
            className="mt-2 w-full text-xs file:mr-3 file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-xs"
          />
          {nidPhoto && <p className="mt-1 text-xs text-primary">✓ {nidPhoto.name}</p>}
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-accent px-4 py-3 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Submit for review"}
        </button>
      </form>
      {message && (
        <p className="mt-4 border-l-2 border-accent pl-3 text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
