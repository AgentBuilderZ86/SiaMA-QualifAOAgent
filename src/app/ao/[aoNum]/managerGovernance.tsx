import { AO_STATUSES, type AoRecord } from "@/lib/ao";
import { isPendingReassignment, managerMatchesUser } from "@/lib/managerGovernance";
import { opportunityGovernanceAction, reassignmentDecisionAction } from "../actions";
import { Pill } from "@/components/shell";

function proposalLabel(ao: AoRecord) {
  if (!ao.reassignmentStatus) return "Aucune proposition ouverte";
  return `${ao.reassignmentStatus}${ao.recommendedManager ? ` · ${ao.recommendedManager}` : ""}`;
}

export function ManagerGovernancePanel({ ao, enabled, user }: { ao: AoRecord; enabled: boolean; user: string }) {
  const pending = isPendingReassignment(ao);
  const isRecommendedManager = managerMatchesUser(ao.recommendedManager || "", user);

  return (
    <section className="card section" id="pilotage-manager">
      <div className="section-header">
        <div>
          <p className="eyebrow">Pilotage manager</p>
          <h2>Statut &amp; réaffectation</h2>
        </div>
        <Pill status={ao.statut} />
      </div>

      {!enabled ? (
        <div className="alert" style={{ marginBottom: 16 }}>
          Gouvernance manager désactivée : configurez Google Sheets pour enregistrer les décisions.
        </div>
      ) : null}

      <form action={opportunityGovernanceAction} className="form-grid">
        <input type="hidden" name="aoNum" value={ao.aoNum} />
        <div className="info-grid">
          <div className="field">
            <label htmlFor="status">Nouveau statut</label>
            <select id="status" name="status" defaultValue={ao.statut} disabled={!enabled}>
              {AO_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="recommendedManager">Manager recommandé</label>
            <input
              id="recommendedManager"
              name="recommendedManager"
              defaultValue={ao.recommendedManager || ""}
              placeholder={ao.manager || "Nom du manager"}
              disabled={!enabled}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="justification">Justification manager</label>
          <textarea
            id="justification"
            name="justification"
            rows={4}
            minLength={8}
            required
            placeholder="Pourquoi ce statut ou cette réaffectation est pertinent ?"
            disabled={!enabled}
          />
        </div>
        <div className="actions-grid">
          <button className="btn btn--accent" type="submit" disabled={!enabled}>
            Enregistrer la décision
          </button>
          <span className="muted" style={{ alignSelf: "center" }}>
            La justification enrichit Feedback_Règles.
          </span>
        </div>
      </form>

      <div className="governance-status">
        <div>
          <span>Manager actuel</span>
          <strong>{ao.manager || "Non assigné"}</strong>
        </div>
        <div>
          <span>Proposition</span>
          <strong>{proposalLabel(ao)}</strong>
        </div>
        <div>
          <span>Dernière justification</span>
          <strong>{ao.statusJustification || ao.reassignmentJustification || "Non renseignée"}</strong>
        </div>
      </div>

      {pending ? (
        <div className="reassignment-review">
          <div>
            <p className="eyebrow">Validation requise</p>
            <h3>{ao.recommendedManager} doit statuer sur la pertinence</h3>
            <p className="muted">
              Proposé par {ao.reassignmentProposedBy || "un manager"} depuis {ao.manager || "Non assigné"}.
              {isRecommendedManager ? " Vous êtes identifié comme manager recommandé." : ""}
            </p>
          </div>
          <form action={reassignmentDecisionAction} className="form-grid">
            <input type="hidden" name="aoNum" value={ao.aoNum} />
            <div className="field">
              <label htmlFor="reassignmentJustification">Motif de décision</label>
              <textarea
                id="reassignmentJustification"
                name="justification"
                rows={3}
                minLength={8}
                required
                placeholder="Confirmez l'adéquation ou expliquez le refus."
                disabled={!enabled}
              />
            </div>
            <div className="actions-grid">
              <button className="btn btn--accent" name="decision" value="accept" type="submit" disabled={!enabled}>
                Accepter la réaffectation
              </button>
              <button className="btn btn--ghost" name="decision" value="reject" type="submit" disabled={!enabled}>
                Refuser
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
