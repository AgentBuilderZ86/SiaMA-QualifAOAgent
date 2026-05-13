/**
 * Génère un deck PPTX d'exemple au style Sia (couleurs / typo alignées sur qualificationDeck.ts).
 * Usage : node scripts/generate-example-sia-deck.cjs
 * Sortie : output/ao-decks/EXEMPLE-SiaMA-qualification.pptx
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const pptxgen = require("pptxgenjs");

function clean(value) {
  return String(value ?? "").trim() || "À confirmer";
}

function addTitle(slide, title, subtitle) {
  slide.addText(title, { x: 0.5, y: 0.35, w: 12.3, h: 0.45, fontSize: 24, bold: true, color: "172033", margin: 0.02 });
  if (subtitle) slide.addText(subtitle, { x: 0.5, y: 0.85, w: 12.2, h: 0.3, fontSize: 10, color: "64748B", margin: 0.02 });
}

function addBullets(slide, bullets, x, y, w, h) {
  slide.addText(
    bullets.map((bullet) => ({ text: clean(bullet), options: { bullet: { type: "bullet" } } })),
    { x, y, w, h, fontSize: 13, color: "172033", breakLine: false, fit: "shrink", valign: "top" }
  );
}

function addSourceFooter(slide, sources) {
  slide.addText(`Sources : ${sources.length ? sources.join(" | ") : "À confirmer"}`, {
    x: 0.5,
    y: 7.1,
    w: 12.3,
    h: 0.25,
    fontSize: 7,
    color: "64748B",
    margin: 0.02
  });
}

async function main() {
  const ao = {
    aoNum: "DEMO-001",
    displayAoNum: "DEMO-001",
    client: "Exemple Client — Maroc",
    sujet: "Transformation digitale et pilotage de la performance (appel d'offres démonstration)",
    statut: "BO",
    manager: "A. Manager",
    budget: "2 500 000 DH TTC",
    dateLimite: "30/06/2026",
    delaiJours: 45,
    sourceTab: "Pipeline BO-Propale",
    sourceName: "Google Sheets",
    sourceKind: "google-sheet",
    sourceUrl: "",
    decisionIa: "WATCH",
    justificationIa: "Exemple généré — ne pas utiliser en comité réel."
  };

  const fiche = {
    contexte: "Organisation en phase de modernisation SI et gouvernance des données.",
    objet: ao.sujet,
    perimetre: "Phase 1 : diagnostic et cadrage ; phase 2 : design cible ; phase 3 : plan de déploiement.",
    livrables: "Rapport de diagnostic, cartographie des processus, roadmap, ateliers de priorisation.",
    duree: "6 mois (indicatif)",
    profils: "PMO, architecte SI, consultant data, change.",
    criteres: "Prix 40 %, valeur technique 50 %, références 10 %.",
    concurrence: "À confirmer",
    relation: "Partenariat ciblé avec l'équipe MOA.",
    budget: ao.budget,
    chances: "Bon alignement avec la stratégie groupe.",
    risques: "Dépendances fournisseurs, charge MOA.",
    pointsVigilance: ["Délai fixe", "Données sensibles hébergement"],
    documentName: "CPS-exemple.pdf",
    documentExtract: "Extrait fictif pour illustration du deck.",
    extractionStatus: "Exemple — données non contractuelles",
    recommendation: "WATCH",
    sources: ["SiaMA Qualif AO", "Deck exemple"]
  };

  const intelligence = {
    executiveSummary:
      "Synthèse exécutive : l'opportunité est crédible sur le plan technique ; la décision dépend surtout de la charge MOA et du calendrier de décision.",
    recommendation: "WATCH",
    goNoGoScore: 72,
    confidenceLevel: "Moyen",
    winThemes: ["Références sectorielles", "Méthode éprouvée", "Équipe locale Maroc", "Approche ROI"],
    scopeSynthesis: fiche.perimetre,
    responseStrategy: "Proposer une phase pilote courte pour sécuriser la relation et valider les hypothèses de charge.",
    differentiators: ["Approche data + change intégrée", "Gouvernance et PMO", "Livrables actionnables"],
    risks: [
      { label: "Charge MOA", severity: "Moyen", mitigation: "Rituels hebdo + RACI", source: "Exemple" },
      { label: "Données", severity: "Élevé", mitigation: "Plan de sécurisation et accès", source: "Exemple" }
    ],
    clarificationQuestions: ["Hébergement des données ?", "Périmètre exact des filiales ?", "Critère de priorisation des use cases ?"],
    sources: [
      { title: "SiaMA Qualif AO", url: "https://example.invalid", excerpt: "Outil interne", consultedAt: "2026-05-08" }
    ],
    slideStoryboard: [
      {
        title: "Contexte et enjeux",
        keyMessage: "Cadrer la valeur attendue et les contraintes MOA.",
        bullets: [fiche.contexte, fiche.objet, "Décision attendue : GO / WATCH / NO GO"],
        speakerNotes: "Adapter au dossier réel ; ne pas inventer de chiffres."
      },
      {
        title: "Périmètre et livrables",
        keyMessage: fiche.perimetre,
        bullets: [fiche.perimetre, fiche.livrables, fiche.duree],
        speakerNotes: "Vérifier alignement avec le RC / CPS."
      },
      {
        title: "Risques et questions ouvertes",
        keyMessage: "Traiter les risques avant engagement ferme.",
        bullets: [
          "Charge MOA (Moyen) : Rituels hebdo + RACI",
          "Données (Élevé) : Plan de sécurisation et accès",
          "Hébergement des données ?",
          "Périmètre exact des filiales ?",
          "Critère de priorisation des use cases ?"
        ],
        speakerNotes: "Base de comité GO / NO GO."
      }
    ]
  };

  const sources = intelligence.sources.map((s) => s.title).slice(0, 4);

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "SiaMA Qualif AO";
  pptx.subject = `Qualification AO ${ao.displayAoNum}`;
  pptx.title = `Qualification ${ao.client}`;
  pptx.company = "Sia";
  pptx.theme = { headFontFace: "Aptos Display", bodyFontFace: "Aptos" };

  const cover = pptx.addSlide();
  cover.background = { color: "EEF3FF" };
  cover.addText("Qualification AO — EXEMPLE", { x: 0.55, y: 0.7, w: 6, h: 0.35, fontSize: 14, bold: true, color: "1D4ED8" });
  cover.addText(clean(ao.client), { x: 0.55, y: 1.15, w: 8.5, h: 0.7, fontSize: 32, bold: true, color: "172033", fit: "shrink" });
  cover.addText(clean(ao.sujet), { x: 0.55, y: 2.0, w: 8.6, h: 1.1, fontSize: 16, color: "334155", fit: "shrink" });
  cover.addText(`Recommandation : ${intelligence.recommendation}`, {
    x: 9.3,
    y: 1.15,
    w: 3,
    h: 0.45,
    fontSize: 18,
    bold: true,
    color: "FFFFFF",
    fill: { color: "1D4ED8" },
    margin: 0.1
  });
  cover.addText(`${intelligence.goNoGoScore}/100`, { x: 9.3, y: 1.75, w: 3, h: 0.75, fontSize: 34, bold: true, color: "172033", margin: 0.02 });
  cover.addText(`Confiance : ${intelligence.confidenceLevel}`, { x: 9.3, y: 2.55, w: 3, h: 0.35, fontSize: 12, color: "64748B" });
  addBullets(cover, intelligence.winThemes, 0.8, 4.0, 5.5, 1.4);
  cover.addText(intelligence.executiveSummary, { x: 6.7, y: 3.65, w: 5.8, h: 1.8, fontSize: 13, color: "172033", fit: "shrink", valign: "top" });
  addSourceFooter(cover, sources);

  intelligence.slideStoryboard.forEach((story, index) => {
    const slide = pptx.addSlide();
    addTitle(slide, `${index + 1}. ${story.title}`, story.keyMessage);
    addBullets(slide, story.bullets, 0.7, 1.55, 5.7, 4.8);
    slide.addShape(pptx.ShapeType.roundRect, { x: 6.9, y: 1.55, w: 5.7, h: 4.8, rectRadius: 0.12, fill: { color: "EFF6FF" }, line: { color: "DBE3EF" } });
    slide.addText(story.speakerNotes || intelligence.responseStrategy, {
      x: 7.25,
      y: 1.9,
      w: 5,
      h: 3.8,
      fontSize: 13,
      color: "172033",
      fit: "shrink",
      valign: "top"
    });
    addSourceFooter(slide, sources);
  });

  const outDir = path.join(__dirname, "..", "output", "ao-decks");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "EXEMPLE-SiaMA-qualification.pptx");
  const buf = await pptx.write({ outputType: "nodebuffer" });
  const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  fs.writeFileSync(outPath, data);
  console.log("Deck exemple généré :", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
