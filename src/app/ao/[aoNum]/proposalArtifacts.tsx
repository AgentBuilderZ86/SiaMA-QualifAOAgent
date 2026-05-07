import type { FinancialSimulation, ProposalSection } from "@/lib/aoTypes";

function formatDh(value: unknown) {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue)) return "NC";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(numberValue);
}

function formatPercent(value: unknown) {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue)) return "NC";
  return `${Math.round(numberValue * 100)}%`;
}

export function parseJsonField(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function FinancialSimulationView({ simulation }: { simulation: Partial<FinancialSimulation> | null }) {
  if (!simulation) return <p className="muted">Aucune simulation enregistrée.</p>;
  const rows = Array.isArray(simulation.rows) ? simulation.rows : [];
  const margin = Number(simulation.marge || 0);

  return (
    <div className="finance-compact">
      <div className="finance-main">
        <div>
          <span>Total TTC</span>
          <strong>{formatDh(simulation.totalTtc)} DH</strong>
          <small>HT {formatDh(simulation.totalHt)} DH · TVA {formatPercent(simulation.tvaRate)}</small>
        </div>
        <div>
          <span>Charge</span>
          <strong>{simulation.totalJours ?? "NC"} JH</strong>
          <small>Budget cible {formatDh(simulation.budgetCible)} DH</small>
        </div>
        <div className={margin >= 0 ? "finance-positive" : "finance-negative"}>
          <span>Marge vs budget</span>
          <strong>{formatDh(simulation.marge)} DH</strong>
          <small>{margin >= 0 ? "Marge disponible" : "Dépassement à arbitrer"}</small>
        </div>
      </div>
      <p className="muted">Référentiel : {simulation.source || "Source non renseignée"}</p>
      <details className="collapsible-panel">
        <summary>Détail par phase, profil, JH et TJM</summary>
        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Phase</th>
              <th>Profil</th>
              <th>Jours</th>
              <th>TJM</th>
              <th>Montant HT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.phase}-${row.profil}-${index}`}>
                <td>{row.phase}</td>
                <td>{row.profil}</td>
                <td>{row.jours}</td>
                <td>{formatDh(row.tjm)} DH</td>
                <td>{formatDh(row.montantHt)} DH</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  Aucun détail de simulation disponible.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function proposalValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeProposal(proposal: unknown): ProposalSection | null {
  if (!proposal || typeof proposal !== "object") return null;
  const record = proposal as Partial<ProposalSection>;
  const section = proposalValue(record.section, "Section propale");
  const bodyText = proposalValue(record.bodyText, proposalValue(record.content, "Contenu non disponible."));
  const keyMessages = Array.isArray(record.keyMessages) ? record.keyMessages.filter((item): item is string => typeof item === "string") : [];
  const slideTitle = proposalValue(record.slideTitle, section);
  const diagramTitle = proposalValue(record.diagramTitle, "Schéma de synthèse");
  const diagramMermaid = proposalValue(record.diagramMermaid, "");
  const sources = Array.isArray(record.sources) ? record.sources.filter((item): item is string => typeof item === "string") : [];
  const pptCopyBlock = proposalValue(
    record.pptCopyBlock,
    [
      `Titre slide : ${slideTitle}`,
      "",
      "Messages clés :",
      ...(keyMessages.length ? keyMessages.map((item) => `- ${item}`) : ["- À confirmer"]),
      "",
      "Texte :",
      bodyText,
      "",
      diagramMermaid ? `Schéma :\n${diagramMermaid}` : "",
      "",
      `Sources : ${sources.length ? sources.join(", ") : "À confirmer"}`
    ]
      .filter(Boolean)
      .join("\n")
  );

  return {
    section,
    content: proposalValue(record.content, bodyText),
    slideTitle,
    keyMessages,
    bodyText,
    diagramTitle,
    diagramMermaid,
    pptCopyBlock,
    sources
  };
}

export function ProposalSectionView({ proposal }: { proposal: unknown }) {
  const normalized = normalizeProposal(proposal);
  if (!normalized) return <p className="muted">Aucune section propale générée.</p>;

  return (
    <div className="info-grid">
      <div className="info-item">
        <span>Titre slide</span>
        <strong>{normalized.slideTitle}</strong>
      </div>
      <div className="info-item">
        <span>Messages clés</span>
        {normalized.keyMessages.length ? (
          <ul>
            {normalized.keyMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : (
          <p>À confirmer</p>
        )}
      </div>
      <div className="info-item">
        <span>Texte de slide</span>
        <pre className="pre">{normalized.bodyText}</pre>
      </div>
      {normalized.diagramMermaid ? (
        <div className="info-item">
          <span>{normalized.diagramTitle}</span>
          <pre className="pre">{normalized.diagramMermaid}</pre>
        </div>
      ) : null}
      <div className="info-item">
        <span>Bloc PowerPoint complet à copier</span>
        <pre className="pre">{normalized.pptCopyBlock}</pre>
      </div>
      <div className="source-row">
        {normalized.sources.map((source) => (
          <span className="source-chip" key={source}>
            {source}
          </span>
        ))}
      </div>
    </div>
  );
}
