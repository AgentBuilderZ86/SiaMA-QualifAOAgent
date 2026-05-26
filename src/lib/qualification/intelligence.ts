import { delayLabel, urgentByDeadline } from "@/lib/aoDeadline";
import type {
  AoRecord,
  IntelligentQualificationFiche,
  QualificationCalendarEntry,
  QualificationContextHighlight,
  QualificationFiche,
  QualificationFinanceIndicative,
  QualificationKeyQuestion,
  QualificationDecisionWatchpoint,
  QualificationIdentification,
  QualificationManagerRecommendation,
  QualificationMissionPhase,
  QualificationResponseDocument,
  QualificationResponseFormat,
  QualificationResponseSection,
  QualificationRisk,
  QualificationScoreItem,
  QualificationSignal,
  QualificationSlide,
  QualificationNextStep,
  SourcedFact
} from "@/lib/aoTypes";
import type { ReferentielItem, QualificationDocumentKind } from "@/lib/aoTypes";
import type { PatternScoreResult } from "@/lib/qualification/patterns";
import { scoreAoFromPatterns } from "@/lib/qualification/patterns";
import { researchQualificationContext } from "@/lib/qualification/research";
import { isServerlessRuntime } from "@/lib/documents";
import type { DocumentSignals, DocumentSections } from "@/lib/documents";
import { completeChat, hasConfiguredLlm } from "@/lib/llmChat";

function text(value: unknown, fallback = "À confirmer") {
  const cleaned = String(value ?? "").trim();
  return cleaned || fallback;
}

function arrayOfStrings(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => String(item ?? "").trim()).filter(Boolean);
  return items.length ? items : fallback;
}

function arrayOfRecords(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function clampScore(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function recommendationFromScore(score: number): "GO" | "NO GO" | "WATCH" {
  if (score >= 70) return "GO";
  if (score < 45) return "NO GO";
  return "WATCH";
}

function confidenceLevel(value: unknown): "Faible" | "Moyen" | "Élevé" {
  const cleaned = text(value, "Moyen");
  if (cleaned === "Faible" || cleaned === "Élevé") return cleaned;
  return "Moyen";
}

function buildPptCopyBlock(fiche: Omit<IntelligentQualificationFiche, "pptCopyBlock">) {
  return [
    `Synthèse exécutive : ${fiche.executiveSummary}`,
    `Recommandation : ${fiche.recommendation} (${fiche.goNoGoScore}/100, confiance ${fiche.confidenceLevel})`,
    fiche.patternScore
      ? `Score patterns Sia : ${fiche.patternScore.score}/${fiche.patternScore.maxScore} — ${fiche.patternScore.decisionLabel}`
      : "Score patterns Sia : non calculé",
    "",
    "Identification AO :",
    ...(fiche.identification
      ? [
          `- Référence : ${fiche.identification.reference}`,
          `- Maître d'ouvrage : ${fiche.identification.buyer}`,
          `- Objet : ${fiche.identification.object}`,
          `- Date limite : ${fiche.identification.deadline}`,
          `- Budget : ${fiche.identification.budget}`
        ]
      : ["- À confirmer"]),
    "",
    "Périmètre et phases :",
    ...(fiche.missionPhases || []).flatMap((phase) => [`- ${phase.phase} : ${phase.objective}`, ...phase.deliverables.map((item) => `  • ${item}`)]),
    "",
    "Livrables attendus :",
    ...(fiche.expectedDeliverables || ["À confirmer"]).map((item) => `- ${item}`),
    "",
    "Profil requis :",
    ...(fiche.requiredProfile || ["À confirmer"]).map((item) => `- ${item}`),
    "",
    "Enjeux métier :",
    ...fiche.businessIssues.map((item) => `- ${item}`),
    "",
    "Thèmes de gain :",
    ...fiche.winThemes.map((item) => `- ${item}`),
    "",
    "Risques et parades :",
    ...fiche.risks.map((risk) => `- ${risk.label} [${risk.severity}] : ${risk.mitigation}`),
    "",
    "Signaux de qualification :",
    ...(fiche.qualificationSignals || []).map((signal) => `- ${signal.label} [${signal.impact}] : ${signal.detail}${signal.scoreImpact ? ` (${signal.scoreImpact})` : ""}`),
    "",
    "Manager recommandé :",
    ...(fiche.managerRecommendation
      ? [
          `- Principal : ${fiche.managerRecommendation.primaryManager}`,
          `- Co-revue : ${fiche.managerRecommendation.coReviewers.join(", ") || "À confirmer"}`,
          `- Raison : ${fiche.managerRecommendation.rationale}`
        ]
      : ["- À confirmer"]),
    "",
    "Points de vigilance décision :",
    ...(fiche.decisionWatchpoints || []).map((item) => `- ${item.point} [${item.level}] : ${item.question}`),
    "",
    "Questions à clarifier :",
    ...fiche.clarificationQuestions.map((item) => `- ${item}`),
    "",
    "Prochaines étapes :",
    ...(fiche.nextSteps || []).map((step) => `- ${step.deadline} — ${step.action} (${step.owner})${step.workflowCommand ? ` — ${step.workflowCommand}` : ""}`),
    "",
    "Storyboard slides :",
    ...fiche.slideStoryboard.flatMap((slide, index) => [
      `${index + 1}. ${slide.title}`,
      `Message : ${slide.keyMessage}`,
      ...slide.bullets.map((bullet) => `- ${bullet}`),
      `Notes : ${slide.speakerNotes}`
    ]),
    "",
    `Sources : ${fiche.sources.map((source) => source.title).join(", ") || "À confirmer"}`,
    `Hypothèses : ${fiche.assumptions.join("; ") || "Aucune"}`
  ].join("\n");
}

function compactSentence(value: string, max = 260) {
  const cleaned = text(value).replace(/\s+/g, " ");
  return cleaned.length > max ? `${cleaned.slice(0, max).trim()}...` : cleaned;
}

function meaningful(value: string) {
  const cleaned = value.trim();
  return cleaned && cleaned !== "À confirmer" && cleaned !== "NC" && cleaned !== "Non trouvé dans le document.";
}

function documentEvidence(fiche: QualificationFiche) {
  return text(fiche.documentExtract || "Non trouvé dans le document.").slice(0, 6000);
}

function documentSource(fiche: QualificationFiche) {
  return fiche.documentName || "Document chargé";
}

function fallbackBusinessIssues(fiche: QualificationFiche) {
  return [
    meaningful(fiche.objet) ? `Besoin exprimé dans le dossier : ${compactSentence(fiche.objet, 180)}` : "",
    meaningful(fiche.perimetre) ? `Périmètre à cadrer : ${compactSentence(fiche.perimetre, 180)}` : "",
    meaningful(fiche.criteres) ? `Critères d'évaluation à adresser : ${compactSentence(fiche.criteres, 180)}` : "",
    meaningful(fiche.risques) ? `Contraintes à sécuriser : ${compactSentence(fiche.risques, 180)}` : "",
    fiche.pointsVigilance.length ? `Vigilances documentaires : ${fiche.pointsVigilance.join("; ")}` : ""
  ].filter(Boolean);
}

function fallbackWinThemes(fiche: QualificationFiche) {
  return [
    meaningful(fiche.perimetre) ? "Réponse centrée sur le périmètre réellement demandé dans le dossier" : "",
    meaningful(fiche.livrables) ? "Sécurisation des livrables attendus et de leur traçabilité" : "",
    meaningful(fiche.criteres) ? "Alignement explicite sur les critères de notation du document" : "",
    meaningful(fiche.profils) ? "Équipe proposée conforme aux profils et expertises demandés" : "",
    "Questions de clarification ciblées sur les zones non documentées"
  ].filter(Boolean);
}

function fallbackClarificationQuestions(fiche: QualificationFiche) {
  return [
    meaningful(fiche.criteres) ? "Les pondérations et critères de notation sont-ils bien ceux extraits du document ?" : "Quels sont les critères de notation pondérés ?",
    meaningful(fiche.budget) ? "Le budget extrait du document est-il ferme, indicatif ou plafonné ?" : "Le budget cible ou plafond financier est-il confirmé ?",
    meaningful(fiche.duree) ? "Le planning et les jalons extraits du document sont-ils contractuels ?" : "Quel est le calendrier confirmé de soumission et de réalisation ?",
    meaningful(fiche.profils) ? "Les profils requis sont-ils obligatoires ou simplement recommandés ?" : "Quelles références et expertises sont éliminatoires ?",
    meaningful(fiche.risques) ? "Quelles contraintes du dossier peuvent devenir bloquantes pour Sia ?" : "Existe-t-il des contraintes contractuelles ou administratives bloquantes ?"
  ];
}

function fallbackScoreBreakdown(fiche: QualificationFiche): QualificationScoreItem[] {
  return [
    {
      criterion: "Clarté du besoin",
      score: fiche.objet && fiche.objet !== "À confirmer" ? 70 : 35,
      rationale: fiche.objet && fiche.objet !== "À confirmer" ? "Objet de mission identifié dans les éléments fournis." : "Objet insuffisamment documenté.",
      source: fiche.documentName || "Saisie qualification"
    },
    {
      criterion: "Périmètre et livrables",
      score: fiche.perimetre && fiche.livrables ? 65 : 40,
      rationale: "Score basé uniquement sur les champs extraits ou saisis, sans extrapolation.",
      source: fiche.documentName || "Saisie qualification"
    },
    {
      criterion: "Risque commercial",
      score: fiche.risques ? 50 : 60,
      rationale: "Risque à approfondir faute d'éléments concurrentiels et relation client complets.",
      source: "Analyse interne"
    }
  ];
}

function fallbackRisks(fiche: QualificationFiche): QualificationRisk[] {
  const source = documentSource(fiche);
  const risks: QualificationRisk[] = [];
  if (meaningful(fiche.risques)) {
    risks.push({
      label: compactSentence(fiche.risques, 180),
      severity: "Moyen",
      mitigation: "Analyser la clause dans le dossier et confirmer l'impact avant décision GO.",
      source
    });
  }
  fiche.pointsVigilance.forEach((point) => {
    risks.push({
      label: point,
      severity: "Moyen",
      mitigation: "Confirmer ce point avec le client ou dans les pièces AO avant engagement ferme.",
      source
    });
  });
  if (!risks.length) {
    risks.push({
      label: "Risques non identifiés dans l'extrait documentaire disponible",
      severity: "Élevé",
      mitigation: "Faire relire le CPS/RC/Avis complet par le manager avant toute décision GO.",
      source
    });
  }
  return risks;
}

function fallbackSlides(ao: AoRecord, fiche: QualificationFiche): QualificationSlide[] {
  return [
    {
      title: "Synthèse exécutive",
      keyMessage: `Opportunité ${recommendationFromScore(55)} à qualifier pour ${ao.client}.`,
      bullets: [ao.sujet || "Sujet à confirmer", fiche.objet || "Objet à confirmer", fiche.budget || "Budget à confirmer"],
      speakerNotes: "Compléter avec les éléments confirmés du CPS/RC et les arbitrages commerciaux."
    },
    {
      title: "Contexte et enjeux",
      keyMessage: fiche.contexte || "Contexte client à confirmer.",
      bullets: [fiche.contexte || "Contexte à confirmer", fiche.risques || "Risques à confirmer"],
      speakerNotes: "Ne présenter que les faits sourcés ; isoler les hypothèses dans les questions ouvertes."
    },
    {
      title: "Stratégie de réponse",
      keyMessage: "Positionner la réponse sur la clarté du périmètre, la maîtrise des risques et les preuves d'exécution.",
      bullets: ["Clarifier le périmètre", "Sécuriser les prérequis", "Aligner l'équipe et les références"],
      speakerNotes: "Adapter les différenciants aux références réellement disponibles."
    }
  ];
}

function fallbackIdentification(ao: AoRecord, fiche: QualificationFiche): QualificationIdentification {
  return {
    reference: ao.sourceNoticeId || ao.displayAoNum || ao.aoNum,
    internalNumber: ao.displayAoNum || ao.aoNum,
    buyer: ao.buyer || ao.client,
    program: "À confirmer",
    geography: ao.country || "À confirmer",
    object: fiche.objet || ao.sujet,
    missionType: ao.procedureType || "À confirmer",
    duration: fiche.duree || "À confirmer",
    deadline: ao.dateLimite || "À confirmer",
    submission: "À confirmer",
    budget: fiche.budget || ao.budget || "À confirmer",
    filiales: "À confirmer",
    ecosystemeSI: "À confirmer",
    contacts: "À confirmer",
    mailSubject: `Réponse AO ${ao.displayAoNum || ao.aoNum} — ${ao.client || "Client à confirmer"}`,
    confidentiality: "À confirmer dans le RC/CPS"
  };
}

function fallbackContextHighlight(fiche: QualificationFiche): QualificationContextHighlight {
  const problems = [
    meaningful(fiche.risques) ? compactSentence(fiche.risques, 200) : "",
    ...fiche.pointsVigilance.slice(0, 4)
  ].filter(Boolean);
  const objectives = [
    meaningful(fiche.objet) ? compactSentence(fiche.objet, 200) : "",
    meaningful(fiche.perimetre) ? compactSentence(fiche.perimetre, 200) : "",
    meaningful(fiche.livrables) ? compactSentence(fiche.livrables, 200) : ""
  ].filter(Boolean);
  return {
    problems: problems.length ? problems : ["Problèmes à confirmer après lecture détaillée du document."],
    objectives: objectives.length ? objectives : ["Objectifs à confirmer après lecture détaillée du document."],
    keyPoint: meaningful(fiche.contexte)
      ? `Point clé issu du document : ${compactSentence(fiche.contexte, 260)}`
      : "Point clé à confirmer après analyse approfondie du dossier."
  };
}

function fallbackKeyQuestions(fiche: QualificationFiche): QualificationKeyQuestion[] {
  const themes: Array<{ theme: string; vigilance: string; level: QualificationKeyQuestion["level"] }> = [
    {
      theme: meaningful(fiche.perimetre) ? `Approche méthodologique sur le périmètre : ${compactSentence(fiche.perimetre, 120)}` : "Approche méthodologique du périmètre",
      vigilance: "Justifier la démarche et les jalons",
      level: "BLUE"
    },
    {
      theme: meaningful(fiche.criteres) ? `Critères d'évaluation : ${compactSentence(fiche.criteres, 120)}` : "Critères d'évaluation pondérés",
      vigilance: "⭐ Cœur de l'évaluation",
      level: "GO"
    },
    {
      theme: "Références similaires (secteur, taille, stack)",
      vigilance: "Contacts vérifiables requis",
      level: "WARN"
    },
    {
      theme: "Équipe et CVs des profils mobilisés",
      vigilance: meaningful(fiche.profils) ? "CVs obligatoires en annexe" : "Profils à valider",
      level: "WARN"
    },
    {
      theme: "Planning et jalons de la mission",
      vigilance: meaningful(fiche.duree) ? "Aligner sur le délai contractuel" : "Délai à confirmer",
      level: "BLUE"
    },
    {
      theme: meaningful(fiche.livrables) ? `Livrables attendus : ${compactSentence(fiche.livrables, 120)}` : "Livrables et restitutions attendues",
      vigilance: "Détailler le format des livrables",
      level: "BLUE"
    },
    {
      theme: meaningful(fiche.budget) ? `Proposition financière (budget : ${compactSentence(fiche.budget, 80)})` : "Proposition financière JH/profils",
      vigilance: "Préciser la décomposition par phase",
      level: "WARN"
    },
    {
      theme: "Gestion des risques et plan de mitigation",
      vigilance: "Risques + parades",
      level: "BLUE"
    },
    {
      theme: "Gouvernance, qualité et conformité (RGPD si applicable)",
      vigilance: "Classification + conformité",
      level: "BLUE"
    },
    {
      theme: "Transfert de compétences post-mission",
      vigilance: "Autonomie client à organiser",
      level: "GRAY"
    }
  ];
  return themes.map((item, index) => ({
    index: index + 1,
    theme: item.theme,
    vigilance: item.vigilance,
    level: item.level
  }));
}

function fallbackCalendar(ao: AoRecord): QualificationCalendarEntry[] {
  const deadlineDays = ao.delaiJours;
  const deadlineLabel =
    deadlineDays !== null && deadlineDays !== undefined && !Number.isNaN(deadlineDays)
      ? delayLabel(deadlineDays)
      : ao.dateLimite || "J+?";
  return [
    { dayLabel: "J", label: "Lancement officiel — réception du dossier de consultation", milestone: null },
    { dayLabel: "J+5", label: "Constitution de l'équipe propale et ouverture du dossier interne", milestone: null },
    { dayLabel: "J+10", label: "Date limite des questions des candidats", milestone: null },
    { dayLabel: "J+15", label: "Réponses Q&A diffusées simultanément à tous les candidats", milestone: null },
    {
      dayLabel: deadlineLabel,
      label: "Date limite remise des offres — PDF + PPT soutenance + Excel financier",
      milestone: "deadline"
    },
    { dayLabel: "J+10→J+20", label: "Rédaction et revue interne du dossier technique", milestone: null },
    { dayLabel: "J+30→J+40", label: "Analyse interne client et scoring des offres", milestone: null },
    { dayLabel: "J+45", label: "Soutenance orale (shortlist 2-3 cabinets)", milestone: "soutenance" },
    { dayLabel: "J+55", label: "Notification du cabinet retenu et négociation contractuelle", milestone: null },
    { dayLabel: "J+70", label: "Démarrage mission — Kick-off officiel", milestone: "kickoff" }
  ];
}

function fallbackResponseFormat(fiche: QualificationFiche): QualificationResponseFormat {
  const documents: QualificationResponseDocument[] = [
    {
      label: "Dossier Technique",
      format: "PDF",
      detail: meaningful(fiche.livrables) ? "Document détaillé avec annexes et CVs" : "Document détaillé (max 60 pages hors annexes)",
      isStarred: true
    },
    {
      label: "Présentation soutenance",
      format: "PPT",
      detail: "15-20 slides pour soutenance orale (à anticiper)"
    },
    {
      label: "Dossier Financier",
      format: "Excel",
      detail: "JH par phase + TJM + TCO si applicable"
    },
    {
      label: "Dossier Administratif",
      format: "PDF",
      detail: "Statuts, bilans, attestations fiscales, ESG"
    }
  ];
  const technicalSections: QualificationResponseSection[] = [
    { number: 1, title: "Synthèse exécutive (2 pages max)" },
    { number: 2, title: "Compréhension contexte et reformulation des enjeux" },
    { number: 3, title: "Approche et méthodologie" },
    { number: 4, title: "Architecture technique cible et justification", isStarred: true },
    { number: 5, title: "Plan de gouvernance et qualité", isStarred: true },
    { number: 6, title: "Planning et organisation équipe" },
    { number: 7, title: "Références clients similaires" },
    { number: 8, title: "Proposition financière et annexes (CVs)" }
  ];
  return { documents, technicalSections };
}

function formatNumber(value: number) {
  return value.toLocaleString("fr-FR");
}

function fallbackFinanceIndicative(ao: AoRecord, fiche: QualificationFiche, referentials: ReferentielItem[]): QualificationFinanceIndicative {
  const tjmRefs = referentials.filter((item) => item.type === "TJM" && item.active !== "FALSE");
  const tjmConsultant = Number(tjmRefs.find((item) => /consultant/i.test(item.name))?.value) || 6000;
  const tjmManager = Number(tjmRefs.find((item) => /manager|chef projet|senior manager/i.test(item.name))?.value) || 8000;
  const tjmAvg = Math.round((tjmConsultant + tjmManager) / 2);
  const totalDays = ao.delaiJours && ao.delaiJours > 0 ? Math.max(40, Math.round(ao.delaiJours * 0.6)) : 60;
  const phasesShare = [
    { phase: "Phase 1 — Diagnostic & Cadrage", profil: "Senior Manager + Consultant", share: 0.2, tjm: tjmManager },
    { phase: "Phase 2 — Conception & Mise en œuvre", profil: "Consultants + Expert", share: 0.45, tjm: tjmAvg },
    { phase: "Phase 3 — Gouvernance & Qualité", profil: "Senior Manager + Consultant", share: 0.25, tjm: tjmAvg },
    { phase: "Phase 4 — Formation & Transfert", profil: "Consultant + Expert", share: 0.1, tjm: tjmConsultant }
  ];
  const rows = phasesShare.map((entry) => {
    const jours = Math.max(5, Math.round(totalDays * entry.share));
    const montant = jours * entry.tjm;
    return {
      phase: entry.phase,
      profil: entry.profil,
      jours,
      tjm: `${formatNumber(entry.tjm)} DH HT`,
      montantHt: `${formatNumber(montant)} DH`
    };
  });
  const totalHt = rows.reduce((sum, row) => sum + Number(String(row.montantHt).replace(/[^\d]/g, "")), 0);
  const fees = Math.round(totalHt * 0.07);
  return {
    rows,
    totalHt: `${formatNumber(totalHt)} DH HT`,
    fees: `${formatNumber(fees)} DH`,
    totalWithFees: `${formatNumber(totalHt + fees)} DH HT`,
    note: meaningful(fiche.budget)
      ? `Simulation indicative basée sur les TJM référentiels Sia Maroc — budget annoncé : ${compactSentence(fiche.budget, 80)}.`
      : "Simulation indicative basée sur les TJM référentiels Sia Maroc à valider par le manager."
  };
}

function fallbackMissionPhases(fiche: QualificationFiche): QualificationMissionPhase[] {
  return [
    {
      phase: "1. Cadrage et qualification",
      objective: fiche.perimetre || "Clarifier le périmètre, les livrables et les critères de décision.",
      deliverables: [fiche.livrables || "Livrables à confirmer"]
    },
    {
      phase: "2. Préparation de la réponse",
      objective: "Structurer l'approche, l'équipe, les références et les hypothèses financières.",
      deliverables: ["Note méthodologique", "Planning", "Équipe et références"]
    },
    {
      phase: "3. Arbitrage GO/NO GO",
      objective: "Trancher les prérequis bloquants avant mobilisation commerciale.",
      deliverables: ["Questions de clarification", "Décision manager", "Plan d'action"]
    }
  ];
}

function fallbackSignals(ao: AoRecord, fiche: QualificationFiche): QualificationSignal[] {
  return [
    {
      label: "Besoin identifié",
      detail: fiche.objet || ao.sujet || "Objet de mission à confirmer.",
      impact: fiche.objet || ao.sujet ? "Positif" : "Attention",
      scoreImpact: fiche.objet || ao.sujet ? "+ signal besoin" : "à qualifier",
      source: fiche.documentName || ao.sourceName || "Données AO"
    },
    {
      label: "Budget et modèle économique",
      detail: fiche.budget || ao.budget || "Budget non confirmé dans les données disponibles.",
      impact: fiche.budget || ao.budget ? "Attention" : "Bloquant",
      source: fiche.documentName || "Données AO"
    },
    {
      label: "Délai de réponse",
      detail:
        ao.delaiJours !== null && ao.delaiJours !== undefined
          ? ao.delaiJours < 0
            ? "Échéance dépassée — vérifier prorogation ou clôturer le dossier."
            : `${ao.delaiJours} jours restants`
          : ao.dateLimite || "Date limite à confirmer.",
      impact: urgentByDeadline(ao) ? "Attention" : ao.delaiJours !== null && ao.delaiJours < 0 ? "Bloquant" : "Neutre",
      source: ao.sourceName || "Données AO"
    }
  ];
}

function fallbackManagerRecommendation(ao: AoRecord): QualificationManagerRecommendation {
  return {
    primaryManager: ao.manager || "À confirmer",
    coReviewers: [],
    rationale: "Manager issu des données AO ou à confirmer selon secteur, disponibilité et références nécessaires.",
    decisionOwner: ao.manager || "Manager à confirmer"
  };
}

function fallbackWatchpoints(ao: AoRecord, fiche: QualificationFiche): QualificationDecisionWatchpoint[] {
  return [
    {
      point: "Critères de notation et pièces obligatoires",
      level: "Critique",
      question: "Les critères pondérés, pièces administratives et exigences éliminatoires sont-ils confirmés ?"
    },
    {
      point: "Budget et rentabilité",
      level: fiche.budget || ao.budget ? "À évaluer" : "Critique",
      question: "Le budget permet-il une offre rentable avec les profils requis ?"
    },
    {
      point: "Références et disponibilité équipe",
      level: "À évaluer",
      question: "Dispose-t-on de références et profils mobilisables correspondant au périmètre ?"
    }
  ];
}

function fallbackNextSteps(ao: AoRecord): QualificationNextStep[] {
  return [
    {
      action: "Valider GO/NO GO avec le manager",
      deadline: urgentByDeadline(ao)
        ? "Aujourd'hui / J+1"
        : ao.delaiJours !== null && ao.delaiJours !== undefined && ao.delaiJours < 0
          ? "Échue — arbitrage"
          : "À planifier",
      owner: ao.manager || "Manager à confirmer",
      workflowCommand: `GO ${ao.displayAoNum || ao.aoNum}`
    },
    {
      action: "Collecter les pièces AO et questions de clarification",
      deadline: "Avant P2P",
      owner: "Bid manager",
      workflowCommand: `P2P ${ao.displayAoNum || ao.aoNum}`
    },
    {
      action: "Préparer la note méthodologique et la simulation financière",
      deadline: "Après décision GO",
      owner: "Équipe propale",
      workflowCommand: `section approche ${ao.displayAoNum || ao.aoNum}`
    }
  ];
}

export function buildFallbackIntelligence(
  ao: AoRecord,
  fiche: QualificationFiche,
  sources: SourcedFact[],
  assumptions: string[] = [],
  options: { patternScore?: PatternScoreResult; referentials?: ReferentielItem[] } = {}
): IntelligentQualificationFiche {
  const scoreBreakdown = fallbackScoreBreakdown(fiche);
  const goNoGoScore = Math.round(scoreBreakdown.reduce((sum, item) => sum + item.score, 0) / scoreBreakdown.length);
  const recommendation = recommendationFromScore(goNoGoScore);
  const risks = fallbackRisks(fiche);
  const businessIssues = fallbackBusinessIssues(fiche);
  const winThemes = fallbackWinThemes(fiche);
  const clarificationQuestions = fallbackClarificationQuestions(fiche);
  const patternScore = options.patternScore;
  const managerFallback = fallbackManagerRecommendation(ao);
  const managerRecommendation = patternScore && patternScore.recommendedManager
    ? {
        primaryManager: patternScore.recommendedManager.name,
        coReviewers: managerFallback.coReviewers,
        rationale: `Manager recommandé par le moteur patterns (${patternScore.activated.map((hit) => hit.reason).join(" ; ") || "Pattern Sia"}).`,
        decisionOwner: patternScore.recommendedManager.name
      }
    : managerFallback;
  const signals = fallbackSignals(ao, fiche);
  if (patternScore) {
    patternScore.activated.forEach((hit) => {
      signals.push({
        label: `Pattern Sia activé — ${hit.patternId.toUpperCase()}`,
        detail: `${hit.reason} (mots-clés : ${hit.hits.slice(0, 4).join(", ") || "n/a"}).`,
        impact: "Positif",
        scoreImpact: `+${hit.score ?? 0} pts patterns`,
        source: "Moteur patterns Sia"
      });
    });
    patternScore.blocking.forEach((hit) => {
      signals.push({
        label: `Signal NO GO — ${hit.patternId.toUpperCase()}`,
        detail: hit.reason,
        impact: "Bloquant",
        scoreImpact: "Bloquant",
        source: "Moteur patterns Sia"
      });
    });
  }
  const base = {
    executiveSummary: compactSentence(`L'opportunité ${ao.displayAoNum || ao.aoNum} pour ${ao.client} porte sur ${ao.sujet}. La qualification s'appuie sur l'extrait documentaire ${documentSource(fiche)} ; les informations non présentes dans ce document restent à confirmer.`),
    clientContext: compactSentence(meaningful(fiche.contexte) ? fiche.contexte : `Contexte client non trouvé explicitement dans ${documentSource(fiche)}.`),
    businessIssues: businessIssues.length ? businessIssues : ["Enjeux métier à générer par LLM après lecture du document chargé."],
    scopeSynthesis: compactSentence(meaningful(fiche.perimetre) ? fiche.perimetre : `Périmètre non trouvé explicitement dans ${documentSource(fiche)}.`),
    winThemes: winThemes.length ? winThemes : ["Win themes à générer par LLM à partir des critères et attentes du document chargé."],
    goNoGoScore,
    scoreBreakdown,
    recommendation,
    confidenceLevel: sources.length > 2 ? ("Moyen" as const) : ("Faible" as const),
    risks,
    clarificationQuestions,
    responseStrategy: "Clarifier les points bloquants, confirmer le budget/planning, puis construire une réponse centrée sur les preuves d'exécution.",
    differentiators: ["Approche structurée", "Mobilisation d'expertises ciblées", "Traçabilité des hypothèses et sources"],
    slideStoryboard: fallbackSlides(ao, fiche),
    sources,
    assumptions,
    generatedAt: new Date().toISOString(),
    identification: fallbackIdentification(ao, fiche),
    missionPhases: fallbackMissionPhases(fiche),
    expectedDeliverables: [fiche.livrables || "Livrables à confirmer"],
    requiredProfile: [fiche.profils || "Profils requis à confirmer", fiche.criteres || "Critères de qualification à confirmer"],
    qualificationSignals: signals,
    managerRecommendation,
    decisionWatchpoints: fallbackWatchpoints(ao, fiche),
    nextSteps: fallbackNextSteps(ao),
    patternScore,
    contextHighlight: fallbackContextHighlight(fiche),
    keyQuestions: fallbackKeyQuestions(fiche),
    aoCalendar: fallbackCalendar(ao),
    responseFormat: fallbackResponseFormat(fiche),
    financeIndicative: fallbackFinanceIndicative(ao, fiche, options.referentials || [])
  };
  return { ...base, pptCopyBlock: buildPptCopyBlock(base) };
}

function parseJsonObject(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || value;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeIdentification(raw: unknown, fallback: QualificationIdentification): QualificationIdentification {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    reference: text(record.reference, fallback.reference),
    internalNumber: text(record.internalNumber, fallback.internalNumber),
    buyer: text(record.buyer, fallback.buyer),
    program: text(record.program, fallback.program),
    geography: text(record.geography, fallback.geography),
    object: text(record.object, fallback.object),
    missionType: text(record.missionType, fallback.missionType),
    duration: text(record.duration, fallback.duration),
    deadline: text(record.deadline, fallback.deadline),
    submission: text(record.submission, fallback.submission),
    budget: text(record.budget, fallback.budget),
    filiales: text(record.filiales, fallback.filiales || "À confirmer"),
    ecosystemeSI: text(record.ecosystemeSI, fallback.ecosystemeSI || "À confirmer"),
    contacts: text(record.contacts, fallback.contacts || "À confirmer"),
    mailSubject: text(record.mailSubject, fallback.mailSubject || "À confirmer"),
    confidentiality: text(record.confidentiality, fallback.confidentiality || "À confirmer")
  };
}

function normalizeContextHighlight(raw: unknown, fallback: QualificationContextHighlight): QualificationContextHighlight {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    problems: arrayOfStrings(record.problems, fallback.problems),
    objectives: arrayOfStrings(record.objectives, fallback.objectives),
    keyPoint: text(record.keyPoint, fallback.keyPoint)
  };
}

function normalizeKeyQuestions(raw: unknown, fallback: QualificationKeyQuestion[]) {
  const items = arrayOfRecords(raw).map((record, index) => {
    const levelRaw = text(record.level, "BLUE").toUpperCase();
    const level: QualificationKeyQuestion["level"] = levelRaw === "GO" || levelRaw === "WARN" || levelRaw === "GRAY" ? (levelRaw as QualificationKeyQuestion["level"]) : "BLUE";
    return {
      index: Number(record.index) || index + 1,
      theme: text(record.theme),
      vigilance: text(record.vigilance),
      level
    } satisfies QualificationKeyQuestion;
  });
  return items.length ? items : fallback;
}

function normalizeCalendar(raw: unknown, fallback: QualificationCalendarEntry[]) {
  const items = arrayOfRecords(raw).map((record) => {
    const milestoneRaw = text(record.milestone, "");
    const milestone = milestoneRaw === "deadline" || milestoneRaw === "kickoff" || milestoneRaw === "soutenance" ? milestoneRaw : null;
    return {
      dayLabel: text(record.dayLabel),
      label: text(record.label),
      milestone
    } satisfies QualificationCalendarEntry;
  });
  return items.length ? items : fallback;
}

function normalizeResponseFormat(raw: unknown, fallback: QualificationResponseFormat): QualificationResponseFormat {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const documents: QualificationResponseDocument[] = arrayOfRecords(record.documents).map((doc) => ({
    label: text(doc.label),
    format: text(doc.format),
    detail: text(doc.detail),
    isStarred: Boolean(doc.isStarred)
  }));
  const technicalSections: QualificationResponseSection[] = arrayOfRecords(record.technicalSections).map((sec, index) => ({
    number: Number(sec.number) || index + 1,
    title: text(sec.title),
    isStarred: Boolean(sec.isStarred)
  }));
  return {
    documents: documents.length ? documents : fallback.documents,
    technicalSections: technicalSections.length ? technicalSections : fallback.technicalSections
  };
}

function normalizeFinanceIndicative(raw: unknown, fallback: QualificationFinanceIndicative): QualificationFinanceIndicative {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rows = arrayOfRecords(record.rows).map((row) => ({
    phase: text(row.phase),
    profil: text(row.profil),
    jours: row.jours as number | string,
    tjm: row.tjm as number | string,
    montantHt: row.montantHt as number | string
  }));
  return {
    rows: rows.length ? rows : fallback.rows,
    totalHt: text(record.totalHt, fallback.totalHt),
    totalWithFees: text(record.totalWithFees, fallback.totalWithFees),
    fees: text(record.fees, fallback.fees),
    note: text(record.note, fallback.note)
  };
}

function normalizeMissionPhases(raw: unknown, fallback: QualificationMissionPhase[]) {
  const items = arrayOfRecords(raw).map((record) => ({
    phase: text(record.phase),
    objective: text(record.objective),
    deliverables: arrayOfStrings(record.deliverables, ["À confirmer"])
  }));
  return items.length ? items : fallback;
}

function normalizeSignals(raw: unknown, fallback: QualificationSignal[]) {
  const items = arrayOfRecords(raw).map((record) => {
    const impact = text(record.impact, "Attention");
    return {
      label: text(record.label),
      detail: text(record.detail),
      impact: impact === "Positif" || impact === "Bloquant" || impact === "Neutre" ? impact : "Attention",
      scoreImpact: text(record.scoreImpact, ""),
      source: text(record.source, "Analyse LLM")
    } satisfies QualificationSignal;
  });
  return items.length ? items : fallback;
}

function normalizeManagerRecommendation(raw: unknown, fallback: QualificationManagerRecommendation): QualificationManagerRecommendation {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    primaryManager: text(record.primaryManager, fallback.primaryManager),
    coReviewers: arrayOfStrings(record.coReviewers, fallback.coReviewers),
    rationale: text(record.rationale, fallback.rationale),
    decisionOwner: text(record.decisionOwner, fallback.decisionOwner)
  };
}

function normalizeWatchpoints(raw: unknown, fallback: QualificationDecisionWatchpoint[]) {
  const items = arrayOfRecords(raw).map((record) => {
    const level = text(record.level, "À évaluer");
    return {
      point: text(record.point),
      level: level === "Opportunité" || level === "Critique" || level === "Éliminatoire" ? level : "À évaluer",
      question: text(record.question)
    } satisfies QualificationDecisionWatchpoint;
  });
  return items.length ? items : fallback;
}

function normalizeNextSteps(raw: unknown, fallback: QualificationNextStep[]) {
  const items = arrayOfRecords(raw).map((record) => ({
    action: text(record.action),
    deadline: text(record.deadline),
    owner: text(record.owner),
    workflowCommand: text(record.workflowCommand, "")
  }));
  return items.length ? items : fallback;
}

function normalizeIntelligence(
  ao: AoRecord,
  fiche: QualificationFiche,
  raw: Record<string, unknown> | null,
  sources: SourcedFact[],
  assumptions: string[],
  options: { patternScore?: PatternScoreResult; referentials?: ReferentielItem[] } = {}
): IntelligentQualificationFiche {
  const fallback = buildFallbackIntelligence(ao, fiche, sources, assumptions, options);
  if (!raw) return fallback;
  const scoreBreakdown = Array.isArray(raw.scoreBreakdown)
    ? raw.scoreBreakdown.map((item) => {
        const record = item as Record<string, unknown>;
        return {
          criterion: text(record.criterion),
          score: clampScore(record.score),
          rationale: text(record.rationale),
          source: text(record.source, "Analyse LLM")
        };
      })
    : fallback.scoreBreakdown;
  const risks = Array.isArray(raw.risks)
    ? raw.risks.map((item) => {
        const record = item as Record<string, unknown>;
        const severity = text(record.severity, "Moyen");
        return {
          label: text(record.label),
          severity: severity === "Faible" || severity === "Élevé" ? severity : "Moyen",
          mitigation: text(record.mitigation),
          source: text(record.source, "Analyse LLM")
        } satisfies QualificationRisk;
      })
    : fallback.risks;
  const slideStoryboard = Array.isArray(raw.slideStoryboard)
    ? raw.slideStoryboard.map((item) => {
        const record = item as Record<string, unknown>;
        return {
          title: text(record.title),
          keyMessage: text(record.keyMessage),
          bullets: arrayOfStrings(record.bullets, ["À confirmer"]),
          speakerNotes: text(record.speakerNotes)
        };
      })
    : fallback.slideStoryboard;
  const goNoGoScore = clampScore(raw.goNoGoScore ?? fallback.goNoGoScore);
  const recommendationRaw = text(raw.recommendation, recommendationFromScore(goNoGoScore));
  const recommendation = recommendationRaw === "GO" || recommendationRaw === "NO GO" || recommendationRaw === "WATCH" ? recommendationRaw : recommendationFromScore(goNoGoScore);
  const base = {
    executiveSummary: text(raw.executiveSummary, fallback.executiveSummary),
    clientContext: text(raw.clientContext, fallback.clientContext),
    businessIssues: arrayOfStrings(raw.businessIssues, fallback.businessIssues),
    scopeSynthesis: text(raw.scopeSynthesis, fallback.scopeSynthesis),
    winThemes: arrayOfStrings(raw.winThemes, fallback.winThemes),
    goNoGoScore,
    scoreBreakdown,
    recommendation,
    confidenceLevel: confidenceLevel(raw.confidenceLevel || fallback.confidenceLevel),
    risks,
    clarificationQuestions: arrayOfStrings(raw.clarificationQuestions, fallback.clarificationQuestions),
    responseStrategy: text(raw.responseStrategy, fallback.responseStrategy),
    differentiators: arrayOfStrings(raw.differentiators, fallback.differentiators),
    slideStoryboard,
    sources,
    assumptions: arrayOfStrings(raw.assumptions, assumptions.length ? assumptions : fallback.assumptions),
    generatedAt: new Date().toISOString(),
    identification: normalizeIdentification(raw.identification, fallback.identification || fallbackIdentification(ao, fiche)),
    missionPhases: normalizeMissionPhases(raw.missionPhases, fallback.missionPhases || fallbackMissionPhases(fiche)),
    expectedDeliverables: arrayOfStrings(raw.expectedDeliverables, fallback.expectedDeliverables || [fiche.livrables || "Livrables à confirmer"]),
    requiredProfile: arrayOfStrings(raw.requiredProfile, fallback.requiredProfile || [fiche.profils || "Profils requis à confirmer"]),
    qualificationSignals: normalizeSignals(raw.qualificationSignals, fallback.qualificationSignals || fallbackSignals(ao, fiche)),
    managerRecommendation: normalizeManagerRecommendation(raw.managerRecommendation, fallback.managerRecommendation || fallbackManagerRecommendation(ao)),
    decisionWatchpoints: normalizeWatchpoints(raw.decisionWatchpoints, fallback.decisionWatchpoints || fallbackWatchpoints(ao, fiche)),
    nextSteps: normalizeNextSteps(raw.nextSteps, fallback.nextSteps || fallbackNextSteps(ao)),
    patternScore: options.patternScore ?? fallback.patternScore,
    contextHighlight: normalizeContextHighlight(raw.contextHighlight, fallback.contextHighlight || fallbackContextHighlight(fiche)),
    keyQuestions: normalizeKeyQuestions(raw.keyQuestions, fallback.keyQuestions || fallbackKeyQuestions(fiche)),
    aoCalendar: normalizeCalendar(raw.aoCalendar, fallback.aoCalendar || fallbackCalendar(ao)),
    responseFormat: normalizeResponseFormat(raw.responseFormat, fallback.responseFormat || fallbackResponseFormat(fiche)),
    financeIndicative: normalizeFinanceIndicative(raw.financeIndicative, fallback.financeIndicative || fallbackFinanceIndicative(ao, fiche, options.referentials || []))
  };
  if (options.patternScore && options.patternScore.recommendedManager && (!base.managerRecommendation.primaryManager || base.managerRecommendation.primaryManager === "À confirmer")) {
    base.managerRecommendation = {
      ...base.managerRecommendation,
      primaryManager: options.patternScore.recommendedManager.name,
      decisionOwner: options.patternScore.recommendedManager.name
    };
  }
  return { ...base, pptCopyBlock: text(raw.pptCopyBlock, buildPptCopyBlock(base)) };
}

type PerDocSection = {
  kind: QualificationDocumentKind;
  name: string;
  sections: DocumentSections;
  signals: DocumentSignals;
};

async function callQualificationLlm(
  ao: AoRecord,
  fiche: QualificationFiche,
  sources: SourcedFact[],
  referentials: ReferentielItem[],
  patternScore: PatternScoreResult | undefined,
  perDocSections?: PerDocSection[]
) {
  if (!hasConfiguredLlm()) return null;

  const system = [
            "Tu es un directeur de mission conseil senior chez Sia Partners Maroc.",
            "Tu produis une fiche de qualification opérationnelle V8 pour comité GO/WATCH/NO GO, au niveau d'une note manager exploitable.",
            "Le contenu doit être riche, spécifique au dossier, orienté décision et préparation de réponse.",
            "Structure l'analyse comme une fiche AO complète : identification, contexte, périmètre/phases, livrables, profil requis, signaux, manager recommandé, points de vigilance, prochaines étapes.",
            "Règle prioritaire : clientContext, scopeSynthesis, businessIssues, winThemes, risks et clarificationQuestions doivent être générés par ton analyse du document chargé.",
            "Ne recopie pas mécaniquement les champs extractifs ; reformule-les en analyse métier exploitable et rattache chaque point au document chargé quand l'information y est présente.",
            "Les sources web et référentiels servent uniquement à enrichir ou challenger l'analyse documentaire, jamais à remplacer le document chargé.",
            "N'invente aucun chiffre, fait, référence ou concurrent.",
            "Les dates, budgets, volumes JH, TJM et scores doivent venir des données fournies, des référentiels transmis, ou être marqués À confirmer / indicatif.",
            "Sépare faits sourcés, analyse et hypothèses à confirmer.",
            "Si une information manque, conserve la rubrique et écris À confirmer plutôt que de remplir artificiellement.",
            "Tu dois également produire contextHighlight (problèmes/objectifs/keyPoint), keyQuestions (10 questions clés numérotées avec niveau GO/WARN/BLUE/GRAY), aoCalendar (étapes J, J+5, ... deadline, kickoff), responseFormat (documents PDF/PPT/Excel + sections techniques) et financeIndicative (simulation à partir des TJM référentiels).",
            "Le payload contient un patternScoring : intègre le manager recommandé et les patterns activés dans tes signaux et ta recommandation, sans inventer de patterns supplémentaires.",
            "Retourne exclusivement un JSON valide."
  ].join(" ");

  const user = JSON.stringify({
            expectedSchema: {
              executiveSummary: "string, synthèse décisionnelle précise",
              identification: {
                reference: "string",
                internalNumber: "string",
                buyer: "string",
                program: "string",
                geography: "string",
                object: "string",
                missionType: "string",
                duration: "string",
                deadline: "string",
                submission: "string",
                budget: "string",
                filiales: "string, filiales ou périmètre géographique des entités concernées",
                ecosystemeSI: "string, outils SI mentionnés dans le document (SAP, CRM, ERP, etc.)",
                contacts: "string, emails ou noms des personnes contact pour la soumission",
                mailSubject: "string, objet mail imposé pour la soumission si mentionné",
                confidentiality: "string, NDA ou clause de confidentialité mentionnée"
              },
              clientContext: "string, analyse LLM du contexte client à partir du document chargé ; citer À confirmer si absent du document",
              businessIssues: ["4-6 enjeux métier générés par LLM depuis les besoins, objectifs, contraintes et critères du document chargé"],
              scopeSynthesis: "string, synthèse LLM du périmètre réel demandé dans le document chargé",
              missionPhases: [{ phase: "string", objective: "string", deliverables: ["string"] }],
              expectedDeliverables: ["livrables attendus"],
              requiredProfile: ["exigences de profil / références / langues / certifications"],
              winThemes: ["4-6 angles de gain déduits par LLM du document chargé, des critères et des livrables attendus"],
              goNoGoScore: "number 0-100",
              scoreBreakdown: [{ criterion: "string", score: "number 0-100", rationale: "string", source: "string" }],
              recommendation: "GO | NO GO | WATCH",
              confidenceLevel: "Faible | Moyen | Élevé",
              risks: [{ label: "string issu de l'analyse du document chargé", severity: "Faible | Moyen | Élevé", mitigation: "string", source: "string, document ou À confirmer" }],
              qualificationSignals: [{ label: "string", detail: "string", impact: "Positif | Attention | Bloquant | Neutre", scoreImpact: "string", source: "string" }],
              managerRecommendation: { primaryManager: "string", coReviewers: ["string"], rationale: "string", decisionOwner: "string" },
              decisionWatchpoints: [{ point: "string", level: "Opportunité | À évaluer | Critique | Éliminatoire", question: "string" }],
              clarificationQuestions: ["questions concrètes générées par LLM depuis les manques, ambiguïtés ou contraintes du document chargé"],
              responseStrategy: "string, stratégie de réponse concrète",
              differentiators: ["différenciants activables"],
              nextSteps: [{ action: "string", deadline: "string", owner: "string", workflowCommand: "string" }],
              slideStoryboard: [{ title: "string", keyMessage: "string", bullets: ["string"], speakerNotes: "string" }],
              pptCopyBlock: "string structuré en sections copiable dans PowerPoint",
              assumptions: ["string"],
              contextHighlight: {
                problems: ["3-5 problèmes/contraintes documentés"],
                objectives: ["3-5 objectifs documentés"],
                keyPoint: "string, point clé décisif issu du document"
              },
              keyQuestions: [
                {
                  index: "number 1..10",
                  theme: "string, thème de la question issue du document",
                  vigilance: "string, point de vigilance (ex: ⭐ critère majeur)",
                  level: "GO | WARN | BLUE | GRAY"
                }
              ],
              aoCalendar: [{ dayLabel: "string ex J ou J+10", label: "string étape", milestone: "deadline | kickoff | soutenance | null" }],
              responseFormat: {
                documents: [{ label: "string", format: "PDF | PPT | Excel | autre", detail: "string", isStarred: "boolean" }],
                technicalSections: [{ number: "number", title: "string", isStarred: "boolean" }]
              },
              financeIndicative: {
                rows: [{ phase: "string", profil: "string", jours: "number", tjm: "string ou number", montantHt: "string ou number" }],
                totalHt: "string DH HT",
                fees: "string DH",
                totalWithFees: "string DH HT",
                note: "string"
              }
            },
            ao,
            documentAnalysis: {
              documentName: fiche.documentName || "Aucun document nommé",
              extractionStatus: fiche.extractionStatus,
              documentExtract: documentEvidence(fiche),
              extractedSections: {
                contexte: fiche.contexte,
                objet: fiche.objet,
                perimetre: fiche.perimetre,
                livrables: fiche.livrables,
                duree: fiche.duree,
                profils: fiche.profils,
                criteres: fiche.criteres,
                budget: fiche.budget,
                risques: fiche.risques,
                pointsVigilance: fiche.pointsVigilance
              },
              generationRequirement:
                "Générer impérativement clientContext, scopeSynthesis, businessIssues, winThemes, risks et clarificationQuestions depuis l'analyse du documentExtract et des sections extraites. Si le document ne contient pas l'information, écrire À confirmer / Non trouvé dans le document.",
              perDocumentSections: perDocSections?.map((d) => ({
                kind: d.kind,
                name: d.name,
                signals: d.signals,
                sections: d.sections
              }))
            },
            ficheExtractive: {
              contexte:  (fiche.contexte  || "").slice(0, 500),
              objet:     (fiche.objet     || "").slice(0, 500),
              perimetre: (fiche.perimetre || "").slice(0, 600),
              livrables: (fiche.livrables || "").slice(0, 500),
              duree:     (fiche.duree     || "").slice(0, 200),
              budget:    (fiche.budget    || "").slice(0, 200),
              criteres:  (fiche.criteres  || "").slice(0, 500),
              profils:   (fiche.profils   || "").slice(0, 500),
              risques:   (fiche.risques   || "").slice(0, 400),
              recommendation: fiche.recommendation
            },
            sources,
            referentials,
            patternScoring: patternScore
              ? {
                  score: patternScore.score,
                  maxScore: patternScore.maxScore,
                  decision: patternScore.decision,
                  rationale: patternScore.rationale,
                  recommendedManager: patternScore.recommendedManager?.name || "À confirmer",
                  activated: patternScore.activated,
                  blocking: patternScore.blocking,
                  watching: patternScore.watching,
                  bonusClient: patternScore.bonusClient,
                  guidance: "Utiliser ce score patterns /15 en COMPLÉMENT du goNoGoScore /100, citer les patterns activés dans qualificationSignals, et retenir le manager recommandé sauf contre-indication explicite du document."
                }
              : { decision: "Aucun pattern Sia activé", guidance: "Ne pas inventer de pattern ; rester sur l'analyse documentaire." }
  });

  const configuredTokens = parseInt(
    process.env.LLM_QUALIFICATION_MAX_TOKENS || process.env.ANTHROPIC_MAX_OUTPUT_TOKENS || "16384",
    10
  );
  const qualMaxTokens = isServerlessRuntime() ? Math.min(configuredTokens, 4096) : configuredTokens;

  const content = await completeChat({
    system,
    user,
    temperature: 0.15,
    maxOutputTokens: qualMaxTokens
  });

  if (!content) return null;
  return parseJsonObject(content);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateIntelligentQualification(
  ao: AoRecord,
  fiche: QualificationFiche,
  referentials: ReferentielItem[],
  enrichWeb: boolean,
  options: { llmTimeoutMs?: number; perDocSections?: PerDocSection[]; patternScore?: PatternScoreResult } = {}
): Promise<IntelligentQualificationFiche> {
  const sources = await researchQualificationContext(ao, enrichWeb);
  const patternScore =
    options.patternScore ??
    scoreAoFromPatterns(
      `${fiche.documentExtract || ""}\n${fiche.objet || ""}\n${fiche.perimetre || ""}\n${fiche.livrables || ""}\n${fiche.criteres || ""}`,
      ao.client || ""
    );
  const assumptions = [
    enrichWeb ? "" : "Enrichissement web non demandé lors de la génération.",
    sources.length ? "" : "Aucune source externe fiable n'a été trouvée automatiquement.",
    `Patterns Sia détectés : ${patternScore.activated.length ? patternScore.activated.map((hit) => hit.patternId).join(", ") : "aucun"}.`
  ].filter(Boolean);

  const { llmTimeoutMs = 0, perDocSections } = options;
  let raw: Record<string, unknown> | null = null;
  if (llmTimeoutMs > 0) {
    raw = await Promise.race([
      callQualificationLlm(ao, fiche, sources, referentials, patternScore, perDocSections).catch(() => null),
      sleep(llmTimeoutMs).then(() => null)
    ]);
    if (!raw) assumptions.push(`Analyse LLM tronquée après ${Math.round(llmTimeoutMs / 1000)} s (mode archive ZIP / serverless).`);
  } else {
    raw = await callQualificationLlm(ao, fiche, sources, referentials, patternScore, perDocSections).catch(() => null);
  }

  return normalizeIntelligence(ao, fiche, raw, sources, assumptions, { patternScore, referentials });
}
