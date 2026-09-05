"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Thread = {
  applicationId: string;
  status: string;
  listingId: string;
  listingTitle: string;
  listingArea: string;
  counterpartyName: string;
  messageCount: number;
  lastMessage: { body: string; senderRole: string; createdAt: string } | null;
};

export default function MessagesPage() {
  const { status } = useSession();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "authenticated") return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/messages/threads");
        setThreads(res.ok ? await res.json() : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [status]);

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-4xl px-5 py-24 text-center">
        <p className="font-mono text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto max-w-4xl px-5 py-24 text-center">
        <p className="eyebrow">Messages</p>
        <h1 className="mt-4 text-3xl">Sign in to view your messages</h1>
        <Link
          href="/auth"
          className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <header className="border-b border-border pb-8">
        <p className="eyebrow">Communication Log</p>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
          Messages
        </h1>
      </header>

      <section className="mt-10">
        {loading ? (
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Loading…
          </p>
        ) : threads.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No conversations yet — a thread opens once you have an application on a listing.
          </p>
        ) : (
          <ul className="space-y-4">
            {threads.map((t) => (
              <li key={t.applicationId}>
                <Link
                  href={`/messages/${t.applicationId}`}
                  className="block rounded-2xl border border-border bg-[var(--card)] p-6 transition-colors hover:border-foreground"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{t.counterpartyName}</h3>
                        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                          {t.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t.listingTitle} · {t.listingArea}
                      </p>
                      {t.lastMessage ? (
                        <p className="mt-2 truncate text-sm">
                          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                            {t.lastMessage.senderRole}:{" "}
                          </span>
                          {t.lastMessage.body}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">No messages yet.</p>
                      )}
                    </div>
                    {t.lastMessage && (
                      <p className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                        {new Date(t.lastMessage.createdAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
