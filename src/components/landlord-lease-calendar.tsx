"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LeaseTimelineBar } from "@/components/lease-timeline-bar";
import type { LeaseTimeline } from "@/lib/lease-timeline";

type LandlordLeaseTimelineItem = LeaseTimeline & {
  applicationId: string;
  listingId: string;
  listingTitle: string;
  tenantName: string;
  renewalWindowMonthLabel: string;
};

export function LandlordLeaseCalendar() {
  const [items, setItems] = useState<LandlordLeaseTimelineItem[] | null>(null);

  useEffect(() => {
    fetch("/api/lease-timeline/landlord")
      .then((r) => (r.ok ? r.json() : []))
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  if (items === null) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Loading lease timelines…
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No active, fully-signed tenancies yet.
      </p>
    );
  }

  const byMonth = new Map<string, LandlordLeaseTimelineItem[]>();
  for (const item of items) {
    const list = byMonth.get(item.renewalWindowMonthLabel);
    if (list) list.push(item);
    else byMonth.set(item.renewalWindowMonthLabel, [item]);
  }

  return (
    <div className="space-y-8">
      {[...byMonth.entries()].map(([month, monthItems]) => (
        <div key={month}>
          <p className="eyebrow">
            {month} · {monthItems.length} propert{monthItems.length === 1 ? "y" : "ies"} entering
            renewal window
          </p>
          <div className="mt-3 space-y-4">
            {monthItems.map((item) => (
              <div
                key={item.applicationId}
                className="rounded-2xl border border-border bg-[var(--card)] p-5"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <Link
                    href={`/listings/${item.listingId}`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {item.listingTitle}
                  </Link>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {item.tenantName}
                  </span>
                </div>
                <div className="mt-3">
                  <LeaseTimelineBar timeline={item} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
