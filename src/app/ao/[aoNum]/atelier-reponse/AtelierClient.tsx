"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { atelierChatAction, atelierCommitAction } from "../../actions";
import type { AtelierCommitPayload, AtelierLastDraft } from "@/lib/atelierStrategie";

type Msg = { role: "user" | "assistant"; content: string; at: string };

function sectionsToLines(sections?: string[]) {
  return sections?.length ? sections.join("\n") : "";
}

function linesToSections(text: string): string[] | undefined {
  const lines = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.length ? lines : undefined;
}

export function AtelierClient({
  aoNum,
  aoHref,
  initialMessages,
  initialDraft,
  llmConfigured
}: {
  aoNum: string;
  aoHref: string;
  initialMessages: Msg[];
  initialDraft?: AtelierLastDraft;
  llmConfigured: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState<string | null>(null);
  const [chatPending, startChat] = useTransition();
  const [commitPending, startCommit] = useTransition();

  const [budget, setBudget] = useState(initialDraft?.budgetTtcPropose ?? "");
  const [strategie, setStrategie] = useState(initialDraft?.strategieResume ?? "");
  const [equipe, setEquipe] = useState(initialDraft?.equipeChiffrageNarratif ?? "");
  const [sectionsText, setSectionsText] = useState(sectionsToLines(initialDraft?.sectionsPropaleCibles));
  const [recommandation, setRecommandation] = useState("");
  const [appendNote, setAppendNote] = useState("");

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  function mergeDraftFromChat(d?: AtelierLastDraft) {
    if (!d) return;
    if (d.budgetTtcPropose?.trim()) setBudget(d.budgetTtcPropose);
    if (d.strategieResume?.trim()) setStrategie(d.strategieResume);
    if (d.equipeChiffrageNarratif?.trim()) setEquipe(d.equipeChiffrageNarratif);
    if (d.sectionsPropaleCibles?.length) setSectionsText(sectionsToLines(d.sectionsPropaleCibles));
  }

  function send() {
    const text = input.trim();
    if (!text || !llmConfigured) return;
    setInput("");
    setError(null);
    setCommitMsg(null);
    startChat(async () => {
      const res = await atelierChatAction(aoNum, text);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessages(res.messages);
      mergeDraftFromChat(res.lastDraft);
    });
  }

  function commit() {
    setError(null);
    setCommitMsg(null);
    const hasSomething =
      Boolean(budget.trim()) ||
      Boolean(strategie.trim()) ||
      Boolean(equipe.trim()) ||
      Boolean(sectionsText.trim().split("\n").some((s) => s.trim())) ||
      Boolean(recommandation.trim()) ||
      Boolean(appendNote.trim());
    if (!hasSomething) {
      setError("Renseignez au moins un champ à enregistrer sur l’opportunité.");
      return;
    }
    startCommit(async () => {
      const payload: AtelierCommitPayload = {
        budgetTtcPropose: budget.trim() || undefined,
        strategieResume: strategie.trim() || undefined,
        equipeChiffrageNarratif: equipe.trim() || undefined,
        sectionsPropaleCibles: linesToSections(sectionsText),
        recommandation: recommandation.trim() || undefined,
        appendNote: appendNote.trim() || undefined
      };
      const res = await atelierCommitAction(aoNum, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCommitMsg("Modifications enregistrées dans Google Sheets (pipeline).");
      setAppendNote("");
    });
  }

  return (
    <div className="grid two-col" style={{ alignItems: "start" }}>
      <section className="card section" style={{ display: "flex", flexDirection: "column", minHeight: 420 }}>
        <h2 style={{ marginTop: 0 }}>Conversation</h2>
        {!llmConfigured ? (
          <div className="alert" role="status">
            Aucun fournisseur LLM configuré (variables <code>ANTHROPIC_API_KEY</code> ou <code>OPENAI_API_KEY</code> /{" "}
            <code>LLM_API_KEY</code>). Le chat reste désactivé.
          </div>
        ) : null}
        {error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : null}
        {commitMsg ? (
          <div className="alert" style={{ borderColor: "var(--sia-green)" }} role="status">
            {commitMsg}{" "}
            <Link href={`/ao/${aoHref}`} className="btn btn--ghost btn--xs" style={{ marginLeft: 8 }}>
              Voir l’AO
            </Link>
          </div>
        ) : null}
        <div
          className="convo"
          style={{
            flex: 1,
            maxHeight: "min(52vh, 520px)",
            overflow: "auto",
            border: "1px solid var(--line-1)",
            borderRadius: "var(--r-2)",
            padding: 12,
            background: "var(--surface-1)"
          }}
        >
          {messages.length === 0 ? <p className="muted t-meta">Premier échange : décrivez votre enjeu ou demandez une structure de réponse.</p> : null}
          {messages.map((m, i) => (
            <div key={`${m.at}-${i}`} className={m.role === "user" ? "turn user" : "turn"} style={{ marginBottom: 12 }}>
              <div className="bubble" style={{ whiteSpace: "pre-wrap" }}>
                <span className="t-meta muted">{m.role === "user" ? "Vous" : "Assistant"} · {m.at}</span>
                <div style={{ marginTop: 6 }}>{m.content}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexDirection: "column" }}>
          <textarea
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Votre message…"
            disabled={!llmConfigured || chatPending}
            aria-label="Message pour l’atelier"
          />
          <div>
            <button type="button" className="btn btn--accent" disabled={!llmConfigured || chatPending} onClick={send}>
              {chatPending ? "Envoi…" : "Envoyer au LLM"}
            </button>
          </div>
        </div>
      </section>

      <section className="card section">
        <h2 style={{ marginTop: 0 }}>Brouillon à valider</h2>
        <p className="muted t-meta" style={{ marginBottom: 12 }}>
          Ajustez les champs avant enregistrement : ils seront écrits dans la ligne Pipeline (Budget, Simulation financière, Notes,
          Recommandation, colonne Atelier stratégie).
        </p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="atelier-budget">Budget cible TTC (chiffres)</label>
            <input id="atelier-budget" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="ex. 2 500 000 DH" />
          </div>
          <div className="field">
            <label htmlFor="atelier-strat">Stratégie de réponse (résumé)</label>
            <textarea id="atelier-strat" rows={5} value={strategie} onChange={(e) => setStrategie(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="atelier-equipe">Équipe / chiffrage (narratif)</label>
            <textarea id="atelier-equipe" rows={5} value={equipe} onChange={(e) => setEquipe(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="atelier-sections">Sections propale ciblées (une par ligne)</label>
            <textarea id="atelier-sections" rows={3} value={sectionsText} onChange={(e) => setSectionsText(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="atelier-reco">Recommandation (colonne dédiée, optionnel)</label>
            <textarea id="atelier-reco" rows={2} value={recommandation} onChange={(e) => setRecommandation(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="atelier-note">Note à ajouter (optionnel)</label>
            <textarea id="atelier-note" rows={2} value={appendNote} onChange={(e) => setAppendNote(e.target.value)} placeholder="Contexte interne, décision, prochaine étape…" />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button type="button" className="btn btn--primary" disabled={commitPending} onClick={commit}>
            {commitPending ? "Enregistrement…" : "Valider et enregistrer sur l’opportunité"}
          </button>
        </div>
      </section>
    </div>
  );
}
