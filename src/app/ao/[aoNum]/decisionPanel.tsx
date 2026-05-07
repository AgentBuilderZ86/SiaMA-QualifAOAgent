import type { AoRecord, QualificationFiche } from "@/lib/aoTypes";

function shortText(value: unknown, max = 180) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "À confirmer";
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

function asList(items: string[] | undefined, fallback: string[]) {
  return items?.length ? items.slice(0, 3) : fallback;
}

export function DecisionPanel({ ao, qualification }: { ao: AoRecord; qualification: Partial<QualificationFiche> | null }) {
  const intelligence = qualification?.intelligence;
  const recommendation = intelligence?.recommendation || ao.decisionIa || "À qualifier";
  const score = intelligence?.goNoGoScore;
  const confidence = intelligence?.confidenceLevel || "À confirmer";
  const reasons = asList(intelligence?.winThemes, [shortText(ao.justificationIa || qualification?.recommendation || "Analyse IA à générer.")]);
  const risks = intelligence?.risks?.slice(0, 3) ?? [];
  const nextAction =
    intelligence?.recommendation === "GO"
      ? "Préparer la réponse et sécuriser les clarifications."
      : intelligence?.recommendation === "NO GO"
        ? "Documenter le motif de non-poursuite."
        : "Clarifier les points bloquants avant décision.";

  return (
    <section className="decision-panel">
      <div>
        <p className="eyebrow">Décision IA</p>
        <div className="decision-title-row">
          <span className={`decision-badge ${String(recommendation).toLowerCase().replace(/\s+/g, "-")}`}>{recommendation}</span>
          {typeof score === "number" ? <strong className="decision-score">{score}/100</strong> : null}
        </div>
        <p className="muted">Confiance : {confidence}</p>
      </div>
      <div className="decision-content">
        <div>
          <span>Raisons clés</span>
          <ul>
            {reasons.map((reason) => (
              <li key={reason}>{shortText(reason, 120)}</li>
            ))}
          </ul>
        </div>
        <div>
          <span>Vigilances</span>
          <ul>
            {risks.length ? risks.map((risk) => <li key={risk.label}>{shortText(`${risk.label} : ${risk.mitigation}`, 130)}</li>) : <li>Risques à confirmer.</li>}
          </ul>
        </div>
        <div className="next-action">
          <span>Prochaine action</span>
          <strong>{nextAction}</strong>
        </div>
      </div>
    </section>
  );
}
