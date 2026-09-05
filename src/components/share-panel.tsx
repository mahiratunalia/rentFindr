"use client";

import { useState } from "react";

type Props = {
  type: "agreement" | "roommate_session";
  resourceId: string | null;
  disabled?: boolean;
};

type LinkState = { token: string; url: string; expiresAt: string } | null;

export function SharePanel({ type, resourceId, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<LinkState>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);

  async function generate(withEmail = false) {
    if (!resourceId) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          resourceId,
          recipientEmail: withEmail && email ? email : undefined,
          recipientName: withEmail && name ? name : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate link");
      setLink(data);
      setStatus(withEmail && email ? `Link sent to ${email}` : "Link generated");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!link) return;
    setRevoking(true);
    try {
      const res = await fetch("/api/share", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: link.token }),
      });
      if (res.ok) {
        setLink(null);
        setStatus("Link revoked — it is now invalid.");
      }
    } finally {
      setRevoking(false);
    }
  }

  function copy() {
    if (!link) return;
    navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="w-full border border-border px-4 py-3 text-sm hover:bg-secondary disabled:opacity-40"
      >
        Share via secure link
      </button>
    );
  }

  return (
    <div className="border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Secure share link</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          close
        </button>
      </div>

      {!link ? (
        <>
          <label className="block">
            <span className="eyebrow">Recipient email (optional)</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="tenant@example.com"
              className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
            />
          </label>
          <label className="block">
            <span className="eyebrow">Recipient name (optional)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tanzila"
              className="mt-2 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none focus:border-foreground"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => generate(false)}
              disabled={busy || !resourceId}
              className="flex-1 bg-foreground px-3 py-2 text-xs text-paper hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate link"}
            </button>
            {email && (
              <button
                type="button"
                onClick={() => generate(true)}
                disabled={busy || !resourceId}
                className="flex-1 border border-border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send via email"}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              readOnly
              value={link.url}
              className="flex-1 border-b border-input bg-transparent py-1.5 font-mono text-xs outline-none"
            />
            <button
              type="button"
              onClick={copy}
              className="border border-border px-3 py-1.5 text-xs hover:bg-secondary"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            Expires {new Date(link.expiresAt).toLocaleDateString()} · 7 days
          </p>
          <button
            type="button"
            onClick={revoke}
            disabled={revoking}
            className="w-full border border-destructive/50 px-3 py-2 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-50"
          >
            {revoking ? "Revoking…" : "Revoke this link"}
          </button>
        </>
      )}

      {status && (
        <p className="border-l-2 border-accent pl-3 text-xs text-muted-foreground">{status}</p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Links expire after 7 days. You can revoke them at any time.
      </p>
    </div>
  );
}
