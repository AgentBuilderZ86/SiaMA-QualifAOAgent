import type { AoRecord, AoStatus } from "@/lib/ao";
import { transitionAction } from "../actions";

const WORKFLOW: Array<{ status: AoStatus; label: string; helper: string }> = [
  { status: "A QUALIFIER", label: "À qualifier", helper: "Analyse initiale" },
  { status: "GO", label: "GO", helper: "Décision de poursuivre" },
  { status: "BO", label: "BO", helper: "Qualification engagée" },
  { status: "P2P", label: "P2P", helper: "Simulation / propale" },
  { status: "PS", label: "PS", helper: "Proposition envoyée" },
  { status: "PITCH", label: "Pitch", helper: "Soutenance" }
];

const CLOSING: Array<{ status: AoStatus; label: string }> = [
  { status: "PW", label: "Win" },
  { status: "PL", label: "Loss" }
];

function currentIndex(status: string) {
  const index = WORKFLOW.findIndex((step) => step.status === status);
  return index >= 0 ? index : WORKFLOW.length;
}

function transitionButton(ao: AoRecord, status: AoStatus, label: string, note: string) {
  return (
    <form action={transitionAction} key={status}>
      <input type="hidden" name="aoNum" value={ao.aoNum} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="note" value={note} />
      <button className="button ghost" type="submit">
        {label}
      </button>
    </form>
  );
}

export function WorkflowFlow({ ao, enabled }: { ao: AoRecord; enabled: boolean }) {
  const index = currentIndex(ao.statut);
  const next = WORKFLOW[index + 1];

  return (
    <section className="card section">
      <div className="section-header">
        <div>
          <p className="eyebrow">Workflow</p>
          <h2>Avancement opportunité</h2>
        </div>
        <span className={`badge ${ao.statut.toLowerCase().replace(/\s+/g, "-")}`}>{ao.statut}</span>
      </div>
      <div className="workflow-steps">
        {WORKFLOW.map((step, stepIndex) => (
          <div className={`workflow-step ${stepIndex < index ? "done" : ""} ${stepIndex === index ? "active" : ""}`} key={step.status}>
            <strong>{step.label}</strong>
            <span>{step.helper}</span>
          </div>
        ))}
        <div className={`workflow-step ${["PW", "PL"].includes(ao.statut) ? "active" : ""}`}>
          <strong>Clôture</strong>
          <span>Win / Loss</span>
        </div>
      </div>
      {enabled ? (
        <div className="actions-grid" style={{ marginTop: 16 }}>
          {next ? transitionButton(ao, next.status, `Avancer vers ${next.label}`, `Transition workflow vers ${next.status}`) : null}
          {CLOSING.map((item) => transitionButton(ao, item.status, `Clôturer ${item.label}`, `Clôture workflow ${item.status}`))}
        </div>
      ) : (
        <div className="alert" style={{ marginTop: 16 }}>
          Workflow interne désactivé : configurez Google Sheets pour enregistrer les transitions.
        </div>
      )}
    </section>
  );
}
