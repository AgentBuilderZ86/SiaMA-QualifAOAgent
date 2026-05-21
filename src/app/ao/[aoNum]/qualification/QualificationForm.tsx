"use client";

import { useActionState } from "react";
import { qualificationAction, type QualificationActionState } from "../../actions";

const questions = [
  ["contexte", "Contexte métier et enjeux stratégiques"],
  ["perimetre", "Périmètre exact, activités et livrables"],
  ["profils", "Profils requis et expertises spécifiques"],
  ["concurrence", "Concurrence probable"],
  ["relation", "Relation client et track record"],
  ["budget", "Budget indiqué ou estimé"],
  ["chances", "Probabilité de gain argumentée"],
  ["risques", "Risques et points de vigilance"]
] as const;

const documentFields = [
  ["documentAvis", "Avis d'appel d'offres", "avis.pdf"],
  ["documentCps", "CPS / cahier des prescriptions spéciales", "cps.pdf"],
  ["documentRc", "RC / règlement de consultation", "rc.pdf"]
] as const;

const initialState: QualificationActionState = { error: "" };

export function QualificationForm({ aoNum, hasSourceUrl }: { aoNum: string; hasSourceUrl: boolean }) {
  const [state, formAction, pending] = useActionState(qualificationAction, initialState);

  return (
    <form action={formAction} className="card section form-grid qualification-form">
      <input type="hidden" name="aoNum" value={aoNum} />

      {state.error ? (
        <div className="alert" role="alert">
          {state.error}
        </div>
      ) : null}

      <div className="qualification-progress" role="status" aria-live="polite">
        {pending ? (
          <>
            <strong>Génération en cours…</strong>
            <span>Extraction documents → OCR si nécessaire → analyse IA → enregistrement Google Sheets.</span>
          </>
        ) : (
          <>
            <strong>Dossier documentaire AO</strong>
            <span>Déposez au minimum l’avis, le CPS et le RC. Les PDF scannés déclenchent le fallback OCR configuré.</span>
          </>
        )}
      </div>

      <fieldset disabled={pending} className="qualification-fieldset">
        <div className="document-upload-grid">
          {documentFields.map(([name, label, placeholder]) => (
            <div className="field document-upload-card" key={name}>
              <label htmlFor={name}>{label}</label>
              <input id={name} name={name} type="file" accept=".pdf,.doc,.docx,.txt,.zip,.png,.jpg,.jpeg,.tif,.tiff" />
              <span className="muted t-meta">Ex. {placeholder}</span>
            </div>
          ))}
          <div className="field document-upload-card">
            <label htmlFor="documentAutres">Autres pièces / annexes</label>
            <input
              id="documentAutres"
              name="documentAutres"
              type="file"
              accept=".pdf,.doc,.docx,.txt,.zip,.png,.jpg,.jpeg,.tif,.tiff"
              multiple
            />
            <span className="muted t-meta">BPU, acte d’engagement, annexes, zip complet.</span>
          </div>
        </div>

        {hasSourceUrl ? (
          <div className="field">
            <label>
              <input name="includeSourceDocuments" type="checkbox" value="yes" defaultChecked /> Importer aussi les documents détectés depuis la source AO si le cache les contient
            </label>
          </div>
        ) : null}

        {questions.map(([name, label]) => (
          <div className="field" key={name}>
            <label htmlFor={name}>{label}</label>
            <textarea id={name} name={name} rows={3} placeholder="À confirmer" />
          </div>
        ))}

        <div className="field">
          <label htmlFor="documentExtract">Extrait manuel si document scanné non lisible</label>
          <textarea
            id="documentExtract"
            name="documentExtract"
            rows={5}
            placeholder="Collez ici un extrait fiable si l’OCR n’est pas encore configuré ou si la pièce est trop dégradée."
          />
        </div>

        <div className="field">
          <label>
            <input name="forceDocumentExtraction" type="checkbox" value="yes" defaultChecked /> Régénérer la fiche depuis les documents transmis ou importés
          </label>
        </div>
        <div className="field">
          <label>
            <input name="enrichWeb" type="checkbox" value="yes" defaultChecked /> Enrichir avec recherche web sourcée client / secteur / concurrents
          </label>
        </div>
      </fieldset>

      <div>
        <button className="btn btn--accent" type="submit" disabled={pending}>
          {pending ? "Génération en cours…" : "Générer la fiche intelligente et le deck PowerPoint"}
        </button>
      </div>
    </form>
  );
}
