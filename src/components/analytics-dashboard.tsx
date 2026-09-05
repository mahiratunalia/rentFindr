"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { bdt } from "@/data/module1";
import { MAINTENANCE_SLA_HOURS } from "@/lib/maintenance";
import type { LandlordAnalytics, TenantAnalytics, TrustPoint } from "@/lib/analytics.server";

function scoreTone(score: number | null) {
  if (score == null) return "text-muted-foreground";
  if (score >= 85) return "text-trust-high";
  if (score >= 70) return "text-trust-mid";
  return "text-trust-low";
}

function StatCard({
  label,
  value,
  sub,
  valueClassName = "",
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-[var(--card)] p-6">
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 font-mono text-2xl tabular-nums ${valueClassName}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function InsightList({ insights }: { insights: string[] }) {
  if (!insights.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Not enough platform activity yet to compute insights — they&apos;ll appear as more
        tenancies, payments and reviews accumulate.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {insights.map((text, i) => (
        <li key={i} className="border-l-2 border-accent pl-3 text-sm text-muted-foreground">
          {text}
        </li>
      ))}
    </ul>
  );
}

const chartTick = { fontSize: 11, fill: "var(--muted-foreground)" };
const chartAxisLine = { stroke: "var(--border)" };
const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
};

function TrustTrendChart({ trend }: { trend: TrustPoint[] }) {
  if (!trend.some((p) => p.score != null)) {
    return <p className="text-sm text-muted-foreground">No Trust Score history yet.</p>;
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={chartTick} axisLine={chartAxisLine} tickLine={false} />
          <YAxis
            domain={[0, 100]}
            tick={chartTick}
            axisLine={chartAxisLine}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number) => [`${value}`, "Trust Score"]}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function IncomeTrendChart({
  trend,
  seriesLabel = "Rent logged",
  emptyMessage = "No logged rent payments yet.",
}: {
  trend: { label: string; total: number }[];
  seriesLabel?: string;
  emptyMessage?: string;
}) {
  if (!trend.some((p) => p.total !== 0)) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={chartTick} axisLine={chartAxisLine} tickLine={false} />
          <YAxis
            tick={chartTick}
            axisLine={chartAxisLine}
            tickLine={false}
            width={56}
            tickFormatter={(v: number) => bdt(v)}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number) => [bdt(value), seriesLabel]}
          />
          <Bar dataKey="total" fill="var(--accent)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LandlordAnalyticsSection() {
  const [data, setData] = useState<LandlordAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/landlord")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Loading analytics…
      </p>
    );
  }
  if (!data) {
    return <p className="mt-6 text-sm text-muted-foreground">Could not load analytics.</p>;
  }

  return (
    <div className="mt-6 space-y-10">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Occupancy"
          value={data.occupancy.rate != null ? `${data.occupancy.rate}%` : "—"}
          sub={`${data.occupancy.occupied} / ${data.occupancy.totalActive} active listings occupied`}
        />
        <StatCard label="Rent logged this month" value={bdt(data.income.currentMonthTotal)} />
        <StatCard
          label="Net yield this month"
          value={bdt(data.netYield.currentMonthTotal)}
          sub={
            data.improvementSpend.currentMonthTotal > 0
              ? `after ${bdt(data.improvementSpend.currentMonthTotal)} improvement spend`
              : "no improvement spend logged this month"
          }
        />
        <StatCard
          label="Avg. time to first tenant"
          value={data.vacancy.avgDays != null ? `${data.vacancy.avgDays}d` : "—"}
          sub={
            data.vacancy.sampleSize
              ? `from ${data.vacancy.sampleSize} listing${data.vacancy.sampleSize === 1 ? "" : "s"}`
              : "no accepted tenancies yet"
          }
        />
        <StatCard
          label="Deposits held"
          value={bdt(data.deposits.totalHeld)}
          sub={`${data.deposits.activeCount} active tenanc${data.deposits.activeCount === 1 ? "y" : "ies"}`}
        />
      </div>

      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <h3 className="eyebrow mb-4">Rent logged, last 6 months</h3>
          <IncomeTrendChart trend={data.income.trend} />
        </div>
        <div>
          <h3 className="eyebrow mb-4">Net yield, last 6 months</h3>
          <IncomeTrendChart
            trend={data.netYield.trend}
            seriesLabel="Net yield"
            emptyMessage="No income or improvement spend logged yet."
          />
        </div>
      </div>

      <div>
        <h3 className="eyebrow mb-4">Trust Score trend</h3>
        <div className="mb-3 flex items-baseline gap-2">
          <span className={`font-mono text-2xl tabular-nums ${scoreTone(data.trust.score)}`}>
            {data.trust.score ?? "—"}
          </span>
          <span className="text-xs text-muted-foreground">
            / 100 · computed from your real payment, maintenance, verification, review and agreement
            data
          </span>
        </div>
        <TrustTrendChart trend={data.trust.trend} />
      </div>

      <div>
        <h3 className="eyebrow mb-3">Maintenance responsiveness</h3>
        <p className="text-sm text-muted-foreground">
          {data.maintenance.totalResolved > 0
            ? `Average resolution time ${data.maintenance.avgResolutionHours}h across ${data.maintenance.totalResolved} resolved request${data.maintenance.totalResolved === 1 ? "" : "s"} — ${data.maintenance.withinSlaRate}% within the ${MAINTENANCE_SLA_HOURS}h SLA.`
            : "No resolved maintenance requests yet."}
          {data.maintenance.openOverdue > 0 &&
            ` ${data.maintenance.openOverdue} open request${data.maintenance.openOverdue === 1 ? " is" : "s are"} currently past SLA.`}
        </p>
      </div>

      <div>
        <h3 className="eyebrow mb-3">Insights</h3>
        <InsightList insights={data.insights} />
      </div>
    </div>
  );
}

export function TenantAnalyticsSection() {
  const [data, setData] = useState<TenantAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/tenant")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Loading your insights…
      </p>
    );
  }
  if (!data) {
    return <p className="mt-6 text-sm text-muted-foreground">Could not load your insights.</p>;
  }

  return (
    <div className="mt-6 space-y-10">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Payment completion"
          value={data.payments.completionRate != null ? `${data.payments.completionRate}%` : "—"}
          sub={`${data.payments.totalPaid} / ${data.payments.totalLogged} logged payments paid`}
        />
        <StatCard
          label="Deposits on file"
          value={bdt(data.deposits.totalPaid)}
          sub={`${data.deposits.activeCount} active tenanc${data.deposits.activeCount === 1 ? "y" : "ies"}`}
        />
        <StatCard
          label="Maintenance filed"
          value={`${data.maintenance.filed}`}
          sub={
            data.maintenance.avgResolutionHours != null
              ? `avg. resolved in ${data.maintenance.avgResolutionHours}h`
              : "none resolved yet"
          }
        />
        <StatCard
          label="Trust Score"
          value={data.trust.score != null ? `${data.trust.score}` : "—"}
          valueClassName={scoreTone(data.trust.score)}
        />
      </div>

      <div>
        <h3 className="eyebrow mb-4">Trust Score trend</h3>
        <TrustTrendChart trend={data.trust.trend} />
      </div>

      <div>
        <h3 className="eyebrow mb-3">Insights</h3>
        <InsightList insights={data.insights} />
      </div>
    </div>
  );
}
