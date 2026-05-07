import type { ReactNode } from "react";
import type { AoStatus } from "@/lib/aoTypes";

const STATUS_TO_CLASS: Record<string, string> = {
  "A QUALIFIER": "pill--aq",
  "GO": "pill--pw",
  "NO GO": "pill--nogo",
  "BO": "pill--bo",
  "P2P": "pill--p2p",
  "PS": "pill--ps",
  "PITCH": "pill--pitch",
  "PW": "pill--pw",
  "PL": "pill--pl",
  "AUTRE": ""
};

const STATUS_TO_GLYPH: Record<string, string> = {
  "A QUALIFIER": "⏳",
  "GO": "🟢",
  "NO GO": "🚫",
  "BO": "🔵",
  "P2P": "📝",
  "PS": "📤",
  "PITCH": "🎤",
  "PW": "✅",
  "PL": "❌",
  "AUTRE": ""
};

const STATUS_TO_LABEL: Record<string, string> = {
  "A QUALIFIER": "A QUALIFIER",
  "GO": "GO",
  "NO GO": "NO GO",
  "BO": "BO",
  "P2P": "P2P",
  "PS": "PS",
  "PITCH": "PITCH",
  "PW": "PW",
  "PL": "PL",
  "AUTRE": "AUTRE"
};

export function statusPillClass(status: string): string {
  const normalized = status.toUpperCase().trim();
  return STATUS_TO_CLASS[normalized] || "";
}

export function statusGlyph(status: string): string {
  const normalized = status.toUpperCase().trim();
  return STATUS_TO_GLYPH[normalized] || "";
}

export function Pill({ status, label, className = "", children }: {
  status?: AoStatus | string;
  label?: string;
  className?: string;
  children?: ReactNode;
}) {
  if (children) {
    return <span className={`pill ${className}`.trim()}>{children}</span>;
  }
  const normalized = String(status || "").toUpperCase().trim();
  const cls = STATUS_TO_CLASS[normalized] || "";
  const glyph = STATUS_TO_GLYPH[normalized] || "";
  const text = label || STATUS_TO_LABEL[normalized] || normalized || "—";
  return (
    <span className={`pill ${cls} ${className}`.trim()}>
      {glyph ? <span aria-hidden="true">{glyph}</span> : null}
      {text}
    </span>
  );
}
