"use client";

import { useEffect, useState, use as usePromise, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

type Message = {
  id: string;
  senderRole: string;
  senderName: string;
  body: string;
  flagged: boolean;
  flagReason: string | null;
  createdAt: string;
};

type Thread = {
  applicationId: string;
  listingTitle: string;
  listingArea: string;
  counterpartyName: string;
};

export default function MessageThreadPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = usePromise(params);
  const { status: sessionStatus } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [msgRes, threadsRes] = await Promise.all([
        fetch(`/api/messages?applicationId=${applicationId}`),
        fetch("/api/messages/threads"),
      ]);
      const data = await msgRes.json().catch(() => ({}));
      if (!msgRes.ok) throw new Error(data.error ?? "Could not load this conversation.");
      setMessages(data);
      if (threadsRes.ok) {
        const threads: Thread[] = await threadsRes.json();
        setThread(threads.find((t) => t.applicationId === applicationId) ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this conversation.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, applicationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId, body: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not send message.");
      setDraft("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <p className="font-mono text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (sessionStatus === "unauthenticated") {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <h1 className="text-3xl">Sign in to view this conversation</h1>
        <Link
          href="/auth"
          className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Link href="/messages" className="mt-6 inline-block text-sm underline">
          ← Back to messages
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-5 py-12">
      <Link href="/messages" className="text-xs text-muted-foreground hover:underline">
        ← All messages
      </Link>

      <header className="mt-4 border-b border-border pb-6">
        <p className="eyebrow">Conversation</p>
        <h1 className="mt-2 text-2xl">{thread?.counterpartyName ?? "Conversation"}</h1>
        {thread && (
          <p className="mt-1 text-sm text-muted-foreground">
            {thread.listingTitle} · {thread.listingArea}
          </p>
        )}
      </header>

      <div className="mt-6 flex-1 space-y-4">
        {messages.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No messages yet — say hello.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="rounded-2xl border border-border bg-[var(--card)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  {m.senderName} · {m.senderRole}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {new Date(m.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 text-sm">{m.body}</p>
              {m.flagged && (
                <p className="mt-2 border-t border-border pt-2 text-xs text-accent">
                  ⚑ Flagged for evidence{m.flagReason ? ` — ${m.flagReason}` : ""}
                </p>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={send}
        className="sticky bottom-0 mt-6 flex gap-3 border-t border-border bg-paper/95 py-4 backdrop-blur"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          className="flex-1 border-b border-input bg-transparent py-2 text-sm outline-none focus:border-foreground"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
