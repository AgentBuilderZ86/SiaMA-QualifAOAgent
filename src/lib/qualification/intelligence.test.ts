import type { AoRecord, QualificationFiche } from "@/lib/aoTypes";
import { buildFallbackIntelligence } from "@/lib/qualification/intelligence";
import { scoreAoFromPatterns } from "@/lib/qualification/patterns";
import { buildQualificationFicheHtml } from "@/lib/qualification/htmlFiche";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function runPipelineExtractionSelfTests() {
  const { parseFilenameSignals } = await import("@/lib/qualification/filenameSignals");
  const { extractKeyMetadata } = await import("@/lib/qualification/documentMetadata");
  const { extractUploadedDocument } = await import("@/lib/documents");

  const sig = parseFilenameSignals("15086292_PNUD_Gouvernance_Data_Avril 2026.zip");
  assert(sig.aoNumGuess === "15086292", "parseFilenameSignals doit extraire le N° AO en tête de nom.");
  assert(Boolean(sig.topicHints?.length), "topicHints doit être renseigné depuis le nom de fichier.");

  const meta = extractKeyMetadata(
    "Date limite : remise des offres le 15/03/2026. Budget : 1 500 000 MAD. contact@client.ma"
  );
  assert(meta.emails.includes("contact@client.ma"), "extractKeyMetadata doit lister les emails.");
  assert(Boolean(meta.budget && /500\s*000|1500/i.test(meta.budget)), "extractKeyMetadata doit capter le budget.");

  if (typeof File !== "undefined") {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("lot1.txt", "Enveloppe : 200 000 DH\nLieu d'exécution : Casablanca.");
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const file = new File([new Uint8Array(buf)], "999888_PNUD_test.zip", { type: "application/zip" });
    const extracted = await extractUploadedDocument(file);
    assert(extracted.text.includes("Casablanca"), "ZIP doit concaténer le texte des fichiers internes.");
    assert(extracted.text.includes("--- Fichier ZIP"), "ZIP doit marquer les séparateurs de fichiers.");
  }
}

export async function runQualificationIntelligenceSelfTest() {
  const ao: AoRecord = {
    aoNum: "AO-TEST",
    displayAoNum: "AO-TEST",
    client: "OCP Group",
    sujet: "Mission gouvernance data et architecture data",
    manager: "Non assigné",
    budget: "NC",
    delaiJours: 28,
    dateLimite: "",
    decisionIa: "",
    justificationIa: "",
    statut: "A QUALIFIER",
    sourceTab: "Test",
    raw: {}
  };
  const fiche: QualificationFiche = {
    contexte: "Contexte à qualifier",
    objet: "Objet documenté",
    perimetre: "Périmètre documenté avec gouvernance data et data catalog",
    livrables: "Livrables documentés",
    duree: "À confirmer",
    profils: "À confirmer",
    criteres: "À confirmer",
    concurrence: "",
    relation: "",
    budget: "NC",
    chances: "",
    risques: "Dépendances à confirmer",
    pointsVigilance: ["Budget à confirmer"],
    documentName: "fixture.txt",
    documentExtract:
      "Extrait source : le client OCP souhaite mettre en place une gouvernance data avec data catalog, data quality, MDM et architecture data type data warehouse / data lakehouse pour son ERP SAP. Critères de notation et dépendances à confirmer.",
    extractionStatus: "Document analysé",
    recommendation: "À générer",
    sources: ["fixture.txt"]
  };
  const patternScore = scoreAoFromPatterns(`${fiche.documentExtract} ${fiche.perimetre}`, ao.client);
  const intelligence = buildFallbackIntelligence(ao, fiche, [], ["Hypothèse test"], { patternScore, referentials: [] });
  assert(intelligence.goNoGoScore >= 0 && intelligence.goNoGoScore <= 100, "Le score doit rester borné entre 0 et 100.");
  assert(intelligence.slideStoryboard.length > 0, "Le storyboard doit contenir au moins une slide.");
  assert(intelligence.pptCopyBlock.includes("Synthèse exécutive"), "Le bloc PPT doit être généré.");
  assert(intelligence.assumptions.includes("Hypothèse test"), "Les hypothèses doivent être conservées.");
  assert(intelligence.identification?.buyer === "OCP Group", "L'identification V8 doit être générée.");
  assert((intelligence.missionPhases || []).length > 0, "Les phases de mission V8 doivent être générées.");
  assert((intelligence.qualificationSignals || []).length > 0, "Les signaux de qualification V8 doivent être générés.");
  assert((intelligence.nextSteps || []).length > 0, "Les prochaines étapes V8 doivent être générées.");
  assert(intelligence.clientContext.includes("Contexte à qualifier"), "Le contexte doit rester ancré dans l'analyse documentaire.");
  assert(intelligence.businessIssues.some((issue) => issue.includes("Objet documenté") || issue.includes("Périmètre documenté")), "Les enjeux doivent provenir du document ou des sections extraites.");
  assert(intelligence.clarificationQuestions.length >= 4, "Les questions doivent couvrir les ambiguïtés du document chargé.");

  assert(intelligence.patternScore !== undefined, "Le score patterns Sia doit être calculé.");
  assert((intelligence.patternScore?.score ?? -1) >= 0, "Le score patterns doit être >= 0.");
  assert((intelligence.patternScore?.activated.length ?? 0) > 0, "Au moins un pattern Sia doit être activé sur l'extrait test (data, data warehouse, SAP).");
  assert((intelligence.aoCalendar || []).length >= 3, "Le calendrier AO doit comporter au moins 3 jalons.");
  assert((intelligence.keyQuestions || []).length >= 5, "Les questions clés doivent couvrir au moins 5 thèmes.");
  assert((intelligence.responseFormat?.documents.length ?? 0) >= 1, "Le format de réponse doit lister au moins un document attendu.");
  assert((intelligence.responseFormat?.technicalSections.length ?? 0) >= 4, "Le format de réponse doit lister les sections du dossier technique.");
  assert(Boolean(intelligence.contextHighlight), "Le contextHighlight problèmes/objectifs doit être généré.");
  assert((intelligence.contextHighlight?.objectives.length ?? 0) >= 1, "Au moins un objectif doit être listé.");
  assert(Boolean(intelligence.financeIndicative), "La simulation financière indicative doit être générée.");
  assert((intelligence.financeIndicative?.rows.length ?? 0) >= 2, "La simulation indicative doit lister plusieurs phases.");

  const html = buildQualificationFicheHtml(ao, intelligence);
  assert(html.startsWith("<!DOCTYPE html>"), "Le builder HTML doit produire un document HTML autonome.");
  assert(html.includes("Sia Partners Maroc".toUpperCase()) || html.includes("SIA PARTNERS MAROC"), "Le builder HTML doit contenir l'identité Sia.");
  assert(html.includes("Identification") && html.includes("appel d&#39;offres"), "Le builder HTML doit inclure la section Identification.");
  assert(html.includes("Calendrier"), "Le builder HTML doit inclure la timeline calendrier.");
  assert(html.includes("Prochaines"), "Le builder HTML doit inclure la section Prochaines étapes.");
  assert(html.includes("Inter Tight"), "Le builder HTML doit charger Inter Tight (design system 2026.1).");
  assert(html.includes("JetBrains Mono"), "Le builder HTML doit charger JetBrains Mono (chiffres tabulaires).");
  assert(html.includes("--sia-black"), "Le builder HTML doit s'appuyer sur le token --sia-black du design system.");
  assert(html.includes("--sia-green"), "Le builder HTML doit s'appuyer sur le token --sia-green (filet d'accent).");
  assert(
    html.includes("tone-go") || html.includes("tone-watch") || html.includes("tone-nogo"),
    "Le builder HTML doit appliquer une classe tone-* sur la bannière décision (tokens)."
  );
  assert(!html.includes("'Syne'") && !html.includes("Syne,"), "Le builder HTML ne doit plus charger la police Syne (legacy V8/V9).");

  await runPipelineExtractionSelfTests();
}

import { describe, it } from "vitest";
describe("intelligence — buildFallbackIntelligence + pipeline extraction", () => {
  it("génère une fiche intelligente complète sans appel LLM réel", async () => {
    await runQualificationIntelligenceSelfTest();
  });
});
