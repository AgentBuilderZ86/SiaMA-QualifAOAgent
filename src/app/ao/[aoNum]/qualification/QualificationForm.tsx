"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

type ApiQualificationResponse =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export function QualificationForm({
  aoNum,
  hasSourceUrl,
  initialError = ""
}: {
  aoNum: string;
  hasSourceUrl: boolean;
  initialError?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("aoNum", aoNum);

    try {
      const response = await fetch(`/api/ao/${encodeURIComponent(aoNum)}/qualification`, {
        method: "POST",
        body: formData,
        credentials: "include"
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const hint =
          response.status === 504 || response.status === 502
            ? "Le traitement a dépassé le délai serveur (ZIP volumineux ou OCR). Réessayez sans enrichissement web ou avec des fichiers séparés."
            : `Réponse serveur inattendue (HTTP ${response.status}).`;
        setError(hint);
        return;
      }

      const payload = (await response.json()) as ApiQualificationResponse;
      if (!payload.ok) {
        setError(payload.error || "Échec de la génération.");
        return;
      }

      router.replace(payload.redirectTo);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card section form-grid qualification-form">
      <input type="hidden" name="aoNum" value={aoNum} />

      {error ? (
        <div className="alert" role="alert">
          {error}
        </div>
      ) : null}

      <div className="qualification-progress" role="status" aria-live="polite">
        {pending ? (
          <>
            <strong>Génération en cours…</strong>
            <span>Extraction documents → OCR si nécessaire → analyse IA → enregistrement. Ne fermez pas l’onglet.</span>
          </>
        ) : (
          <>
            <strong>Dossier documentaire AO</strong>
            <span>Déposez l’avis, le CPS et le RC, ou un ZIP complet. Sur ZIP : extraction rapide + OCR limité (priorité avis/CPS/RC).</span>
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
            <span className="muted t-meta">BPU, acte d’engagement, annexes, zip complet (max 25 Mo).</span>
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
            placeholder="Collez ici un extrait fiable si l’OCR ne suffit pas."
          />
        </div>

        <div className="field">
          <label>
            <input name="forceDocumentExtraction" type="checkbox" value="yes" defaultChecked /> Régénérer la fiche depuis les documents transmis ou importés
          </label>
        </div>
        <div className="field">
          <label>
            <input name="enrichWeb" type="checkbox" value="yes" /> Enrichir avec recherche web sourcée (plus lent, décoché par défaut)
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
