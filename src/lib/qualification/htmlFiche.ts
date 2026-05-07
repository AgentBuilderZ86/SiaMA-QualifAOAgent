/**
 * Export HTML autonome — politique thème produit : header Sia noir + filet vert commun ;
 * décision GO / WATCH / NOGO via tokens (--go-bg, --warn-bg, --nogo-bg, bannières `.tone-*`),
 * cohérent avec `.fiche-optorg` dans `globals.css` (pas de gradient plein écran par décision).
 */
import type {
  AoRecord,
  IntelligentQualificationFiche,
  QualificationCalendarEntry,
  QualificationKeyQuestion,
  QualificationResponseFormat,
  QualificationSignal
} from "@/lib/aoTypes";
import type { PatternHit, PatternScoreResult } from "@/lib/qualification/patterns";

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
  :root {
    --sia-black: #0E0E10;
    --sia-green: #00E0A4;
    --sia-green-ink: #00A578;
    --go: #00A578; --go-bg: #E6FAF4;
    --warn: #E6A23C; --warn-bg: #FFFBEB;
    --nogo: #D63B3B; --nogo-bg: #FEF2F2;
    --blue: #2E5BFF; --blue-light: #E8EEFF;
    --text: #0E0E10; --muted: #6B6B72;
    --border: #E5E5E1; --bg: #FAFAF7;
    --surface: #FFFFFF; --surface-1: #F6F6F4;
    --font-display: 'Inter Tight', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font-display); background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.5; font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  .header { background: var(--sia-black); color: #FAFAF7; padding: 32px 48px 28px; position: relative; overflow: hidden; border-bottom: 3px solid var(--sia-green); }
  .header::before { content: ''; position: absolute; top: -60px; right: -60px; width: 200px; height: 200px; border-radius: 50%; background: rgba(0,224,164,0.06); }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; gap: 16px; flex-wrap: wrap; position: relative; z-index: 1; }
  .sia-logo { font-family: var(--font-display); font-weight: 600; font-size: 18px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--sia-green); }
  .sia-logo span { color: #C0C0C5; font-weight: 400; font-size: 12px; letter-spacing: 0; text-transform: none; display: block; margin-top: 4px; }
  .ao-badge { background: #1C1C22; border: 1px solid #22222A; border-radius: 8px; padding: 8px 16px; text-align: right; font-size: 12px; color: #C0C0C5; }
  .ao-badge strong { font-family: var(--font-mono); font-feature-settings: 'tnum'; font-size: 14px; font-weight: 600; color: #FAFAF7; display: block; }
  h1 { font-family: var(--font-display); font-size: 24px; font-weight: 600; letter-spacing: -0.005em; line-height: 1.2; margin-bottom: 8px; color: #FAFAF7; }
  h1 .fiche-subtitle { display: block; margin-top: 4px; font-size: 14px; font-weight: 400; color: #C0C0C5; }
  .header-meta { display: flex; gap: 18px; font-size: 12px; color: #8A8A92; flex-wrap: wrap; position: relative; z-index: 1; }
  .header-meta span::before { content: '• '; color: var(--sia-green); margin-right: 4px; }
  .decision-banner { background: var(--go-bg); border-left: 5px solid var(--go); padding: 16px 48px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .decision-banner.tone-watch { background: var(--warn-bg); border-left-color: var(--warn); }
  .decision-banner.tone-nogo { background: var(--nogo-bg); border-left-color: var(--nogo); }
  .decision-main { display: flex; align-items: center; gap: 12px; }
  .decision-icon { font-size: 28px; }
  .decision-text strong { font-family: var(--font-display); font-size: 18px; font-weight: 600; color: #065F46; display: block; }
  .decision-text span { color: var(--go); font-size: 12px; display: block; margin-top: 2px; }
  .tone-watch .decision-text strong { color: #8A6217; }
  .tone-watch .decision-text span { color: #B45309; }
  .tone-nogo .decision-text strong { color: #991B1B; }
  .tone-nogo .decision-text span { color: var(--nogo); }
  .score-pill { background: var(--go); color: #FFF; font-family: var(--font-mono); font-feature-settings: 'tnum'; font-weight: 600; font-size: 18px; padding: 8px 18px; border-radius: 999px; white-space: nowrap; }
  .tone-watch .score-pill { background: var(--warn); color: var(--sia-black); }
  .tone-nogo .score-pill { background: var(--nogo); color: #FFF; }
  .score-pill span { font-size: 12px; font-weight: 400; opacity: 0.85; }
  .container { max-width: 960px; margin: 0 auto; padding: 0 24px 48px; }
  .section { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-top: 18px; box-shadow: 0 1px 0 rgba(14,14,16,0.04), 0 1px 2px rgba(14,14,16,0.06); }
  .section-header { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-bottom: 1px solid var(--border); background: var(--surface-1); }
  .section-num { width: 26px; height: 26px; border-radius: 50%; background: var(--sia-black); color: var(--sia-green); font-family: var(--font-mono); font-feature-settings: 'tnum'; font-weight: 600; font-size: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .section-title { font-family: var(--font-display); font-weight: 600; font-size: 15px; color: var(--text); }
  .section-body { padding: 18px 20px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: var(--surface-1); font-family: var(--font-display); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border); }
  td { padding: 10px 14px; border-bottom: 1px solid var(--surface-1); vertical-align: top; font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  .label { font-weight: 500; color: var(--muted); width: 32%; }
  .tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; border: 1px solid transparent; }
  .tag-go { background: var(--go-bg); color: #065F46; border-color: #B5E8D6; }
  .tag-warn { background: var(--warn-bg); color: #8A6217; border-color: #FDE2A6; }
  .tag-blue { background: var(--blue-light); color: var(--blue); border-color: #CCD9FF; }
  .tag-gray { background: var(--surface-1); color: var(--muted); border-color: var(--border); }
  .tag-nogo { background: var(--nogo-bg); color: #991B1B; border-color: #F4C2C2; }
  .signal-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .signal-card { border: 1px solid var(--border); border-radius: 8px; padding: 14px; background: var(--surface); }
  .signal-card .s-icon { font-size: 20px; margin-bottom: 6px; }
  .signal-card .s-label { font-size: 12px; color: var(--muted); font-weight: 500; margin-bottom: 4px; }
  .signal-card .s-value { font-size: 14px; font-weight: 600; }
  .s-yes .s-value { color: #065F46; }
  .s-warn .s-value { color: #8A6217; }
  .s-nogo .s-value { color: #991B1B; }
  .s-ok .s-value { color: var(--muted); }
  .manager-card { border: 1px solid var(--border); border-left: 3px solid var(--sia-green); border-radius: 8px; padding: 18px; background: var(--surface-1); display: flex; align-items: center; gap: 16px; }
  .mgr-avatar { width: 48px; height: 48px; border-radius: 50%; background: var(--sia-black); color: var(--sia-green); display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-weight: 600; font-size: 16px; letter-spacing: 0.04em; flex-shrink: 0; }
  .mgr-info strong { font-family: var(--font-display); font-weight: 600; font-size: 15px; color: var(--text); display: block; letter-spacing: 0.04em; }
  .mgr-info span { font-size: 12px; color: var(--muted); display: block; }
  .mgr-reason { margin-top: 6px; background: var(--surface); border-radius: 6px; padding: 4px 10px; font-size: 12px; color: var(--text); border: 1px solid var(--border); display: inline-block; }
  .steps-list { list-style: none; }
  .steps-list li { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--surface-1); }
  .steps-list li:last-child { border-bottom: none; }
  .step-num { width: 28px; height: 28px; border-radius: 50%; background: var(--sia-green); color: var(--sia-black); font-family: var(--font-mono); font-feature-settings: 'tnum'; font-weight: 600; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .step-body strong { display: block; font-family: var(--font-display); font-weight: 600; font-size: 14px; margin-bottom: 2px; color: var(--text); }
  .step-body span { font-size: 12px; color: var(--muted); }
  .cmd { display: inline-block; background: var(--sia-black); color: var(--sia-green); font-family: var(--font-mono); font-size: 12px; padding: 2px 8px; border-radius: 4px; margin-top: 4px; }
  .alert-box { border-radius: 8px; padding: 12px 16px; font-size: 13px; margin-top: 12px; }
  .alert-warn { background: var(--warn-bg); border: 1px solid #FDE2A6; color: #8A6217; }
  .alert-go { background: var(--go-bg); border: 1px solid #B5E8D6; color: #065F46; }
  .alert-blue { background: var(--blue-light); border: 1px solid #CCD9FF; color: var(--blue); }
  .phase-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 16px; }
  .phase-card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
  .phase-card .p-num { font-family: var(--font-mono); font-feature-settings: 'tnum'; font-weight: 600; font-size: 11px; color: var(--sia-green-ink); margin-bottom: 4px; }
  .phase-card .p-title { font-family: var(--font-display); font-size: 14px; font-weight: 600; margin-bottom: 4px; }
  .phase-card .p-label { font-size: 12px; color: var(--muted); }
  .timeline-row { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--surface-1); gap: 12px; }
  .timeline-row:last-child { border-bottom: none; }
  .timeline-row.milestone-deadline { background: var(--go-bg); border-radius: 8px; padding: 8px 12px; border: 1px solid #B5E8D6; margin: 4px 0; }
  .timeline-row.milestone-deadline .t-date { color: var(--go); }
  .timeline-row.milestone-deadline .t-dot { background: var(--go); }
  .timeline-row.milestone-kickoff { background: var(--blue-light); border-radius: 8px; padding: 8px 12px; border: 1px solid #CCD9FF; margin: 4px 0; }
  .timeline-row.milestone-kickoff .t-date { color: var(--blue); }
  .timeline-row.milestone-kickoff .t-dot { background: var(--blue); }
  .timeline-row.milestone-soutenance { background: var(--warn-bg); border-radius: 8px; padding: 8px 12px; border: 1px solid #FDE2A6; margin: 4px 0; }
  .timeline-row.milestone-soutenance .t-date { color: var(--warn); }
  .timeline-row.milestone-soutenance .t-dot { background: var(--warn); }
  .t-date { font-family: var(--font-mono); font-feature-settings: 'tnum'; font-weight: 600; font-size: 12px; color: var(--text); width: 70px; flex-shrink: 0; }
  .t-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--sia-green); flex-shrink: 0; }
  .t-label { font-size: 14px; }
  .response-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; }
  .response-card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; padding: 14px; text-align: center; }
  .response-card.starred { border-color: #FDE2A6; background: var(--warn-bg); }
  .response-card .r-icon { font-size: 22px; margin-bottom: 6px; }
  .response-card .r-title { font-family: var(--font-display); font-weight: 600; font-size: 12px; color: var(--text); }
  .response-card .r-detail { font-size: 12px; color: var(--muted); margin-top: 4px; }
  .response-sections { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 16px; }
  .response-section-item { font-size: 12px; background: var(--surface-1); padding: 6px 10px; border-radius: 4px; }
  .response-section-item.starred { background: var(--go-bg); border: 1px solid #B5E8D6; }
  .pattern-list { display: flex; flex-direction: column; gap: 8px; }
  .pattern-row { background: var(--go-bg); border: 1px solid #B5E8D6; border-radius: 8px; padding: 10px 14px; font-size: 13px; }
  .pattern-row.tone-nogo { background: var(--nogo-bg); border-color: #F4C2C2; }
  .pattern-row.tone-watch { background: var(--warn-bg); border-color: #FDE2A6; }
  .pattern-points { float: right; font-family: var(--font-mono); font-feature-settings: 'tnum'; font-weight: 600; color: var(--go); }
  .pattern-row.tone-nogo .pattern-points { color: var(--nogo); }
  .pattern-row.tone-watch .pattern-points { color: var(--warn); }
  .pattern-meta { font-size: 12px; color: var(--muted); display: block; margin-top: 4px; }
  .ctx-pane { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .ctx-card { border-radius: 8px; padding: 12px; }
  .ctx-problems { background: var(--nogo-bg); border: 1px solid #F4C2C2; }
  .ctx-objectives { background: var(--go-bg); border: 1px solid #B5E8D6; }
  .ctx-title { font-family: var(--font-display); font-weight: 600; font-size: 12px; margin-bottom: 8px; }
  .ctx-problems .ctx-title { color: #B91C1C; }
  .ctx-objectives .ctx-title { color: #065F46; }
  .ctx-list { list-style: none; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--muted); flex-wrap: wrap; gap: 8px; }
  @media print { .header { padding: 24px; } .container { padding: 0 12px 24px; } .section { box-shadow: none; } }
`;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function patternsHtml(score: PatternScoreResult): string {
  const items: Array<PatternHit & { tone: "go" | "nogo" | "watch" }> = [
    ...score.activated.map((hit) => ({ ...hit, tone: "go" as const })),
    ...score.blocking.map((hit) => ({ ...hit, tone: "nogo" as const })),
    ...score.watching.map((hit) => ({ ...hit, tone: "watch" as const }))
  ];
  if (!items.length && !score.bonusClient) return "";
  const rows = items
    .map((hit) => {
      const points = hit.tone === "go" ? `+${hit.score ?? 0} pts` : hit.tone === "nogo" ? "Bloquant" : "À surveiller";
      return `
        <div class="pattern-row tone-${hit.tone}">
          <strong>${escapeHtml(hit.reason)}</strong>
          <span class="pattern-points">${escapeHtml(points)}</span>
          <span class="pattern-meta">Mots-clés détectés : ${escapeHtml(hit.hits.slice(0, 5).join(", ") || "n/a")}${hit.manager ? ` · Manager : ${escapeHtml(hit.manager)}` : ""}</span>
        </div>`;
    })
    .join("");
  const bonus = score.bonusClient
    ? `
      <div class="pattern-row tone-go">
        <strong>Bonus client stratégique — ${escapeHtml(score.bonusClient.client)}</strong>
        <span class="pattern-points">+${escapeHtml(score.bonusClient.points)} pt</span>
        <span class="pattern-meta">Compte clé Sia Maroc — opportunité référence.</span>
      </div>`
    : "";
  return `<div class="pattern-list">${rows}${bonus}</div>`;
}

function calendarHtml(entries: QualificationCalendarEntry[]) {
  return entries
    .map(
      (entry) => `
      <div class="timeline-row${entry.milestone ? ` milestone-${entry.milestone}` : ""}">
        <div class="t-date">${escapeHtml(entry.dayLabel)}</div>
        <div class="t-dot"></div>
        <div class="t-label">${escapeHtml(entry.label)}</div>
      </div>`
    )
    .join("");
}

function responseFormatHtml(format: QualificationResponseFormat) {
  const cards = format.documents
    .map((doc) => {
      const icon = doc.format.toUpperCase().includes("PPT") ? "📊" : doc.format.toUpperCase().includes("EXCEL") ? "💰" : doc.format.toUpperCase().includes("PDF") ? "📄" : "🗂️";
      return `
        <div class="response-card${doc.isStarred ? " starred" : ""}">
          <div class="r-icon">${icon}</div>
          <div class="r-title">${escapeHtml(doc.label)}</div>
          <div class="r-detail">${escapeHtml(doc.format)} · ${escapeHtml(doc.detail)}</div>
        </div>`;
    })
    .join("");
  const sections = format.technicalSections
    .map(
      (sec) => `
      <div class="response-section-item${sec.isStarred ? " starred" : ""}">${sec.number}. ${sec.isStarred ? "⭐ " : ""}${escapeHtml(sec.title)}</div>`
    )
    .join("");
  return `
    <div class="response-grid">${cards}</div>
    <div style="margin-top:16px">
      <div style="font-family:var(--font-display);font-weight:600;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">STRUCTURE ATTENDUE DU DOSSIER TECHNIQUE</div>
      <div class="response-sections">${sections}</div>
    </div>`;
}

function signalGridHtml(signals: QualificationSignal[]) {
  return signals
    .slice(0, 9)
    .map(
      (signal) => `
      <div class="${signalImpactClass(signal.impact)}">
        <div class="s-icon">${signalIcon(signal.impact)}</div>
        <div class="s-label">${escapeHtml(signal.label)}</div>
        <div class="s-value">${escapeHtml(shortText(signal.detail, 80))}</div>
        ${signal.scoreImpact ? `<div style="margin-top:4px;font-size:11px;color:var(--muted)">${escapeHtml(signal.scoreImpact)}</div>` : ""}
      </div>`
    )
    .join("");
}

export function buildQualificationFicheHtml(ao: AoRecord, intelligence: IntelligentQualificationFiche): string {
  const patternScore = intelligence.patternScore;
  const banner = decisionToneClass(intelligence.recommendation, patternScore?.decisionTone);
  const icon = decisionIcon(intelligence.recommendation, patternScore?.decisionTone);
  const label = patternScore?.decisionLabel || (intelligence.recommendation === "GO" ? "GO — Répondre fortement recommandé" : intelligence.recommendation === "NO GO" ? "NO GO — Ne pas répondre" : "WATCH — À confirmer avec le manager");
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

  const headerSubtitle = `${escapeHtml(ao.client || ident?.buyer || "Client")} · ${escapeHtml(ident?.geography || ao.country || "Périmètre à confirmer")}`;
  const headerMeta = [
    ident?.missionType || ao.procedureType || "Type marché à confirmer",
    `Échéance : ${ident?.deadline || ao.dateLimite || "À confirmer"}`,
    `Budget : ${ident?.budget || ao.budget || "À confirmer"}`,
    `Confiance IA : ${intelligence.confidenceLevel}`
  ];

  const identRows = ident
    ? [
        ["Référence", ident.reference],
        ["N° interne", ident.internalNumber],
        ["Client", `<strong>${escapeHtml(ident.buyer)}</strong>`],
        ["Programme", ident.program],
        ["Filiales / périmètre", ident.filiales || "À confirmer"],
        ["Géographie", ident.geography],
        ["Objet", ident.object],
        ["Type marché", ident.missionType],
        ["Éco-système SI", ident.ecosystemeSI || "À confirmer"],
        ["Date limite offres", `<strong>${escapeHtml(ident.deadline)}</strong>`],
        ["Soumission", ident.submission],
        ["Contacts", ident.contacts || "À confirmer"],
        ["Objet mail", ident.mailSubject || "À confirmer"],
        ["Budget", ident.budget],
        ["Confidentialité", ident.confidentiality || "À confirmer"]
      ]
        .map(([labelTxt, value]) => `<tr><td class="label">${escapeHtml(labelTxt)}</td><td>${value}</td></tr>`)
        .join("")
    : "";

  const ctxBlock = ctx
    ? `
        <div class="ctx-pane">
          <div class="ctx-card ctx-problems">
            <div class="ctx-title">🔴 PROBLÈMES IDENTIFIÉS</div>
            <ul class="ctx-list">${ctx.problems.map((problem) => `<li>• ${escapeHtml(problem)}</li>`).join("")}</ul>
          </div>
          <div class="ctx-card ctx-objectives">
            <div class="ctx-title">✅ OBJECTIFS CLIENT</div>
            <ul class="ctx-list">${ctx.objectives.map((obj) => `<li>• ${escapeHtml(obj)}</li>`).join("")}</ul>
          </div>
        </div>
        ${ctx.keyPoint ? `<div class="alert-box alert-blue"><strong>Point clé :</strong> ${escapeHtml(ctx.keyPoint)}</div>` : ""}`
    : "";

  const phasesBlock = phases.length
    ? `
        <div class="phase-grid">
          ${phases
            .map(
              (phase, index) => `
            <div class="phase-card">
              <div class="p-num">PHASE ${index + 1}</div>
              <div class="p-title">${escapeHtml(phase.phase)}</div>
              <div class="p-label">${escapeHtml(phase.objective)}</div>
            </div>`
            )
            .join("")}
        </div>
        <div class="alert-box alert-go"><strong>Synthèse périmètre :</strong> ${escapeHtml(shortText(intelligence.scopeSynthesis, 360))}</div>`
    : "";

  const keyQuestionsBlock = keyQuestions.length
    ? `
        <table>
          <thead><tr><th>#</th><th>Thème</th><th>Point de vigilance Sia</th></tr></thead>
          <tbody>
            ${keyQuestions
              .map(
                (q) => `
              <tr>
                <td><strong>${q.index}</strong></td>
                <td>${escapeHtml(q.theme)}</td>
                <td><span class="${levelTagClass(q.level)}">${escapeHtml(q.vigilance)}</span></td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>`
    : "";

  const watchpointsBlock = watchpoints.length
    ? `
        <table>
          <thead><tr><th>Point</th><th>Niveau</th><th>Action / Question</th></tr></thead>
          <tbody>
            ${watchpoints
              .map((point) => {
                const tag =
                  point.level === "Critique" || point.level === "Éliminatoire"
                    ? "tag-warn"
                    : point.level === "Opportunité"
                    ? "tag-go"
                    : "tag-blue";
                return `
                <tr>
                  <td><strong>${escapeHtml(point.point)}</strong></td>
                  <td><span class="tag ${tag}">${escapeHtml(point.level)}</span></td>
                  <td>${escapeHtml(point.question)}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>`
    : "";

  const financeBlock = finance
    ? `
        <table>
          <thead><tr><th>Phase</th><th>Profils</th><th>JH</th><th>TJM</th><th>Montant HT</th></tr></thead>
          <tbody>
            ${finance.rows
              .map(
                (row) => `
              <tr>
                <td>${escapeHtml(row.phase)}</td>
                <td>${escapeHtml(row.profil)}</td>
                <td>${escapeHtml(row.jours)}</td>
                <td>${escapeHtml(row.tjm)}</td>
                <td><strong>${escapeHtml(row.montantHt)}</strong></td>
              </tr>`
              )
              .join("")}
            <tr style="background:var(--go-bg)"><td colspan="4"><strong>Total honoraires HT</strong></td><td><strong>${escapeHtml(finance.totalHt)}</strong></td></tr>
            <tr><td colspan="4">Frais (déplacements, licences pilotes)</td><td>${escapeHtml(finance.fees)}</td></tr>
            <tr style="background:var(--go-bg)"><td colspan="4"><strong>Total offre HT estimée</strong></td><td><strong>${escapeHtml(finance.totalWithFees)}</strong></td></tr>
          </tbody>
        </table>
        <p style="font-size:11px;color:var(--muted);margin-top:10px">💡 ${escapeHtml(finance.note)}</p>`
    : "";

  const nextStepsBlock = nextSteps.length
    ? `
        <ul class="steps-list">
          ${nextSteps
            .map(
              (step, index) => `
            <li>
              <div class="step-num">${index + 1}</div>
              <div class="step-body">
                <strong>${escapeHtml(step.action)} — ${escapeHtml(step.deadline)}</strong>
                <span>Owner : ${escapeHtml(step.owner)}</span>
                ${step.workflowCommand ? `<div class="cmd">${escapeHtml(step.workflowCommand)}</div>` : ""}
              </div>
            </li>`
            )
            .join("")}
        </ul>`
    : "";

  const managerBlock = manager
    ? `
        <div class="manager-card">
          <div class="mgr-avatar">${escapeHtml(avatarInitials(manager.primaryManager))}</div>
          <div class="mgr-info">
            <strong>${escapeHtml(manager.primaryManager)}</strong>
            <span>${escapeHtml(patternScore?.recommendedManager?.title || "Manager Sia Partners Maroc")}</span>
            <div class="mgr-reason">💡 ${escapeHtml(manager.rationale)}</div>
          </div>
        </div>
        ${
          manager.coReviewers.length
            ? `<p style="font-size:12px;color:var(--muted);margin-top:12px">Co-revue : <strong>${escapeHtml(manager.coReviewers.join(", "))}</strong></p>`
            : ""
        }
        <p style="font-size:12px;color:var(--muted);margin-top:8px">Decision owner : <strong>${escapeHtml(manager.decisionOwner)}</strong></p>`
    : "";

  const signalsBlock = `
    ${
      patternScore
        ? `<div style="margin-bottom:16px">
            <div style="font-family:var(--font-display);font-weight:600;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--go);margin-bottom:8px">✅ ${patternScore.activated.length} PATTERN(S) GO ACTIVÉ(S)${patternScore.blocking.length ? ` · ${patternScore.blocking.length} BLOQUANT(S)` : ""}</div>
            ${patternsHtml(patternScore)}
           </div>`
        : ""
    }
    ${signals.length ? `<div class="signal-grid">${signalGridHtml(signals)}</div>` : ""}`;

  const sections: Array<{ num: number; title: string; body: string }> = [];
  let n = 1;
  if (ident) sections.push({ num: n++, title: "Identification de l'appel d'offres", body: `<table><tbody>${identRows}</tbody></table>` });
  sections.push({
    num: n++,
    title: "Contexte et problématique client",
    body: `<p style="margin-bottom:12px">${escapeHtml(shortText(intelligence.clientContext, 480))}</p>${ctxBlock}`
  });
  if (phases.length) sections.push({ num: n++, title: `Périmètre de la mission — ${phases.length} phases`, body: phasesBlock });
  if (keyQuestions.length) sections.push({ num: n++, title: "Questions clés à traiter dans l'offre", body: keyQuestionsBlock });
  if (calendar.length) sections.push({ num: n++, title: "Calendrier de l'appel d'offres", body: calendarHtml(calendar) });
  if (responseFormat) sections.push({ num: n++, title: "Format de réponse imposé", body: responseFormatHtml(responseFormat) });
  sections.push({
    num: n++,
    title: `Analyse des signaux${patternScore ? ` — Score ${patternScore.score}/${patternScore.maxScore}` : ""}`,
    body: signalsBlock
  });
  if (manager) sections.push({ num: n++, title: "Manager recommandé", body: managerBlock });
  if (watchpoints.length) sections.push({ num: n++, title: "Points de vigilance & facteurs différenciants", body: watchpointsBlock });
  if (finance) sections.push({ num: n++, title: "Simulation financière indicative", body: financeBlock });
  if (nextSteps.length) sections.push({ num: n++, title: "Prochaines étapes recommandées", body: nextStepsBlock });

  const sectionsHtml = sections
    .map(
      (sec) => `
      <div class="section">
        <div class="section-header">
          <div class="section-num">${sec.num}</div>
          <div class="section-title">${escapeHtml(sec.title)}</div>
        </div>
        <div class="section-body">${sec.body}</div>
      </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fiche Qualification — ${escapeHtml(ao.displayAoNum || ao.aoNum)} — ${escapeHtml(ao.client)}</title>
<style>${STYLES}</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <div class="sia-logo">SIA PARTNERS MAROC<span>Agent AO Qualification v9</span></div>
    <div class="ao-badge">
      <strong>${escapeHtml((ao.client || ident?.buyer || "AO").toUpperCase())}</strong>
      ${escapeHtml(shortText(ao.sujet || ident?.object || "", 80))}
    </div>
  </div>
  <h1>${escapeHtml(shortText(ao.sujet || ident?.object || intelligence.executiveSummary, 120))}<br>
  <span style="font-size:16px;font-weight:400;opacity:0.85">${headerSubtitle}</span></h1>
  <div class="header-meta">
    ${headerMeta.map((entry) => `<span>${escapeHtml(entry)}</span>`).join("")}
  </div>
</div>

<div class="decision-banner ${banner}">
  <div class="decision-main">
    <div class="decision-icon">${icon}</div>
    <div class="decision-text">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(shortText(intelligence.executiveSummary, 200))}</span>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    ${
      patternScore
        ? `<div class="score-pill">${patternScore.score} <span>/${patternScore.maxScore}</span></div>`
        : ""
    }
    <div class="score-pill" style="background:var(--sia)">${intelligence.goNoGoScore} <span>/100 LLM</span></div>
    <span style="font-size:12px;max-width:240px">${escapeHtml(patternScore?.rationale || `Recommandation IA : ${intelligence.recommendation}`)}</span>
  </div>
</div>

<div class="container">
  ${sectionsHtml}

  <div class="footer">
    <span>📋 Fiche générée par Agent AO Sia Maroc v9 · ${escapeHtml(new Date(intelligence.generatedAt).toLocaleString("fr-FR"))}</span>
    <span>${escapeHtml(`AO ${ao.displayAoNum || ao.aoNum} — ${ao.client}`)}</span>
    <span>${icon} Statut : ${escapeHtml(label)}</span>
  </div>
</div>

</body>
</html>`;
}
