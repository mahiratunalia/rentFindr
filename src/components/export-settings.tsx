"use client";

import { useState } from "react";
import { jsPDF } from "jspdf";

export type ExportField = { key: string; label: string; enabled: boolean };
export type ScoreFormat = "number" | "percent" | "label";

type Props = {
  fields: ExportField[];
  scoreFormat: ScoreFormat;
  onFieldsChange: (fields: ExportField[]) => void;
  onScoreFormatChange: (f: ScoreFormat) => void;
  onDownloadCsv: (fields: ExportField[], scoreFormat: ScoreFormat) => void;
  onDownloadPdf: (fields: ExportField[], scoreFormat: ScoreFormat) => void;
  disabled?: boolean;
};

export function ExportSettings({
  fields,
  scoreFormat,
  onFieldsChange,
  onScoreFormatChange,
  onDownloadCsv,
  onDownloadPdf,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);

  function toggle(key: string) {
    onFieldsChange(fields.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f)));
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="w-full border border-border px-4 py-3 text-sm hover:bg-secondary disabled:opacity-40"
      >
        Export settings
      </button>
    );
  }

  return (
    <div className="border border-border p-5 space-y-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Export settings</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          close
        </button>
      </div>

      <div>
        <p className="eyebrow mb-3">Fields to include</p>
        <div className="space-y-2">
          {fields.map((f) => (
            <label key={f.key} className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={() => toggle(f.key)}
                className="size-4 accent-[var(--primary)]"
              />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="eyebrow mb-3">Score / reason format</p>
        <div className="flex">
          {(["number", "percent", "label"] as ScoreFormat[]).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => onScoreFormatChange(fmt)}
              className={`flex-1 border px-3 py-2 text-xs capitalize transition-colors ${scoreFormat === fmt ? "border-foreground bg-foreground text-paper" : "border-border hover:bg-secondary"}`}
            >
              {fmt === "number"
                ? "Raw (85)"
                : fmt === "percent"
                  ? "Percent (85%)"
                  : "Label (Strong)"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onDownloadCsv(fields, scoreFormat)}
          disabled={disabled}
          className="flex-1 border border-border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50"
        >
          Download CSV
        </button>
        <button
          type="button"
          onClick={() => onDownloadPdf(fields, scoreFormat)}
          disabled={disabled}
          className="flex-1 bg-foreground px-3 py-2 text-xs text-paper hover:opacity-90 disabled:opacity-50"
        >
          Download PDF
        </button>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function scoreLabel(v: number): string {
  if (v >= 85) return "Strong";
  if (v >= 70) return "Mixed";
  return "Thin";
}

export function formatScore(v: number, fmt: ScoreFormat): string {
  if (fmt === "percent") return `${v}%`;
  if (fmt === "label") return scoreLabel(v);
  return String(v);
}

export function downloadCsv(filename: string, rows: Record<string, string>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => `"${(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export function downloadSimplePdf(filename: string, title: string, rows: Record<string, string>[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const MARGIN = 56;
  let y = MARGIN;
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text(title, MARGIN, y);
  y += 28;
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`rentFindr · exported ${new Date().toLocaleDateString()}`, MARGIN, y);
  y += 22;
  doc.setDrawColor(160);
  doc.line(MARGIN, y, 539.28 - MARGIN, y);
  y += 10;

  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (y > 800) {
        doc.addPage();
        y = MARGIN;
      }
      doc.setFont("courier", "bold");
      doc.setFontSize(8);
      doc.setTextColor(90);
      doc.text(k.toUpperCase(), MARGIN, y);
      doc.setFont("times", "normal");
      doc.setFontSize(11);
      doc.setTextColor(20);
      const wrapped = doc.splitTextToSize(v, 483) as string[];
      doc.text(wrapped, MARGIN + 130, y);
      y += Math.max(wrapped.length * 14, 16);
    }
    y += 10;
    doc.setDrawColor(220);
    doc.line(MARGIN, y, 539.28, y);
    y += 10;
  }
  doc.save(filename);
}
