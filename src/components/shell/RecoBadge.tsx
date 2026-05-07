import type { ReactNode } from "react";

type RecoTone = "go" | "watch" | "nogo";

function toneFromRecommendation(value: string | undefined | null): RecoTone {
  const v = String(value || "").toUpperCase().trim();
  if (v === "GO" || v === "🟢" || v === "PW") return "go";
  if (v === "NO GO" || v === "NOGO" || v === "🔴" || v === "PL") return "nogo";
  return "watch";
}

const GLYPH: Record<RecoTone, string> = {
  go: "🟢",
  watch: "🟡",
  nogo: "🔴"
};

const LABEL: Record<RecoTone, string> = {
  go: "GO",
  watch: "WATCH",
  nogo: "NO GO"
};

export function RecoBadge({
  recommendation,
  score,
  maxScore = 15,
  showGlyph = true
}: {
  recommendation?: string | null;
  score?: number;
  maxScore?: number;
  showGlyph?: boolean;
}) {
  const tone = toneFromRecommendation(recommendation);
  const label = LABEL[tone];
  return (
    <span className={`reco ${tone}`}>
      <span className="d" aria-hidden="true" />
      {showGlyph ? <span aria-hidden="true">{GLYPH[tone]}</span> : null}
      <strong>{label}</strong>
      {typeof score === "number" ? <span className="t-mono-sm">· {score}/{maxScore}</span> : null}
    </span>
  );
}

export function RecoBox({
  recommendation,
  title,
  children
}: {
  recommendation?: string | null;
  title: string;
  children?: ReactNode;
}) {
  const tone = toneFromRecommendation(recommendation);
  return (
    <div className={`reco-box ${tone}`}>
      <h4>
        <span aria-hidden="true">{GLYPH[tone]}</span> {title}
      </h4>
      {children ? <p>{children}</p> : null}
    </div>
  );
}
