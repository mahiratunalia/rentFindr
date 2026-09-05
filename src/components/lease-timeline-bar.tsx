import type { LeaseTimeline } from "@/lib/lease-timeline";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function LeaseTimelineBar({ timeline }: { timeline: LeaseTimeline }) {
  return (
    <div>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>Move-in {fmt(timeline.moveInDate)}</span>
        <span>Expiry {fmt(timeline.endDate)}</span>
      </div>
      <div className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-border">
        {/* renewal-decision window: the last stretch before expiry */}
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 bg-accent/30"
          style={{ left: `${timeline.renewalWindowPercent}%` }}
        />
        {/* elapsed portion, up to today */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 bg-foreground"
          style={{ width: `${timeline.elapsedPercent}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs">
        {timeline.isExpired ? (
          <span className="text-destructive">
            Expired {Math.abs(timeline.daysRemaining)} days ago
          </span>
        ) : timeline.elapsedDays < 0 ? (
          <span className="text-muted-foreground">
            Moves in {Math.abs(timeline.elapsedDays)} day
            {Math.abs(timeline.elapsedDays) === 1 ? "" : "s"}
          </span>
        ) : timeline.inRenewalWindow ? (
          <span className="text-accent">
            Renewal decision window — {timeline.daysRemaining} day
            {timeline.daysRemaining === 1 ? "" : "s"} left
          </span>
        ) : (
          <span className="text-muted-foreground">
            {timeline.daysRemaining} days remaining · {timeline.elapsedPercent}% of tenancy elapsed
          </span>
        )}
      </p>
    </div>
  );
}
