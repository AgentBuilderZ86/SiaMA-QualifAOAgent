import type { QualificationFiche } from "@/lib/aoTypes";

export const DEFAULT_ADMIN_DOCUMENTS = [
  "CPS / cahier des prescriptions spéciales",
  "RC / règlement de consultation",
  "Avis d'appel d'offres ou lettre de consultation",
  "Acte d'engagement / déclaration sur l'honneur",
  "Attestations fiscales, sociales et registre de commerce",
  "Bordereau des prix / offre financière",
  "Caution provisoire si le RC l'exige"
] as const;

export function isQualificationDocumentLoaded(fiche: QualificationFiche | null) {
  if (!fiche) return false;
  const name = String(fiche.documentName || "").trim();
  const extract = String(fiche.documentExtract || "").trim();
  return Boolean(name || (extract && extract !== "Non trouvé dans le document."));
}

export function detectedLoadedFiles(fiche: QualificationFiche | null) {
  if (!fiche?.documentExtract) return [];
  const files = [...fiche.documentExtract.matchAll(/--- Fichier ZIP :\s*([^-]+?)\s*---/g)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);
  if (files.length) return [...new Set(files)].slice(0, 6);
  return fiche.documentName ? [fiche.documentName] : [];
}

function cleanRequirement(value: string) {
  return value
    .replace(/^[\s:;,\-.•\d)]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export function extractAdminRequirements(fiche: QualificationFiche | null) {
  const text = String(fiche?.documentExtract || "");
  if (!text || text === "Non trouvé dans le document.") return [];
  const candidates = new Set<string>();
  const lines = text.split(/\n+/).map(cleanRequirement).filter(Boolean);
  const keyword =
    /(pi[eè]ces?|documents?|dossier administratif|attestation|certificat|caution|registre de commerce|cnss|fiscal|acte d'engagement|déclaration sur l'honneur|bordereau|offre financière|offre technique|r[èe]glement de consultation|cps|rc|avis d'appel)/i;

  lines.forEach((line, index) => {
    if (!keyword.test(line)) return;
    candidates.add(line);
    const next = cleanRequirement(lines[index + 1] || "");
    if (next && next.length < 120 && !/^(article|chapitre|section)\b/i.test(next)) candidates.add(next);
  });

  return [...candidates].filter((item) => item.length >= 8).slice(0, 8);
}
