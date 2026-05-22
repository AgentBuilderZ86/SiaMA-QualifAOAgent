/**
 * Pipeline d'analyse structurée (étapes 2–6 du prompt qualification SiaGPT).
 * Produit une fiche exploitable même si le LLM est tronqué (Netlify).
 */
import type {
  AoRecord,
  QualificationFiche,
  QualificationFinanceIndicative,
  QualificationFinanceRow,
  QualificationIdentification,
  QualificationMissionPhase,
  QualificationNextStep,
  QualificationRisk,
  ReferentielItem
} from "@/lib/aoTypes";
import { extractKeyMetadata, isPlaceholderSection } from "@/lib/qualification/documentMetadata";

export type StructuredTeamProfile = {
  title: string;
  requirements: string;
  certifications: string[];
};

export type StructuredEvaluationCriterion = {
  label: string;
  detail: string;
};

export type StructuredClientInsight = {
  organizationType: string;
  missions: string;
  projectContext: string;
  stakes: string;
  relationSia: string;
};

export type StructuredQualification = {
  identification: QualificationIdentification;
  missionPhases: QualificationMissionPhase[];
  teamProfiles: StructuredTeamProfile[];
  evaluationCriteria: StructuredEvaluationCriterion[];
  clientInsight: StructuredClientInsight;
  financeIndicative: QualificationFinanceIndicative;
  actionPlan: QualificationNextStep[];
  risks: QualificationRisk[];
  businessIssues: string[];
  scopeSynthesis: string;
  executiveSummary: string;
  requiredProfileLines: string[];
  briefForLlm: string;
};

const TJM_DEFAULTS: Record<string, number> = {
  consultant: 5000,
  senior: 6000,
  manager: 7000,
  "senior manager": 8000,
  directeur: 9500,
  expert: 7500
};

function cleanLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function linesOf(text: string) {
  return text
    .split(/\n+/)
    .map(cleanLine)
    .filter((line) => line.length > 2);
}

function compact(value: string, max = 220) {
  const cleaned = cleanLine(value);
  if (!cleaned) return "";
  return cleaned.length > max ? `${cleaned.slice(0, max).trim()}…` : cleaned;
}

function parseAmountDh(text: string): number | null {
  const normalized = text.replace(/\s/g, " ");
  const m = normalized.match(/(\d[\d\s]{2,})(?:\s*(dh|mad|dirhams?))?(?:\s*(ttc|ht))?/i);
  if (!m) return null;
  const n = Number(String(m[1]).replace(/\s/g, ""));
  if (!Number.isFinite(n) || n < 1000) return null;
  const isTtc = /ttc|toutes\s+taxes/i.test(text);
  return isTtc ? Math.round(n / 1.2) : n;
}

function formatDh(n: number) {
  return `${n.toLocaleString("fr-FR")} DH`;
}

function extractPhases(text: string): QualificationMissionPhase[] {
  const phases: QualificationMissionPhase[] = [];
  const seen = new Set<string>();

  const patterns = [
    /(?:^|\n)\s*(?:phase|p)\s*([1-9])\s*[-–—:.)\s]+\s*([^\n]{8,200})/gi,
    /(?:^|\n)\s*([1-9])\s*[-–—:.)\s]+\s*([^\n]{8,200})/gi
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const num = match[1];
      const title = cleanLine(match[2]);
      if (!title || title.length < 8 || seen.has(num)) continue;
      if (!/(cadrage|diagnostic|besoin|architecture|feuille|assistance|formation|gouvernance|urbanisation|mission|prestation|livrable|étape|etape)/i.test(title)) {
        continue;
      }
      seen.add(num);
      phases.push({
        phase: `P${num} — ${compact(title, 90)}`,
        objective: compact(title, 160),
        deliverables: []
      });
    }
    if (phases.length >= 2) break;
  }

  phases.sort((a, b) => {
    const na = Number(a.phase.match(/\d+/)?.[0] || 99);
    const nb = Number(b.phase.match(/\d+/)?.[0] || 99);
    return na - nb;
  });

  return phases.slice(0, 8);
}

function extractCertifications(line: string): string[] {
  const certs: string[] = [];
  const known = [
    "TOGAF",
    "PMP",
    "Prince2",
    "PRINCE2",
    "Zachman",
    "Archimate",
    "BPMN",
    "CISSP",
    "OCP",
    "COBIT",
    "ITIL",
    "Scrum"
  ];
  for (const cert of known) {
    if (new RegExp(cert, "i").test(line)) certs.push(cert.toUpperCase() === "PRINCE2" ? "Prince2" : cert);
  }
  return [...new Set(certs)].slice(0, 6);
}

function extractTeamProfiles(text: string): StructuredTeamProfile[] {
  const profiles: StructuredTeamProfile[] = [];
  const rolePatterns = [
    /chef\s+de\s+projet/i,
    /urbaniste/i,
    /architecte\s+d['']entreprise/i,
    /architecte\s+fonctionnel/i,
    /architecte\s+technique/i,
    /consultant\s+senior/i,
    /expert\s+/i,
    /pmo/i
  ];

  const lines = linesOf(text);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const role = rolePatterns.find((re) => re.test(line));
    if (!role) continue;
    const titleMatch = line.match(/(chef\s+de\s+projet[^.;]{0,60}|urbaniste[^.;]{0,60}|architecte[^.;]{0,60}|consultant\s+senior[^.;]{0,50})/i);
    const title = titleMatch ? compact(titleMatch[0], 80) : compact(line, 80);
    const block = [line, lines[i + 1], lines[i + 2]].filter(Boolean).join(" ");
    const requirements = compact(block.replace(title, "").trim() || block, 200);
    profiles.push({
      title,
      requirements: requirements || "Exigences détaillées dans le RC/CPS.",
      certifications: extractCertifications(block)
    });
  }

  if (!profiles.length) {
    const profilSection = text.match(/(?:profil|équipe|expert)[\s\S]{0,2500}/i)?.[0] || "";
    if (profilSection) {
      for (const line of linesOf(profilSection).slice(0, 12)) {
        if (/(bac\+|années|ans\s+d|certifi|expérience|experience)/i.test(line)) {
          profiles.push({
            title: compact(line, 70),
            requirements: compact(line, 200),
            certifications: extractCertifications(line)
          });
        }
      }
    }
  }

  const deduped = new Map<string, StructuredTeamProfile>();
  for (const profile of profiles) {
    const key = profile.title.toLowerCase().slice(0, 40);
    if (!deduped.has(key)) deduped.set(key, profile);
  }
  return [...deduped.values()].slice(0, 6);
}

function extractEvaluationCriteria(text: string): StructuredEvaluationCriterion[] {
  const criteria: StructuredEvaluationCriterion[] = [];
  const lines = linesOf(text);

  for (const line of lines) {
    if (!/(critère|critere|note\s+technique|barème|bareme|évaluation|evaluation|pondération|ponderation|méthode\s+de\s+choix)/i.test(line)) {
      continue;
    }
    const pts = line.match(/(\d+)\s*pts?/i);
    const pct = line.match(/(\d+)\s*%/);
    const label = compact(line.split(/[:–-]/)[0] || line, 80);
    const detail = compact(line, 200);
    if (label.length < 4) continue;
    criteria.push({
      label: pts ? `${label} (${pts[1]} pts)` : pct ? `${label} (${pct[1]} %)` : label,
      detail
    });
  }

  if (!criteria.length) {
    const noteTech = text.match(/note\s+technique\s*(?:min\.?)?\s*(\d+)\s*\/\s*(\d+)/i);
    if (noteTech) {
      criteria.push({
        label: `Note technique minimale`,
        detail: `${noteTech[1]}/${noteTech[2]} (éliminatoire si non atteinte)`
      });
    }
    const qualite = text.match(/qualité\s+(?:de\s+la\s+)?(démarche|demarche|équipe|equipe)[^\n]{0,120}/i);
    if (qualite) {
      criteria.push({ label: "Qualité démarche / équipe", detail: compact(qualite[0], 200) });
    }
  }

  return criteria.slice(0, 8);
}

function extractField(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const v = cleanLine(m[1]);
      if (v.length > 2) return v.slice(0, 200);
    }
  }
  return undefined;
}

function parseOpeningDate(text: string): Date | null {
  const months: Record<string, number> = {
    janvier: 0,
    fevrier: 1,
    février: 1,
    mars: 2,
    avril: 3,
    mai: 4,
    juin: 5,
    juillet: 6,
    aout: 7,
    août: 7,
    septembre: 8,
    octobre: 9,
    novembre: 10,
    decembre: 11,
    décembre: 11
  };
  const fr = text.match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/i);
  if (fr) {
    const monthKey = fr[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const month = months[monthKey];
    if (month !== undefined) return new Date(Number(fr[3]), month, Number(fr[1]));
  }
  const slash = text.match(/\b(\d{1,2})[/.\s](\d{1,2})[/.\s](\d{4})\b/);
  if (slash) return new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]));
  return null;
}

function formatFrDate(date: Date) {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function buildActionPlan(text: string, ao: AoRecord): QualificationNextStep[] {
  const opening =
    parseOpeningDate(text) ||
    (ao.dateLimite ? parseOpeningDate(ao.dateLimite) : null);
  if (!opening) {
    return [
      {
        action: "Valider GO en réunion TEC et identifier l'équipe",
        deadline: "À planifier selon date d'ouverture",
        owner: ao.manager || "Manager TEC",
        workflowCommand: `GO ${ao.displayAoNum || ao.aoNum}`
      },
      {
        action: "Collecter attestations de références qualifiantes",
        deadline: "J-15 avant clôture",
        owner: "Bid manager",
        workflowCommand: ""
      },
      {
        action: "Finaliser offre technique et financière",
        deadline: "J-5 avant clôture",
        owner: "Équipe propale",
        workflowCommand: ""
      },
      {
        action: "Dépôt électronique sur portail marchespublics.gov.ma",
        deadline: ao.dateLimite || "Date limite à confirmer",
        owner: "Bid manager",
        workflowCommand: ""
      }
    ];
  }

  const step = (daysBefore: number, action: string, owner: string) => {
    const d = new Date(opening);
    d.setDate(d.getDate() - daysBefore);
    return {
      action,
      deadline: formatFrDate(d),
      owner,
      workflowCommand: daysBefore === 2 ? `GO ${ao.displayAoNum || ao.aoNum}` : ""
    };
  };

  return [
    step(20, "Validation GO en réunion TEC · identification équipe et certifications", ao.manager || "Manager TEC"),
    step(15, "Collecte des attestations de références qualifiantes", "Bid manager"),
    step(10, "Rédaction offre technique (démarche, méthodologie, planning)", "Équipe propale"),
    step(5, "Finalisation offre financière et bordereau des prix", "Manager commercial"),
    step(2, "Dépôt électronique avant clôture", "Bid manager")
  ];
}

function buildFinance(
  budgetHt: number | null,
  teamProfiles: StructuredTeamProfile[],
  referentials: ReferentielItem[]
): QualificationFinanceIndicative {
  const tjmRefs = referentials.filter((item) => item.type === "TJM" && item.active !== "FALSE");
  const pickTjm = (hint: string, fallback: number) => {
    const found = tjmRefs.find((item) => new RegExp(hint, "i").test(item.name));
    return Number(found?.value) || fallback;
  };

  const profileRows: Array<{ profil: string; share: number; tjm: number }> = [];
  if (teamProfiles.length) {
    const shares = teamProfiles.map((_, i) => (i === 0 ? 0.22 : (0.78 / Math.max(teamProfiles.length - 1, 1))));
    teamProfiles.forEach((profile, index) => {
      const lower = profile.title.toLowerCase();
      let tjm = pickTjm("consultant", TJM_DEFAULTS.consultant);
      if (/chef|directeur|senior\s+manager/i.test(lower)) tjm = pickTjm("senior manager|chef", TJM_DEFAULTS["senior manager"]);
      else if (/manager|pmo/i.test(lower)) tjm = pickTjm("manager", TJM_DEFAULTS.manager);
      else if (/architecte|urbaniste|expert/i.test(lower)) tjm = pickTjm("senior|architecte", TJM_DEFAULTS.senior);
      profileRows.push({ profil: profile.title, share: index === 0 ? 0.22 : shares[index] || 0.15, tjm });
    });
  } else {
    profileRows.push(
      { profil: "Chef de projet / Senior Manager", share: 0.22, tjm: pickTjm("senior manager", TJM_DEFAULTS["senior manager"]) },
      { profil: "Architecte / Expert SI", share: 0.35, tjm: pickTjm("senior", TJM_DEFAULTS.senior) },
      { profil: "Consultants", share: 0.43, tjm: pickTjm("consultant", TJM_DEFAULTS.consultant) }
    );
  }

  const totalBudget = budgetHt && budgetHt > 50_000 ? budgetHt : 870_000;
  const rows: QualificationFinanceRow[] = profileRows.map((entry) => {
    const montant = Math.round(totalBudget * entry.share);
    const jours = Math.max(5, Math.round(montant / entry.tjm));
    return {
      phase: "",
      profil: entry.profil,
      jours,
      tjm: `${formatNumber(entry.tjm)} DH HT`,
      montantHt: `${formatNumber(montant)} DH`
    };
  });
  const totalHt = rows.reduce((sum, row) => sum + Number(String(row.montantHt).replace(/[^\d]/g, "")), 0);
  const tva = Math.round(totalHt * 0.2);
  const excessive = budgetHt ? Math.round(budgetHt * 1.2) : null;
  const low = budgetHt ? Math.round(budgetHt * 0.75) : null;

  return {
    rows,
    totalHt: `${formatNumber(totalHt)} DH HT`,
    fees: `${formatNumber(Math.round(totalHt * 0.02))} DH`,
    totalWithFees: `${formatNumber(totalHt)} DH HT · TTC indicatif ${formatNumber(totalHt + tva)} DH`,
    note: [
      budgetHt ? `Estimation client HT ~${formatNumber(budgetHt)} DH.` : "Budget client à confirmer dans le RC.",
      excessive ? `Offre excessive si > ${formatNumber(excessive)} HT.` : "",
      low ? `Offre anormalement basse si < ${formatNumber(low)} HT.` : "",
      "Simulation indicative à valider par le manager (grille TJM Sia Maroc)."
    ]
      .filter(Boolean)
      .join(" ")
  };
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR");
}

function buildIdentification(ao: AoRecord, fiche: QualificationFiche, text: string, meta: ReturnType<typeof extractKeyMetadata>): QualificationIdentification {
  const budgetTtc = extractField(text, [
    /(\d[\d\s]{3,})\s*(?:dh|mad)[^\n]{0,30}ttc/i,
    /(\d[\d\s]{3,})\s*(?:dh|mad)\s*toutes\s+taxes/i
  ]);
  const budgetHt = extractField(text, [/(\d[\d\s]{3,})\s*(?:dh|mad)[^\n]{0,20}ht/i, /estimation[^\n]{0,40}(\d[\d\s]{3,})/i]);
  const cautionnement = extractField(text, [/cautionnement\s+provisoire[^\d]{0,40}(\d[\d\s]+)/i]);
  const duree =
    meta.duree ||
    extractField(text, [/durée\s+d['']exécution[^\d]{0,30}(\d+\s*mois)/i, /(\d+)\s*mois\s*(?:à\s*compter|d['']exécution)/i]);
  const modePassation = extractField(text, [
    /(appel\s+d['']offres\s+ouvert[^\n]{0,80})/i,
    /(procédure\s+[^\n]{0,80})/i,
    /(marché\s+[^\n]{0,60})/i
  ]);
  const sousTraitance = /sous[-\s]?traitance\s+interdite/i.test(text)
    ? "Interdite"
    : /sous[-\s]?traitance\s+autorisée/i.test(text)
      ? "Autorisée"
      : "À confirmer dans le RC";
  const lieu = meta.lieu || extractField(text, [/lieu\s+d['']exécution\s*[:\s]+([^\n.]{3,80})/i]);
  const dateOuverture = extractField(text, [/ouverture\s+des\s+plis[^\n]{0,60}/i, /séance\s+publique[^\n]{0,60}/i]);

  const budgetDisplay =
    fiche.budget && !isPlaceholderSection(fiche.budget)
      ? fiche.budget
      : budgetTtc
        ? `${budgetTtc} TTC`
        : budgetHt
          ? `${budgetHt} HT`
          : meta.budget
            ? meta.budget
            : ao.budget || "NC";

  return {
    reference: ao.sourceNoticeId || ao.displayAoNum || ao.aoNum,
    internalNumber: ao.displayAoNum || ao.aoNum,
    buyer: meta.maitreOuvrage || ao.buyer || ao.client,
    program: extractField(text, [/programme\s*[:\s]+([^\n.]{4,120})/i]) || "À confirmer",
    geography: lieu || ao.country || "Maroc",
    object: compact(fiche.objet || ao.sujet, 200),
    missionType: modePassation || ao.procedureType || "À confirmer",
    duration: duree || fiche.duree || "À confirmer",
    deadline: meta.dateLimite || ao.dateLimite || "À confirmer",
    submission: extractField(text, [/dépôt\s+des\s+offres[^\n]{0,120}/i, /voie\s+électronique[^\n]{0,80}/i]) || "Portail marchespublics.gov.ma",
    budget: budgetDisplay,
    filiales: extractField(text, [/filiale|périmètre\s+entités[^\n]{0,100}/i]) || "À confirmer",
    ecosystemeSI: extractField(text, [/si\s+hétérogène|datacenter|architecture\s+si[^\n]{0,120}/i]) || "À confirmer",
    contacts: meta.emails.length ? meta.emails.join(", ") : "À confirmer",
    mailSubject: `Réponse AO ${ao.displayAoNum || ao.aoNum} — ${ao.client}`,
    confidentiality: /secret\s+professionnel|confidentialité/i.test(text) ? "Secret professionnel / clauses strictes" : "À confirmer dans le RC/CPS"
  };
}

function buildClientInsight(ao: AoRecord, fiche: QualificationFiche, text: string): StructuredClientInsight {
  const org = /office\s+des\s+changes|ministère|établissement\s+public|autorité/i.test(text)
    ? "Établissement public / institution"
    : /ocp|oncf|banque|agence/i.test(text)
      ? "Grand compte stratégique"
      : "Client institutionnel ou privé";
  const missions = extractField(text, [
    /missions?\s*[:\s]+([^\n]{10,200})/i,
    /l['']organisme[^\n]{0,80}(réglementation|contrôle|statistiques)[^\n]{0,120}/i
  ]);
  const context = compact(
    meaningfulSection(fiche.contexte) ? fiche.contexte : extractField(text, [/stratégie\s+\d{4}[^\n]{0,200}/i, /contexte[^\n]{0,200}/i]) || "",
    280
  );
  const stakes = [
    meaningfulSection(fiche.perimetre) ? compact(fiche.perimetre, 160) : "",
    extractField(text, [/enjeux?\s*[:\s]+([^\n]{10,200})/i]) || "",
    /hétérogénéité|interopérabilité|gouvernance|sécurité/i.test(text) ? "Réduire hétérogénéité SI, renforcer gouvernance et sécurité." : ""
  ].filter(Boolean);

  return {
    organizationType: org,
    missions: missions || compact(ao.sujet, 160) || "Missions à préciser dans le RC.",
    projectContext: context || "Contexte projet à confirmer (stratégie SI, parc existant).",
    stakes: stakes[0] || "Enjeux à formaliser à partir du CPS/RC.",
    relationSia: /nouveau\s+client|première\s+collaboration/i.test(text) ? "Nouveau client — cible institutionnelle" : "Relation à qualifier"
  };
}

function meaningfulSection(value: string) {
  return value.trim() && !isPlaceholderSection(value);
}

function buildRisks(fiche: QualificationFiche, text: string): QualificationRisk[] {
  const risks: QualificationRisk[] = [];
  const refLine = text.match(/références?[^\n]{0,200}/i)?.[0];
  if (refLine && /attestation|900|similaire/i.test(refLine)) {
    risks.push({
      label: compact(refLine, 120),
      severity: "Moyen",
      mitigation: "Vérifier le portfolio Sia et préparer ≥ 2 attestations conformes.",
      source: "RC/CPS"
    });
  }
  if (/togaft|togaf|certification/i.test(text)) {
    risks.push({
      label: "Certifications TOGAF / urbanisation exigées",
      severity: "Moyen",
      mitigation: "Cartographier les certificats disponibles côté équipe avant GO.",
      source: "RC"
    });
  }
  if (/prix\s+de\s+référence|offre\s+anormalement/i.test(text)) {
    risks.push({
      label: "Méthode prix de référence / offre anormale",
      severity: "Moyen",
      mitigation: "Positionner l'offre dans la fourchette autorisée (seuils RC).",
      source: "RC"
    });
  }
  if (/sous[-\s]?traitance\s+interdite/i.test(text)) {
    risks.push({
      label: "Sous-traitance interdite",
      severity: "Faible",
      mitigation: "Constituer l'équipe en interne ou groupement conforme au RC.",
      source: "RC"
    });
  }
  fiche.pointsVigilance.forEach((point) => {
    risks.push({
      label: point,
      severity: "Moyen",
      mitigation: "Point à trancher avant engagement.",
      source: "Extraction documentaire"
    });
  });
  if (!risks.length && meaningfulSection(fiche.risques)) {
    risks.push({
      label: compact(fiche.risques, 160),
      severity: "Moyen",
      mitigation: "Analyser la clause et confirmer l'impact commercial.",
      source: "Document chargé"
    });
  }
  return risks.slice(0, 6);
}

function buildBusinessIssues(fiche: QualificationFiche, phases: QualificationMissionPhase[], text: string): string[] {
  const issues = [
    meaningfulSection(fiche.objet) ? `Objet : ${compact(fiche.objet, 140)}` : "",
    phases.length ? `Mission en ${phases.length} phases structurées (urbanisation / transformation SI).` : "",
    meaningfulSection(fiche.criteres) ? `Critères : ${compact(fiche.criteres, 120)}` : "",
    /interopérabilité|hétérogénéité|datacenter/i.test(text) ? "Enjeu SI : réduire l'hétérogénéité et sécuriser l'interopérabilité." : "",
    /gouvernance|togaf|bpmn/i.test(text) ? "Gouvernance SI et référentiels méthodologiques (TOGAF/BPMN) au cœur du dispositif." : ""
  ].filter(Boolean);
  return issues.length ? issues.slice(0, 6) : ["Enjeux métier à confirmer après lecture complète du RC/CPS."];
}

function buildBrief(structured: Omit<StructuredQualification, "briefForLlm">): string {
  const parts = [
    "## Identification",
    `Réf. ${structured.identification.internalNumber} · ${structured.identification.buyer}`,
    `Objet : ${structured.identification.object}`,
    `Budget : ${structured.identification.budget} · Durée : ${structured.identification.duration}`,
    `Échéance : ${structured.identification.deadline} · Lieu : ${structured.identification.geography}`,
    "",
    "## Phases mission",
    ...structured.missionPhases.map((p) => `- ${p.phase} : ${p.objective}`),
    "",
    "## Profils requis",
    ...structured.teamProfiles.map((p) => `- ${p.title} : ${p.requirements}${p.certifications.length ? ` [${p.certifications.join(", ")}]` : ""}`),
    "",
    "## Critères d'évaluation",
    ...structured.evaluationCriteria.map((c) => `- ${c.label} : ${c.detail}`),
    "",
    "## Contexte client",
    `${structured.clientInsight.organizationType} — ${structured.clientInsight.projectContext}`,
    `Enjeux : ${structured.clientInsight.stakes}`,
    "",
    "## Risques",
    ...structured.risks.map((r) => `- [${r.severity}] ${r.label}`)
  ];
  return parts.join("\n").slice(0, 9000);
}

export function buildStructuredQualification(
  ao: AoRecord,
  fiche: QualificationFiche,
  referentials: ReferentielItem[] = []
): StructuredQualification {
  const corpus = [
    fiche.documentExtract || "",
    fiche.objet,
    fiche.perimetre,
    fiche.profils,
    fiche.criteres,
    fiche.livrables,
    fiche.contexte,
    fiche.budget,
    fiche.risques,
    ...(fiche.documents || []).map((d) => d.text)
  ]
    .filter(Boolean)
    .join("\n\n");

  const meta = extractKeyMetadata(corpus);
  const missionPhases = extractPhases(corpus);
  const teamProfiles = extractTeamProfiles(corpus);
  const evaluationCriteria = extractEvaluationCriteria(corpus);
  const identification = buildIdentification(ao, fiche, corpus, meta);
  const clientInsight = buildClientInsight(ao, fiche, corpus);
  const budgetHt =
    parseAmountDh(identification.budget) ||
    parseAmountDh(corpus) ||
    parseAmountDh(fiche.budget || "") ||
    null;
  const financeIndicative = buildFinance(budgetHt, teamProfiles, referentials);
  const actionPlan = buildActionPlan(corpus, ao);
  const risks = buildRisks(fiche, corpus);
  const businessIssues = buildBusinessIssues(fiche, missionPhases, corpus);
  const scopeSynthesis = missionPhases.length
    ? missionPhases.map((p) => `${p.phase} — ${p.objective}`).join(" · ")
    : meaningfulSection(fiche.perimetre)
      ? compact(fiche.perimetre, 400)
      : "Périmètre à confirmer dans le RC/CPS.";
  const executiveSummary = compact(
    `${identification.buyer} — ${identification.object}. ${missionPhases.length ? `${missionPhases.length} phases identifiées.` : ""} Budget indicatif : ${identification.budget}.`,
    320
  );
  const requiredProfileLines = teamProfiles.map(
    (p) => `${p.title} — ${p.requirements}${p.certifications.length ? ` (${p.certifications.join(", ")})` : ""}`
  );

  const core = {
    identification,
    missionPhases,
    teamProfiles,
    evaluationCriteria,
    clientInsight,
    financeIndicative,
    actionPlan,
    risks,
    businessIssues,
    scopeSynthesis,
    executiveSummary,
    requiredProfileLines
  };

  return { ...core, briefForLlm: buildBrief(core) };
}

export function applyStructuredToFiche(fiche: QualificationFiche, structured: StructuredQualification): QualificationFiche {
  const next = { ...fiche };
  if (isPlaceholderSection(next.perimetre) && structured.missionPhases.length) {
    next.perimetre = structured.scopeSynthesis;
  }
  if (isPlaceholderSection(next.profils) && structured.requiredProfileLines.length) {
    next.profils = structured.requiredProfileLines.join("\n");
  }
  if (isPlaceholderSection(next.criteres) && structured.evaluationCriteria.length) {
    next.criteres = structured.evaluationCriteria.map((c) => `${c.label} : ${c.detail}`).join("\n");
  }
  if (isPlaceholderSection(next.contexte) && structured.clientInsight.projectContext) {
    next.contexte = `${structured.clientInsight.organizationType}. ${structured.clientInsight.projectContext}`;
  }
  if (isPlaceholderSection(next.budget) && structured.identification.budget) {
    next.budget = structured.identification.budget;
  }
  if (isPlaceholderSection(next.duree) && structured.identification.duration) {
    next.duree = structured.identification.duration;
  }
  if (isPlaceholderSection(next.objet) && structured.identification.object) {
    next.objet = structured.identification.object;
  }
  return next;
}
