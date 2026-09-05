export type ActivityEventItem = {
  id: string;
  type: string;
  actor: string;
  summary: string;
  createdAt: string | Date;
};

const typeGlyph: Record<string, string> = {
  agreement_signed_by_tenant: "✎",
  agreement_signed_by_landlord: "✎",
  agreement_fully_executed: "✓",
  payment_logged: "৳",
  payment_failed: "!",
  dispute_filed: "⚑",
  dispute_resolved: "✓",
  message_flagged: "✉",
  move_out_proposed: "⌂",
  move_out_acknowledged: "✓",
  move_out_deductions_set: "৳",
  move_out_confirmed: "✓",
  move_out_settled: "✓",
  expiry_reminder_sent: "⏰",
  rent_due_reminder_sent: "⏰",
  improvement_cost_logged: "🛠",
  improvement_cost_approved: "✓",
  improvement_cost_rejected: "✗",
};

export function ActivityTimeline({ events }: { events: ActivityEventItem[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <ol className="border-l border-border pl-6">
      {events.map((e) => (
        <li key={e.id} className="relative pb-6 last:pb-0">
          <span
            aria-hidden
            className="absolute -left-[29px] flex size-4 items-center justify-center rounded-full border border-border bg-[var(--card)] font-mono text-[9px]"
          >
            {typeGlyph[e.type] ?? "•"}
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm">{e.summary}</p>
            <p className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
              {new Date(e.createdAt).toLocaleString("en-BD", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {e.actor}
          </p>
        </li>
      ))}
    </ol>
  );
}
