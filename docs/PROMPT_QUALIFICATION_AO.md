# Prompt qualification AO (référence produit)

Ce fichier reprend le pipeline attendu pour la fiche de qualification (aligné sur `src/lib/qualification/structuredQualification.ts` et `intelligence.ts`).

1. **Extraction texte** — Avis + RC + CPS (priorité RC puis Avis sur Netlify)
2. **Métadonnées** — référence, budget, durée, lieu, cautionnement, mode passation
3. **Scoring GO/NOGO** — `src/lib/qualification/patterns.ts` (score /15)
4. **Sections structurées** — phases, profils, critères, risques
5. **Simulation TJM** — grille Sia Maroc
6. **Plan d'action** — jalons J-20 → dépôt
7. **Rendu** — `QualificationIntelligenceView` + export HTML

L'analyse LLM reçoit `analysisBrief` (synthèse structurée) plutôt que le seul bloc OCR brut.
