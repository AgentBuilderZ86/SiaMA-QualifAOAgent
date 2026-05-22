import { describe, expect, it } from "vitest";
import type { AoRecord, QualificationFiche } from "@/lib/aoTypes";
import { buildStructuredQualification } from "@/lib/qualification/structuredQualification";
import { buildFallbackIntelligence } from "@/lib/qualification/intelligence";
import { scoreAoFromPatterns } from "@/lib/qualification/patterns";

const SAMPLE_DOC = `
Office des Changes — Appel d'offres n° 26/OC/DFRHMG/2026
Objet : Accompagnement urbanisation SI et élaboration plan de transformation
Estimation : 1 047 500 DH HT — 1 257 000 DH TTC
Durée d'exécution : 7 mois
Lieu d'exécution : Rabat
Cautionnement provisoire : 25 000 DH
Sous-traitance interdite
Ouverture des plis : 8 juin 2026
Phase 1 — Cadrage gouvernance projet, planning, formation TOGAF/BPMN 3j
Phase 2 — Diagnostic SI actuel, cartographie processus et architecture
Phase 3 — Évaluation des besoins alignement PAS 2025-2029
Phase 4 — Architecture SI cible et scénarios
Phase 5 — Feuille de route et portefeuille projets
Phase 6 — Assistance technique formation et transfert compétences
Chef de projet urbanisation SI BAC+5 5 ans PMP Prince2
Urbaniste SI Architecte d'entreprise TOGAF 9+
Note technique minimale 70/100 éliminatoire
Qualité démarche 30 pts — Qualité équipe 70 pts
Références : 2 attestations ≥ 900k DH TTC depuis 2020
Prix de référence — offre anormalement basse si < 25% estimation
`;

const ao: AoRecord = {
  aoNum: "35104923",
  displayAoNum: "26/OC/DFRHMG/2026",
  client: "Office des Changes",
  sujet: "Urbanisation SI",
  manager: "Non assigné",
  budget: "1 257 000 DH TTC",
  delaiJours: 14,
  dateLimite: "8 juin 2026",
  decisionIa: "",
  justificationIa: "",
  statut: "A QUALIFIER",
  sourceTab: "Test",
  raw: {}
};

function baseFiche(): QualificationFiche {
  return {
    contexte: "À confirmer",
    objet: "Accompagnement urbanisation SI + plan de transformation",
    perimetre: "À confirmer",
    livrables: "À confirmer",
    duree: "À confirmer",
    profils: "À confirmer",
    criteres: "À confirmer",
    concurrence: "",
    relation: "",
    budget: "1 257 000 DH TTC",
    chances: "",
    risques: "",
    pointsVigilance: [],
    documentName: "RC.pdf",
    documentExtract: SAMPLE_DOC,
    extractionStatus: "Test",
    recommendation: "À générer",
    sources: []
  };
}

describe("buildStructuredQualification", () => {
  it("extrait phases, profils, critères et finance depuis le corpus", () => {
    const structured = buildStructuredQualification(ao, baseFiche(), []);
    expect(structured.missionPhases.length).toBeGreaterThanOrEqual(4);
    expect(structured.teamProfiles.length).toBeGreaterThanOrEqual(1);
    expect(structured.evaluationCriteria.length).toBeGreaterThanOrEqual(1);
    expect(structured.identification.budget).toMatch(/1\s*257|1257/i);
    expect(structured.financeIndicative.rows.length).toBeGreaterThanOrEqual(2);
    expect(structured.actionPlan.length).toBeGreaterThanOrEqual(3);
    expect(structured.briefForLlm).toContain("## Phases mission");
    expect(structured.briefForLlm.length).toBeLessThan(9500);
  });

  it("alimente buildFallbackIntelligence avec contenu structuré (pas uniquement brut)", () => {
    const fiche = baseFiche();
    const structured = buildStructuredQualification(ao, fiche, []);
    const patternScore = scoreAoFromPatterns(structured.briefForLlm, ao.client);
    const intelligence = buildFallbackIntelligence(ao, fiche, [], [], { patternScore, structured });
    expect(intelligence.missionPhases?.length).toBeGreaterThanOrEqual(4);
    expect(intelligence.teamProfiles?.length).toBeGreaterThanOrEqual(1);
    expect(intelligence.evaluationCriteria?.length).toBeGreaterThanOrEqual(1);
    expect(intelligence.executiveSummary).not.toContain("extrait documentaire");
    expect(intelligence.clientContext).toMatch(/Office des Changes|Établissement/i);
    expect(intelligence.scopeSynthesis).toMatch(/P\d|Phase/i);
  });
});
