"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { QualificationDocumentKind } from "@/lib/aoTypes";
import type { DocumentInput, QualificationV2Body } from "@/lib/aoQualificationServiceV2";

// ─── Types ───────────────────────────────────────────────────────────────────

type DocKind = QualificationDocumentKind;

type DocZone = {
  kind: DocKind;
  label: string;
  fieldName: string;
};

type DocState = {
  file: File | null;
  extracting: boolean;
  text: string;
  warning: string;
  ocrUsed: boolean;
  extractionMode: string;
  expanded: boolean;
};

type ApiExtractResponse = {
  text: string;
  warning: string;
  kind?: string;
  ocrUsed?: boolean;
  extractionMode?: string;
};

type ApiQualResponse =
  | { ok: true; redirectTo: string; goNoGoScore?: number; recommendation?: string }
  | { ok: false; error: string };

// ─── Constants ───────────────────────────────────────────────────────────────

const DOC_ZONES: DocZone[] = [
  { kind: "Avis", label: "Avis d'appel d'offres", fieldName: "documentAvis" },
  { kind: "CPS", label: "CPS / Cahier des prescriptions spéciales", fieldName: "documentCps" },
  { kind: "RC", label: "RC / Règlement de consultation", fieldName: "documentRc" },
  { kind: "Autre", label: "Autres pièces / annexes", fieldName: "documentAutres" }
];

const QUAL_QUESTIONS: Array<[string, string]> = [
  ["contexte", "Contexte métier et enjeux stratégiques"],
  ["perimetre", "Périmètre exact, activités et livrables"],
  ["profils", "Profils requis et expertises spécifiques"],
  ["concurrence", "Concurrence probable"],
  ["relation", "Relation client et track record"],
  ["budget", "Budget indiqué ou estimé"],
  ["chances", "Probabilité de gain argumentée"],
  ["risques", "Risques et points de vigilance"]
];

const ANALYSIS_STAGES = [
  "Analyse des documents…",
  "Recommandation GO/NO GO…",
  "Génération fiche intelligente…",
  "Enregistrement…"
] as const;
const STAGE_DURATIONS_MS = [3_000, 8_000, 30_000, 4_000];
const TOTAL_DURATION_MS = STAGE_DURATIONS_MS.reduce((s, d) => s + d, 0);

function stagePercent(index: number) {
  const cumulative = STAGE_DURATIONS_MS.slice(0, index).reduce((s, d) => s + d, 0);
  return Math.round((cumulative / TOTAL_DURATION_MS) * 100);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(doc: DocState): { label: string; color: "green" | "orange" | "red" | "gray" } {
  if (doc.extracting) return { label: "Extraction en cours…", color: "gray" };
  if (!doc.text && !doc.file) return { label: "Aucun document", color: "gray" };
  if (!doc.text && doc.file) {
    return { label: "⚠ Texte non extrait — collez ci-dessous", color: "orange" };
  }
  if (doc.ocrUsed) {
    return { label: `✓ OCR appliqué — ${doc.text.length.toLocaleString()} car.`, color: "orange" };
  }
  return { label: `✓ ${doc.text.length.toLocaleString()} car. extraits`, color: "green" };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function QualificationV2Form({
  aoNum
}: {
  aoNum: string;
  hasSourceUrl: boolean;
}) {
  const router = useRouter();
  const [docs, setDocs] = useState<Record<DocKind, DocState>>({
    Avis: { file: null, extracting: false, text: "", warning: "", ocrUsed: false, extractionMode: "", expanded: false },
    CPS: { file: null, extracting: false, text: "", warning: "", ocrUsed: false, extractionMode: "", expanded: false },
    RC: { file: null, extracting: false, text: "", warning: "", ocrUsed: false, extractionMode: "", expanded: false },
    Autre: { file: null, extracting: false, text: "", warning: "", ocrUsed: false, extractionMode: "", expanded: false }
  });
  const [manualExtract, setManualExtract] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [enrichWeb, setEnrichWeb] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const stageTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Extraction ──

  async function extractFile(kind: DocKind, file: File, fieldName: string) {
    setDocs((prev) => ({ ...prev, [kind]: { ...prev[kind], file, extracting: true, text: "", warning: "" } }));

    const fd = new FormData();
    fd.append("document", file);
    fd.set("fieldName", fieldName);

    try {
      const res = await fetch(`/api/ao/${encodeURIComponent(aoNum)}/qual-extract`, {
        method: "POST",
        body: fd,
        credentials: "include"
      });
      const data: ApiExtractResponse = await res.json();
      setDocs((prev) => ({
        ...prev,
        [kind]: {
          ...prev[kind],
          file,
          extracting: false,
          text: data.text,
          warning: data.warning,
          ocrUsed: data.ocrUsed ?? false,
          extractionMode: data.extractionMode ?? "native",
          expanded: Boolean(data.text)
        }
      }));
    } catch {
      setDocs((prev) => ({
        ...prev,
        [kind]: { ...prev[kind], extracting: false, warning: "Erreur réseau lors de l'extraction." }
      }));
    }
  }

  function handleFileChange(zone: DocZone, file: File | null) {
    if (!file) {
      setDocs((prev) => ({
        ...prev,
        [zone.kind]: { file: null, extracting: false, text: "", warning: "", ocrUsed: false, extractionMode: "", expanded: false }
      }));
      return;
    }
    void extractFile(zone.kind, file, zone.fieldName);
  }

  // ── Progress ──

  function startProgress() {
    stageTimers.current.forEach(clearTimeout);
    stageTimers.current = [];
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);

    setStageIndex(0);
    setElapsed(0);
    const startTime = Date.now();
    elapsedTimer.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1_000);

    let cumulative = 0;
    for (let i = 0; i < ANALYSIS_STAGES.length - 1; i++) {
      cumulative += STAGE_DURATIONS_MS[i] ?? 3_000;
      const capture = i + 1;
      stageTimers.current.push(setTimeout(() => setStageIndex(capture), cumulative));
    }
  }

  function stopProgress() {
    stageTimers.current.forEach(clearTimeout);
    stageTimers.current = [];
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    elapsedTimer.current = null;
  }

  // ── Submit ──

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const activeDocuments: DocumentInput[] = Object.values(docs)
      .filter((d) => d.text.trim() || d.file)
      .map((d) => {
        const zone = DOC_ZONES.find(
          (z) =>
            z.kind === (Object.entries(docs).find(([, v]) => v === d)?.[0] as DocKind)
        );
        return {
          name: d.file?.name ?? "",
          kind: (zone?.kind ?? "Autre") as DocKind,
          text: d.text,
          warning: d.warning || undefined,
          ocrUsed: d.ocrUsed,
          extractionMode: d.extractionMode as DocumentInput["extractionMode"] | undefined
        };
      });

    if (!activeDocuments.some((d) => d.text.trim()) && !manualExtract.trim()) {
      setError("Ajoutez au moins un document ou collez un extrait manuel avant de générer la fiche.");
      return;
    }

    setError("");
    setAnalyzing(true);
    startProgress();

    const body: QualificationV2Body = {
      documents: activeDocuments,
      manualExtract: manualExtract || undefined,
      enrichWeb,
      fields: Object.keys(fields).length ? fields : undefined
    };

    try {
      const res = await fetch(`/api/ao/${encodeURIComponent(aoNum)}/qualification-v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include"
      });

      const contentType = res.headers.get("content-type") || "";
      let data: ApiQualResponse;

      if (!contentType.includes("application/json")) {
        data = {
          ok: false,
          error:
            res.status === 504 || res.status === 502
              ? "Délai serveur dépassé (~60 s). Réessayez — l'analyse IA seule reprend sans re-uploader."
              : `Réponse serveur inattendue (HTTP ${res.status}).`
        };
      } else {
        data = (await res.json()) as ApiQualResponse;
      }

      stopProgress();
      setAnalyzing(false);

      if (!data.ok) {
        setError(data.error);
        return;
      }

      router.replace(data.redirectTo);
      router.refresh();
    } catch (cause) {
      stopProgress();
      setAnalyzing(false);
      setError(
        cause instanceof Error
          ? cause.message
          : "Impossible de joindre le serveur. Vérifiez votre connexion."
      );
    }
  }

  const anyExtracting = Object.values(docs).some((d) => d.extracting);
  const currentStage = ANALYSIS_STAGES[stageIndex] ?? ANALYSIS_STAGES[0];
  const percent = stagePercent(stageIndex);

  return (
    <form onSubmit={handleSubmit} className="card section form-grid qualification-form">
      {/* ── Progress / Status ── */}
      <div className="qualification-progress" role="status" aria-live="polite">
        {analyzing ? (
          <>
            <strong>Analyse IA en cours… {elapsed > 0 ? `(${elapsed} s)` : ""}</strong>
            <span>{currentStage} Ne fermez pas l'onglet.</span>
            <progress value={percent} max={100} style={{ width: "100%", marginTop: 6, height: 6 }} />
          </>
        ) : (
          <>
            <strong>Qualification V2 — Extraction séparée par document</strong>
            <span>
              Chargez vos fichiers : chaque document est extrait individuellement (&lt; 20 s), puis la fiche IA est générée
              en un seul appel optimisé (≈ 45 s). Aucun timeout possible.
            </span>
          </>
        )}
      </div>

      {/* ── Error ── */}
      {error ? (
        <div className="alert" role="alert">
          {error}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn btn--ghost" onClick={() => setError("")}>
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Document Zones ── */}
      <fieldset disabled={analyzing} className="qualification-fieldset">
        <div className="document-upload-grid">
          {DOC_ZONES.map((zone) => {
            const doc = docs[zone.kind];
            const badge = statusBadge(doc);
            return (
              <div className="field document-upload-card" key={zone.kind}>
                <label htmlFor={`file-${zone.kind}`} style={{ fontWeight: 600 }}>
                  {zone.label}
                </label>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <input
                    id={`file-${zone.kind}`}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.zip,.png,.jpg,.jpeg,.tif,.tiff"
                    style={{ flex: 1, minWidth: 0 }}
                    onChange={(e) => handleFileChange(zone, e.target.files?.[0] ?? null)}
                    disabled={doc.extracting}
                  />
                  {doc.extracting ? (
                    <span className="muted t-meta">⟳ Extraction…</span>
                  ) : null}
                </div>

                {/* Status badge */}
                <span
                  className="muted t-meta"
                  style={{
                    color:
                      badge.color === "green"
                        ? "var(--color-success, #16a34a)"
                        : badge.color === "orange"
                          ? "var(--color-warning, #d97706)"
                          : badge.color === "red"
                            ? "var(--color-error, #dc2626)"
                            : undefined
                  }}
                >
                  {badge.label}
                </span>

                {/* Extracted text preview + editor */}
                {(doc.file || doc.text) ? (
                  <div>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ fontSize: "0.75rem", padding: "2px 8px", marginBottom: 4 }}
                      onClick={() =>
                        setDocs((prev) => ({
                          ...prev,
                          [zone.kind]: { ...prev[zone.kind], expanded: !prev[zone.kind].expanded }
                        }))
                      }
                    >
                      {doc.expanded ? "▲ Masquer le texte" : "▼ Voir / modifier le texte"}
                    </button>
                    {doc.expanded ? (
                      <textarea
                        value={doc.text}
                        onChange={(e) =>
                          setDocs((prev) => ({
                            ...prev,
                            [zone.kind]: { ...prev[zone.kind], text: e.target.value }
                          }))
                        }
                        rows={6}
                        placeholder={
                          doc.warning?.includes("scanné") || doc.warning?.includes("lisible")
                            ? "PDF scanné — collez ici le texte clé (objet, périmètre, budget, critères)…"
                            : "Texte extrait — vous pouvez le corriger ou le compléter."
                        }
                        style={{ width: "100%", fontFamily: "monospace", fontSize: "0.8rem" }}
                      />
                    ) : null}
                    {doc.warning ? (
                      <p className="muted t-meta" style={{ color: "var(--color-warning, #d97706)", marginTop: 2 }}>
                        {doc.warning}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* ── Manual Extract ── */}
        <div className="field">
          <label htmlFor="manualExtract">
            Extrait manuel (si document scanné non lisible ou fichier &gt; 5 Mo)
          </label>
          <textarea
            id="manualExtract"
            rows={5}
            value={manualExtract}
            onChange={(e) => setManualExtract(e.target.value)}
            placeholder="Collez ici les sections clés : objet, périmètre, budget, critères de sélection, profils requis…"
          />
        </div>

        {/* ── Qualification Questions ── */}
        {QUAL_QUESTIONS.map(([name, label]) => (
          <div className="field" key={name}>
            <label htmlFor={`q-${name}`}>{label}</label>
            <textarea
              id={`q-${name}`}
              rows={2}
              value={fields[name] ?? ""}
              onChange={(e) => setFields((prev) => ({ ...prev, [name]: e.target.value }))}
              placeholder="À confirmer (optionnel — complète l'extraction automatique)"
            />
          </div>
        ))}

        {/* ── Options ── */}
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={enrichWeb}
              onChange={(e) => setEnrichWeb(e.target.checked)}
            />{" "}
            Enrichir avec recherche web sourcée (plus lent, décoché par défaut)
          </label>
        </div>
      </fieldset>

      {/* ── Submit ── */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="btn btn--accent"
          type="submit"
          disabled={analyzing || anyExtracting}
        >
          {analyzing
            ? "Génération en cours…"
            : anyExtracting
              ? "Extraction en cours — patientez…"
              : "Générer la fiche intelligente et le deck PowerPoint"}
        </button>
        {anyExtracting ? (
          <span className="muted t-meta">
            ⟳ {Object.values(docs).filter((d) => d.extracting).length} document(s) en cours d'extraction…
          </span>
        ) : null}
      </div>
    </form>
  );
}
