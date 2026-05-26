import type {
  AoRecord,
  IntelligentQualificationFiche,
  QualificationCalendarEntry,
  QualificationFiche,
  QualificationKeyQuestion,
  QualificationResponseDocument,
  QualificationResponseSection,
  QualificationSignal
} from "@/lib/aoTypes";
import type { PatternHit, PatternScoreResult } from "@/lib/qualification/patterns";

function asIntelligence(fiche: Partial<QualificationFiche> | null): IntelligentQualificationFiche | null {
  return fiche?.intelligence ?? null;
}

function shortText(value: unknown, max = 260) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "À confirmer";
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

function avatarInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() || "")
    .slice(0, 2)
    .join("") || "M";
}

function decisionToneClass(rec: string, patternTone: PatternScoreResult["decisionTone"] | undefined) {
  if (patternTone) return `tone-${patternTone}`;
  if (rec === "GO") return "tone-go";
  if (rec === "NO GO") return "tone-nogo";
  return "tone-watch";
}

function decisionIcon(rec: string, patternTone: PatternScoreResult["decisionTone"] | undefined) {
  const tone = patternTone || (rec === "GO" ? "go" : rec === "NO GO" ? "nogo" : "watch");
  if (tone === "go") return "🟢";
  if (tone === "nogo") return "🔴";
  return "🟡";
}

function decisionLabel(intelligence: IntelligentQualificationFiche) {
  if (intelligence.patternScore) return intelligence.patternScore.decisionLabel;
  if (intelligence.recommendation === "GO") return "GO — Répondre fortement recommandé";
  if (intelligence.recommendation === "NO GO") return "NO GO — Ne pas répondre";
  return "WATCH — À confirmer avec le manager";
}

function levelTagClass(level: QualificationKeyQuestion["level"]) {
  if (level === "GO") return "tag tag-go";
  if (level === "WARN") return "tag tag-warn";
  if (level === "GRAY") return "tag tag-gray";
  return "tag tag-blue";
}

function signalImpactClass(impact: QualificationSignal["impact"]) {
  if (impact === "Positif") return "signal-card s-yes";
  if (impact === "Bloquant") return "signal-card s-nogo";
  if (impact === "Attention") return "signal-card s-warn";
  return "signal-card s-ok";
}

function signalIcon(impact: QualificationSignal["impact"]) {
  if (impact === "Positif") return "✅";
  if (impact === "Bloquant") return "🚫";
  if (impact === "Attention") return "⚠️";
  return "ℹ️";
}

function PatternList({ score }: { score: PatternScoreResult }) {
  const items: Array<PatternHit & { tone: "go" | "nogo" | "watch" }> = [
    ...score.activated.map((hit) => ({ ...hit, tone: "go" as const })),
    ...score.blocking.map((hit) => ({ ...hit, tone: "nogo" as const })),
    ...score.watching.map((hit) => ({ ...hit, tone: "watch" as const }))
  ];
  if (!items.length && !score.bonusClient) return null;
  return (
    <div className="pattern-list">
      {items.map((hit) => (
        <div key={`${hit.tone}-${hit.patternId}`} className={`pattern-row tone-${hit.tone}`}>
          <strong>{hit.reason}</strong>
          {hit.score ? <span className="pattern-points">+{hit.score} pts</span> : null}
          {hit.tone === "nogo" ? <span className="pattern-points">Bloquant</span> : null}
          {hit.tone === "watch" ? <span className="pattern-points">À surveiller</span> : null}
          <span className="pattern-meta">
            Mots-clés détectés : {hit.hits.slice(0, 5).join(", ") || "n/a"}
            {hit.manager ? ` · Manager : ${hit.manager}` : ""}
          </span>
        </div>
      ))}
      {score.bonusClient ? (
        <div className="pattern-row tone-go">
          <strong>Bonus client stratégique — {score.bonusClient.client}</strong>
          <span className="pattern-points">+{score.bonusClient.points} pt</span>
          <span className="pattern-meta">Compte clé Sia Maroc — opportunité référence.</span>
        </div>
      ) : null}
    </div>
  );
}

function CalendarList({ entries }: { entries: QualificationCalendarEntry[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {entries.map((entry, index) => (
        <div
          key={`${entry.dayLabel}-${index}`}
          className={`timeline-row${entry.milestone ? ` milestone-${entry.milestone}` : ""}`}
        >
          <div className="t-date">{entry.dayLabel}</div>
          <div className="t-dot" />
          <div className="t-label">{entry.label}</div>
        </div>
      ))}
    </div>
  );
}

function ResponseFormatBlock({
  documents,
  sections
}: {
  documents: QualificationResponseDocument[];
  sections: QualificationResponseSection[];
}) {
  return (
    <>
      <div className="response-grid">
        {documents.map((doc) => (
          <div key={doc.label} className={`response-card${doc.isStarred ? " starred" : ""}`}>
            <div className="r-icon">{doc.format.toUpperCase().includes("PPT") ? "📊" : doc.format.toUpperCase().includes("EXCEL") ? "💰" : doc.format.toUpperCase().includes("PDF") ? "📄" : "🗂️"}</div>
            <div className="r-title">{doc.label}</div>
            <div className="r-detail">{doc.format} · {doc.detail}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, color: "var(--fiche-muted)", marginBottom: 8 }}>
          STRUCTURE ATTENDUE DU DOSSIER TECHNIQUE
        </div>
        <div className="response-sections">
          {sections.map((sec) => (
            <div key={sec.number} className={`response-section-item${sec.isStarred ? " starred" : ""}`}>
              {sec.number}. {sec.isStarred ? "⭐ " : ""}
              {sec.title}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SignalGrid({ signals }: { signals: QualificationSignal[] }) {
  return (
    <div className="signal-grid">
      {signals.slice(0, 9).map((signal) => (
        <div key={`${signal.label}-${signal.impact}`} className={signalImpactClass(signal.impact)}>
          <div className="s-icon">{signalIcon(signal.impact)}</div>
          <div className="s-label">{signal.label}</div>
          <div className="s-value">{shortText(signal.detail, 80)}</div>
          {signal.scoreImpact ? (
            <div style={{ marginTop: 4, fontSize: 11, color: "var(--fiche-muted)" }}>{signal.scoreImpact}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function QualificationIntelligenceView({
  fiche,
  ao,
  deckHref,
  htmlHref
}: {
  fiche: Partial<QualificationFiche> | null;
  ao?: AoRecord | null;
  deckHref: string;
  htmlHref?: string;
}) {
  const intelligence = asIntelligence(fiche);
  if (!fiche) return <p className="muted">Aucune fiche qualification enregistrée.</p>;

  if (!intelligence) {
    const isPartialSave = Boolean(
      fiche.recommendation?.includes("génération IA en cours") ||
      fiche.recommendation?.includes("IA tronquée")
    );
    const qualifHref = ao ? `/ao/${encodeURIComponent(ao.aoNum)}/qualification?resumeAI=1` : null;
    return (
      <div className="info-grid">
        <div className="alert" role={isPartialSave ? "alert" : "status"}>
          {isPartialSave ? (
            <>
              <strong>Fiche partiellement enregistrée.</strong> L’extraction documentaire a été sauvegardée mais
              l’analyse IA n’a pas pu terminer (délai Netlify dépassé). Cliquez sur{" "}
              <em>Compléter l’analyse IA</em> pour relancer uniquement la phase LLM sans re-uploader les documents.
            </>
          ) : (
            <>
              Fiche ancienne : elle reste lisible, mais ne contient pas encore l’analyse IA enrichie. Relancer la
              qualification intelligente pour obtenir le format Optorg V9.
            </>
          )}
        </div>
        {qualifHref ? (
          <a href={qualifHref} className="btn btn--accent" style={{ alignSelf: "flex-start" }}>
            {isPartialSave ? "Compléter l’analyse IA (documents déjà sauvegardés)" : "Relancer la qualification intelligente"}
          </a>
        ) : null}
        <div className="info-item">
          <span>Contexte</span>
          <p>{fiche.contexte || "Non renseigné"}</p>
        </div>
        <div className="info-item">
          <span>Objet</span>
          <p>{fiche.objet || "Non renseigné"}</p>
        </div>
        <div className="info-item">
          <span>Recommandation</span>
          <p>{fiche.recommendation || "Non renseigné"}</p>
        </div>
      </div>
    );
  }

  const patternScore = intelligence.patternScore;
  const banner = decisionToneClass(intelligence.recommendation, patternScore?.decisionTone);
  const icon = decisionIcon(intelligence.recommendation, patternScore?.decisionTone);
  const label = decisionLabel(intelligence);
  const ident = intelligence.identification;
  const ctx = intelligence.contextHighlight;
  const phases = intelligence.missionPhases || [];
  const keyQuestions = intelligence.keyQuestions || [];
  const calendar = intelligence.aoCalendar || [];
  const responseFormat = intelligence.responseFormat;
  const signals = intelligence.qualificationSignals || [];
  const manager = intelligence.managerRecommendation;
  const watchpoints = intelligence.decisionWatchpoints || [];
  const finance = intelligence.financeIndicative;
  const nextSteps = intelligence.nextSteps || [];

  return (
    <div className="fiche-optorg">
      <div className="fiche-header">
        <div className="header-top">
          <div className="sia-logo">
            SIA PARTNERS MAROC
            <span>Agent AO Qualification v9</span>
          </div>
          <div className="ao-badge">
            <strong>{ao?.client?.toUpperCase() || ident?.buyer?.toUpperCase() || "AO"}</strong>
            {shortText(ao?.sujet || ident?.object || "", 80)}
          </div>
        </div>
        <h1 className="fiche-title">
          {shortText(ao?.sujet || ident?.object || intelligence.executiveSummary, 120)}
          <span className="fiche-subtitle">
            {ao?.client || ident?.buyer || "Client"} · {ident?.geography || ao?.country || "Périmètre à confirmer"}
          </span>
        </h1>
        <div className="header-meta">
          <span>{ident?.missionType || ao?.procedureType || "Type marché à confirmer"}</span>
          <span>Échéance : {ident?.deadline || ao?.dateLimite || "À confirmer"}</span>
          <span>Budget : {ident?.budget || ao?.budget || "À confirmer"}</span>
          <span>Confiance IA : {intelligence.confidenceLevel}</span>
        </div>
      </div>

      <div className={`decision-banner ${banner}`}>
        <div className="decision-main">
          <div className="decision-icon">{icon}</div>
          <div className="decision-text">
            <strong>{label}</strong>
            <span>{shortText(intelligence.executiveSummary, 200)}</span>
          </div>
        </div>
        <div className="decision-side">
          {patternScore ? (
            <div className="score-pill">
              {patternScore.score} <span>/{patternScore.maxScore}</span>
            </div>
          ) : null}
          <div className="score-pill" style={{ background: "var(--sia)" }}>
            {intelligence.goNoGoScore} <span>/100 LLM</span>
          </div>
          <div className="decision-rationale">{patternScore?.rationale || `Recommandation IA : ${intelligence.recommendation}`}</div>
        </div>
      </div>

      <div className="download-row">
        <a href={deckHref}>📊 Télécharger le deck PowerPoint</a>
        {htmlHref ? (
          <a className="ghost" href={htmlHref} target="_blank" rel="noreferrer">
            📄 Télécharger la fiche HTML
          </a>
        ) : null}
      </div>

      <div className="fiche-container">
        {ident ? (
          <section className="fiche-section">
            <div className="fiche-section-header">
              <div className="section-num">1</div>
              <div className="section-title">Identification de l'appel d'offres</div>
            </div>
            <div className="fiche-section-body">
              <table className="fiche-table">
                <tbody>
                  <tr><td className="label">Référence</td><td>{ident.reference}</td></tr>
                  <tr><td className="label">N° interne</td><td>{ident.internalNumber}</td></tr>
                  <tr><td className="label">Client</td><td><strong>{ident.buyer}</strong></td></tr>
                  <tr><td className="label">Programme</td><td>{ident.program}</td></tr>
                  <tr><td className="label">Filiales / périmètre</td><td>{ident.filiales || "À confirmer"}</td></tr>
                  <tr><td className="label">Géographie</td><td>{ident.geography}</td></tr>
                  <tr><td className="label">Objet</td><td>{ident.object}</td></tr>
                  <tr><td className="label">Type marché</td><td>{ident.missionType}</td></tr>
                  <tr><td className="label">Éco-système SI</td><td>{ident.ecosystemeSI || "À confirmer"}</td></tr>
                  <tr><td className="label">Date limite offres</td><td><strong>{ident.deadline}</strong></td></tr>
                  <tr><td className="label">Soumission</td><td>{ident.submission}</td></tr>
                  <tr><td className="label">Contacts</td><td>{ident.contacts || "À confirmer"}</td></tr>
                  <tr><td className="label">Objet mail</td><td>{ident.mailSubject || "À confirmer"}</td></tr>
                  <tr><td className="label">Budget</td><td>{ident.budget}</td></tr>
                  <tr><td className="label">Confidentialité</td><td>{ident.confidentiality || "À confirmer"}</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="fiche-section">
          <div className="fiche-section-header">
            <div className="section-num">2</div>
            <div className="section-title">Contexte et problématique client</div>
          </div>
          <div className="fiche-section-body">
            <p style={{ marginBottom: 12 }}>{shortText(intelligence.clientContext, 480)}</p>
            {ctx ? (
              <div className="context-pane">
                <div className="ctx-card ctx-problems">
                  <div className="ctx-title">🔴 PROBLÈMES IDENTIFIÉS</div>
                  <ul className="ctx-list">
                    {ctx.problems.map((problem) => (
                      <li key={problem}>• {problem}</li>
                    ))}
                  </ul>
                </div>
                <div className="ctx-card ctx-objectives">
                  <div className="ctx-title">✅ OBJECTIFS CLIENT</div>
                  <ul className="ctx-list">
                    {ctx.objectives.map((objective) => (
                      <li key={objective}>• {objective}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
            {ctx?.keyPoint ? (
              <div className="alert-box alert-blue">
                <strong>Point clé :</strong> {ctx.keyPoint}
              </div>
            ) : null}
          </div>
        </section>

        {phases.length ? (
          <section className="fiche-section">
            <div className="fiche-section-header">
              <div className="section-num">3</div>
              <div className="section-title">Périmètre de la mission — {phases.length} phases</div>
            </div>
            <div className="fiche-section-body">
              <div className="phase-grid">
                {phases.map((phase, index) => (
                  <div key={phase.phase} className="phase-card">
                    <div className="p-num">PHASE {index + 1}</div>
                    <div className="p-title">{phase.phase}</div>
                    <div className="p-label">{phase.objective}</div>
                  </div>
                ))}
              </div>
              <div className="alert-box alert-go">
                <strong>Synthèse périmètre :</strong> {shortText(intelligence.scopeSynthesis, 360)}
              </div>
            </div>
          </section>
        ) : null}

        {keyQuestions.length ? (
          <section className="fiche-section">
            <div className="fiche-section-header">
              <div className="section-num">4</div>
              <div className="section-title">Questions clés à traiter dans l'offre</div>
            </div>
            <div className="fiche-section-body">
              <table className="fiche-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Thème</th>
                    <th>Point de vigilance Sia</th>
                  </tr>
                </thead>
                <tbody>
                  {keyQuestions.map((question) => (
                    <tr key={question.index}>
                      <td>
                        <strong>{question.index}</strong>
                      </td>
                      <td>{question.theme}</td>
                      <td>
                        <span className={levelTagClass(question.level)}>{question.vigilance}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {calendar.length ? (
          <section className="fiche-section">
            <div className="fiche-section-header">
              <div className="section-num">5</div>
              <div className="section-title">Calendrier de l'appel d'offres</div>
            </div>
            <div className="fiche-section-body">
              <CalendarList entries={calendar} />
            </div>
          </section>
        ) : null}

        {responseFormat ? (
          <section className="fiche-section">
            <div className="fiche-section-header">
              <div className="section-num">6</div>
              <div className="section-title">Format de réponse imposé</div>
            </div>
            <div className="fiche-section-body">
              <ResponseFormatBlock documents={responseFormat.documents} sections={responseFormat.technicalSections} />
            </div>
          </section>
        ) : null}

        <section className="fiche-section">
          <div className="fiche-section-header">
            <div className="section-num">7</div>
            <div className="section-title">
              Analyse des signaux {patternScore ? `— Score ${patternScore.score}/${patternScore.maxScore}` : ""}
            </div>
          </div>
          <div className="fiche-section-body">
            {patternScore ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, color: "var(--go)", marginBottom: 8 }}>
                  ✅ {patternScore.activated.length} PATTERN(S) GO ACTIVÉ(S){patternScore.blocking.length ? ` · ${patternScore.blocking.length} BLOQUANT(S)` : ""}
                </div>
                <PatternList score={patternScore} />
              </div>
            ) : null}
            {signals.length ? <SignalGrid signals={signals} /> : null}
          </div>
        </section>

        {manager ? (
          <section className="fiche-section">
            <div className="fiche-section-header">
              <div className="section-num">8</div>
              <div className="section-title">Manager recommandé</div>
            </div>
            <div className="fiche-section-body">
              <div className="manager-card">
                <div className="mgr-avatar">{avatarInitials(manager.primaryManager)}</div>
                <div className="mgr-info">
                  <strong>{manager.primaryManager}</strong>
                  <span>{patternScore?.recommendedManager?.title || "Manager Sia Partners Maroc"}</span>
                  <div className="mgr-reason">💡 {manager.rationale}</div>
                </div>
              </div>
              {manager.coReviewers.length ? (
                <p style={{ fontSize: 12, color: "var(--fiche-muted)", marginTop: 12 }}>
                  Co-revue : <strong>{manager.coReviewers.join(", ")}</strong>
                </p>
              ) : null}
              <p style={{ fontSize: 12, color: "var(--fiche-muted)", marginTop: 8 }}>
                Decision owner : <strong>{manager.decisionOwner}</strong>
              </p>
            </div>
          </section>
        ) : null}

        {watchpoints.length ? (
          <section className="fiche-section">
            <div className="fiche-section-header">
              <div className="section-num">9</div>
              <div className="section-title">Points de vigilance &amp; facteurs différenciants</div>
            </div>
            <div className="fiche-section-body">
              <table className="fiche-table">
                <thead>
                  <tr>
                    <th>Point</th>
                    <th>Niveau</th>
                    <th>Action / Question</th>
                  </tr>
                </thead>
                <tbody>
                  {watchpoints.map((point) => (
                    <tr key={`${point.point}-${point.level}`}>
                      <td>
                        <strong>{point.point}</strong>
                      </td>
                      <td>
                        <span
                          className={`tag ${
                            point.level === "Critique" || point.level === "Éliminatoire"
                              ? "tag-warn"
                              : point.level === "Opportunité"
                              ? "tag-go"
                              : "tag-blue"
                          }`}
                        >
                          {point.level}
                        </span>
                      </td>
                      <td>{point.question}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {finance ? (
          <section className="fiche-section">
            <div className="fiche-section-header">
              <div className="section-num">10</div>
              <div className="section-title">Simulation financière indicative</div>
            </div>
            <div className="fiche-section-body">
              <table className="fiche-table">
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Profils</th>
                    <th>JH</th>
                    <th>TJM</th>
                    <th>Montant HT</th>
                  </tr>
                </thead>
                <tbody>
                  {finance.rows.map((row) => (
                    <tr key={row.phase}>
                      <td>{row.phase}</td>
                      <td>{row.profil}</td>
                      <td>{row.jours}</td>
                      <td>{row.tjm}</td>
                      <td>
                        <strong>{row.montantHt}</strong>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: "var(--go-bg)" }}>
                    <td colSpan={4}>
                      <strong>Total honoraires HT</strong>
                    </td>
                    <td>
                      <strong>{finance.totalHt}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4}>Frais (déplacements, licences pilotes)</td>
                    <td>{finance.fees}</td>
                  </tr>
                  <tr style={{ background: "var(--go-bg)" }}>
                    <td colSpan={4}>
                      <strong>Total offre HT estimée</strong>
                    </td>
                    <td>
                      <strong>{finance.totalWithFees}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p style={{ fontSize: 11, color: "var(--fiche-muted)", marginTop: 10 }}>💡 {finance.note}</p>
            </div>
          </section>
        ) : null}

        {nextSteps.length ? (
          <section className="fiche-section">
            <div className="fiche-section-header">
              <div className="section-num">11</div>
              <div className="section-title">Prochaines étapes recommandées</div>
            </div>
            <div className="fiche-section-body">
              <ul className="steps-list">
                {nextSteps.map((step, index) => (
                  <li key={`${step.action}-${index}`}>
                    <div className="step-num">{index + 1}</div>
                    <div className="step-body">
                      <strong>
                        {step.action} — {step.deadline}
                      </strong>
                      <span>Owner : {step.owner}</span>
                      {step.workflowCommand ? <div className="cmd">{step.workflowCommand}</div> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <div className="fiche-footer">
          <span>📋 Fiche générée par Agent AO Sia Maroc v9 · {new Date(intelligence.generatedAt).toLocaleString("fr-FR")}</span>
          <span>{ao ? `AO ${ao.displayAoNum} — ${ao.client}` : "Fiche AO"}</span>
          <span>
            {icon} Statut : {label}
          </span>
        </div>
      </div>
    </div>
  );
}
