"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  | { ok: true; nextStage: "analyze" }
  | { ok: false; error: string };

const PIPELINE_STAGES = [
  "Extraction des documents…",
  "OCR si nécessaire…",
  "Analyse IA (recommandation)…",
  "Analyse IA (fiche intelligente)…",
  "Enregistrement…",
] as const;

// Durées estimées par étape (ms) — sert à positionner la barre de progression
const STAGE_DURATIONS_MS = [4_000, 20_000, 10_000, 30_000, 4_000];
const TOTAL_DURATION_MS = STAGE_DURATIONS_MS.reduce((s, d) => s + d, 0);

function stageCumulativeMs(index: number) {
  return STAGE_DURATIONS_MS.slice(0, index).reduce((s, d) => s + d, 0);
}

function stageProgressPercent(index: number) {
  return Math.round((stageCumulativeMs(index) / TOTAL_DURATION_MS) * 100);
}

function useProgressState(pending: boolean, startIndex = 0) {
  const [stageIndex, setStageIndex] = useState(startIndex);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!pending) {
      setStageIndex(startIndex);
      setElapsed(0);
      return;
    }

    const startTime = Date.now();
    const elapsedTimer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1_000);

    const stageTimers: ReturnType<typeof setTimeout>[] = [];
    let cumulativeMs = 0;
    for (let i = startIndex; i < PIPELINE_STAGES.length - 1; i++) {
      cumulativeMs += STAGE_DURATIONS_MS[i] ?? 4_000;
      const capture = i + 1;
      stageTimers.push(setTimeout(() => setStageIndex(capture), cumulativeMs));
    }

    return () => {
      clearInterval(elapsedTimer);
      stageTimers.forEach(clearTimeout);
    };
  }, [pending, startIndex]);

  return {
    stage: pending ? (PIPELINE_STAGES[stageIndex] ?? PIPELINE_STAGES[0]) : null,
    percent: stageProgressPercent(stageIndex),
    elapsed,
  };
}

function errorKind(msg: string): "timeout" | "auth" | "empty" | "generic" {
  if (msg.includes("Délai serveur") || msg.includes("timeout") || msg.includes("504") || msg.includes("502")) return "timeout";
  if (msg.includes("session") || msg.includes("connexion") || msg.includes("401")) return "auth";
  if (msg.includes("Ajoutez au moins un document") || msg.includes("corpus")) return "empty";
  return "generic";
}

async function callQualificationApi(aoNum: string, body: FormData): Promise<ApiQualificationResponse> {
  const response = await fetch(`/api/ao/${encodeURIComponent(aoNum)}/qualification`, {
    method: "POST",
    body,
    credentials: "include"
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    if (response.status === 504 || response.status === 502) {
      return {
        ok: false,
        error: "Délai serveur Netlify dépassé (~60 s). L'extraction documentaire a été sauvegardée. Utilisez « Relancer l'analyse IA » pour compléter sans re-uploader vos documents."
      };
    }
    if (response.status === 500 || response.status === 413) {
      return {
        ok: false,
        error: "Erreur serveur (HTTP " + response.status + "). Si vous avez uploadé un fichier volumineux (> 5 Mo), le serveur ne peut pas le traiter directement. Utilisez le champ « Extrait manuel » pour coller les sections clés du document (objet, périmètre, budget, critères)."
      };
    }
    return { ok: false, error: `Réponse serveur inattendue (HTTP ${response.status}).` };
  }

  return response.json() as Promise<ApiQualificationResponse>;
}

const NETLIFY_FILE_LIMIT_BYTES = 5 * 1024 * 1024; // 5 Mo — limite conservative (Netlify cap ~6 Mo)

function checkFileSizeWarning(formData: FormData): string {
  const fields = ["documentAvis", "documentCps", "documentRc", "documentAutres", "document"];
  const oversized: string[] = [];
  let total = 0;
  for (const field of fields) {
    for (const entry of formData.getAll(field)) {
      if (entry instanceof File && entry.size > 0) {
        total += entry.size;
        if (entry.size > NETLIFY_FILE_LIMIT_BYTES) {
          oversized.push(`${entry.name} (${Math.round(entry.size / (1024 * 1024) * 10) / 10} Mo)`);
        }
      }
    }
  }
  if (oversized.length) {
    return `Fichier(s) trop volumineux pour le serveur (limite ~5 Mo par fichier) : ${oversized.join(", ")}. Collez les sections clés dans « Extrait manuel » à la place.`;
  }
  if (total > NETLIFY_FILE_LIMIT_BYTES * 2) {
    return `Volume total des fichiers trop élevé (${Math.round(total / (1024 * 1024))} Mo, limite ~10 Mo). Réduisez le nombre de pièces ou utilisez l'extrait manuel.`;
  }
  return "";
}

export function QualificationForm({
  aoNum,
  hasSourceUrl,
  initialError = "",
  resumeAI = false
}: {
  aoNum: string;
  hasSourceUrl: boolean;
  initialError?: string;
  resumeAI?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);
  const [partialSave, setPartialSave] = useState(false);
  const [analyzePhase, setAnalyzePhase] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { stage: currentStage, percent, elapsed } = useProgressState(pending, analyzePhase ? 2 : 0);

  // Nettoie ?qualError= et ?resumeAI= de l'URL dès l'affichage (URL propre)
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("qualError") || url.searchParams.has("resumeAI")) {
      url.searchParams.delete("qualError");
      url.searchParams.delete("resumeAI");
      router.replace(url.pathname + (url.search || ""), { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // En mode resumeAI, déclenche directement l'étape analyze (sans re-extraire les fichiers)
  const hasAutoSubmitted = useRef(false);
  useEffect(() => {
    if (!resumeAI || hasAutoSubmitted.current) return;
    hasAutoSubmitted.current = true;
    void runAnalyzeOnly();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeAI]);

  async function runAnalyzeOnly() {
    setPending(true);
    setError("");
    setPartialSave(false);
    setAnalyzePhase(true);
    const d = new FormData();
    d.set("aoNum", aoNum);
    d.set("pipelineStage", "analyze");
    const result = await callQualificationApi(aoNum, d);
    setPending(false);
    if (!result.ok) { setError(result.error); return; }
    if ("redirectTo" in result) { router.replace(result.redirectTo); router.refresh(); }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setPartialSave(false);
    setAnalyzePhase(false);

    const formData = new FormData(event.currentTarget);
    formData.set("aoNum", aoNum);
    formData.set("pipelineStage", "extract");

    // Validation taille fichiers avant envoi
    const sizeWarning = checkFileSizeWarning(formData);
    if (sizeWarning) {
      setError(sizeWarning);
      setPending(false);
      return;
    }

    try {
      // Étape 1 : extraction documentaire (~15-25 s)
      const r1 = await callQualificationApi(aoNum, formData);
      if (!r1.ok) {
        // partialSave uniquement si timeout (504/502) — pas pour crash serveur (500)
        setPartialSave(r1.error.includes("Délai serveur") || r1.error.includes("sauvegardée"));
        setError(r1.error);
        setPending(false);
        return;
      }

      if ("nextStage" in r1) {
        // Étape 2 : analyse IA (~35-40 s) — aucun fichier requis
        setAnalyzePhase(true);
        const d2 = new FormData();
        d2.set("aoNum", aoNum);
        d2.set("pipelineStage", "analyze");
        const r2 = await callQualificationApi(aoNum, d2);
        setPending(false);
        if (!r2.ok) {
          // Étape 1 (extraction) a réussi → on peut relancer l'analyse IA seule
          setPartialSave(true);
          setError(r2.error);
          return;
        }
        if ("redirectTo" in r2) { router.replace(r2.redirectTo); router.refresh(); }
        return;
      }

      setPending(false);
      if ("redirectTo" in r1) { router.replace(r1.redirectTo); router.refresh(); }
    } catch (cause) {
      setPending(false);
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez."
      );
    }
  }

  const kind = error ? errorKind(error) : null;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="card section form-grid qualification-form">
      <input type="hidden" name="aoNum" value={aoNum} />

      {error ? (
        <div className="alert" role="alert">
          {partialSave ? <strong>Sauvegarde partielle effectuée. </strong> : null}
          {error}
          {kind === "timeout" ? (
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setError("");
                  setPartialSave(false);
                  void runAnalyzeOnly();
                }}
              >
                Relancer l'analyse IA (documents déjà sauvegardés)
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => { setError(""); setPartialSave(false); }}>
                Réessayer depuis le début
              </button>
            </div>
          ) : kind === "auth" ? (
            <div style={{ marginTop: 8 }}>
              <a href="/login" className="btn btn--ghost">Reconnecter</a>
            </div>
          ) : kind === "generic" ? (
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn--ghost" onClick={() => { setError(""); setPartialSave(false); }}>
                Réessayer
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="qualification-progress" role="status" aria-live="polite">
        {currentStage ? (
          <>
            <strong>
              {analyzePhase ? "Étape 2/2 — Analyse IA…" : "Étape 1/2 — Extraction…"}
              {elapsed > 0 ? ` (${elapsed} s)` : ""}
            </strong>
            <span>{currentStage} Ne fermez pas l'onglet.</span>
            <progress value={percent} max={100} style={{ width: "100%", marginTop: 6, height: 6 }} />
          </>
        ) : (
          <>
            <strong>Dossier documentaire AO</strong>
            <span>Déposez l'avis, le CPS et le RC, ou un ZIP complet. Sur ZIP : extraction rapide + OCR limité (priorité avis/CPS/RC).</span>
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
            <span className="muted t-meta">BPU, acte d'engagement, annexes, zip complet (max 25 Mo).</span>
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
            placeholder="Collez ici un extrait fiable si l'OCR ne suffit pas."
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
