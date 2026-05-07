export type ExtractedDocument = {
  name: string;
  text: string;
  warning: string;
};

export type DocumentSections = {
  contexte: string;
  objet: string;
  perimetre: string;
  livrables: string;
  duree: string;
  profils: string;
  criteres: string;
  budget: string;
  risques: string;
  pointsVigilance: string[];
};

function cleanText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function linesOf(text: string) {
  return cleanText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function findSection(lines: string[], keywords: string[], maxChars = 1200) {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].toLowerCase();
    if (normalizedKeywords.some((keyword) => line.includes(keyword))) {
      const collected = [lines[index]];
      for (let next = index + 1; next < Math.min(lines.length, index + 14); next += 1) {
        const nextLine = lines[next];
        const looksLikeHeading = nextLine.length < 90 && /^\d+(\.\d+)*\.?\s+[A-ZÉÈÀÂÎÏÔÙÛÇ]/.test(nextLine);
        if (looksLikeHeading && collected.length > 2) break;
        collected.push(nextLine);
      }
      return collected.join("\n").slice(0, maxChars);
    }
  }
  return "";
}

function detectWarnings(text: string) {
  const lower = text.toLowerCase();
  const warnings = [
    ["groupement interdit", "Groupement potentiellement interdit ou contraint"],
    ["certification", "Certification ou attestation spécifique à vérifier"],
    ["références similaires", "Références similaires exigées"],
    ["pénalité", "Pénalités contractuelles à analyser"],
    ["délai", "Délai de réalisation à confirmer"],
    ["budget", "Budget ou enveloppe financière à confirmer"]
  ];
  return warnings.filter(([keyword]) => lower.includes(keyword)).map(([, label]) => label);
}

export function extractDocumentSections(text: string): DocumentSections {
  const cleaned = cleanText(text);
  const lines = linesOf(cleaned);
  return {
    contexte: findSection(lines, ["introduction", "contexte", "présentation de l'organisation", "presentation de l'organisation"]),
    objet: findSection(lines, ["objet", "objectif", "mission", "appel d'offres", "cahier des charges"]),
    perimetre: findSection(lines, ["périmètre", "perimetre", "scope", "prestations attendues", "besoins"]),
    livrables: findSection(lines, ["livrables", "deliverables", "restitution", "rapport", "documents attendus"]),
    duree: findSection(lines, ["durée", "duree", "planning", "calendrier", "délai", "delai"]),
    profils: findSection(lines, ["profil", "expert", "consultant", "équipe", "equipe", "qualification"]),
    criteres: findSection(lines, ["critères", "criteres", "évaluation", "evaluation", "notation", "pondération", "ponderation"]),
    budget: findSection(lines, ["budget", "enveloppe", "montant", "prix", "financière", "financiere"]),
    risques: findSection(lines, ["risques", "contraintes", "sécurité", "securite", "exigences", "pénalité", "penalite"]),
    pointsVigilance: detectWarnings(cleaned)
  };
}

export async function extractUploadedDocument(file: File | null): Promise<ExtractedDocument> {
  if (!file || file.size === 0) {
    return { name: "", text: "", warning: "Aucun document transmis." };
  }

  const name = file.name;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const buffer = Buffer.from(await file.arrayBuffer());

  if (ext === "txt" || file.type.startsWith("text/")) {
    return { name, text: cleanText(buffer.toString("utf8")).slice(0, 50000), warning: "" };
  }

  if (ext === "docx") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return {
        name,
        text: cleanText(result.value || "").slice(0, 50000),
        warning: result.messages?.length ? `DOCX lu avec ${result.messages.length} avertissement(s).` : ""
      };
    } catch (error) {
      return {
        name,
        text: "",
        warning: `Erreur extraction DOCX : ${error instanceof Error ? error.message : "erreur inconnue"}`
      };
    }
  }

  return {
    name,
    text: "",
    warning: `Extraction texte automatique non configurée pour .${ext}. Ajoutez un extrait manuel dans le formulaire.`
  };
}

export function summarizeDocumentText(text: string, fallback: string) {
  const normalized = cleanText(text || fallback || "");
  if (!normalized) return "Non trouvé dans le document.";
  return normalized.slice(0, 6000);
}
