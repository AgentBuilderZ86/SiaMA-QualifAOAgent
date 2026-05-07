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

/** Limite globale de caractères conservée pour scoring / LLM (évite OOM serverless). */
export const MAX_EXTRACT_CHARS = 50000;
/** Texte max par fichier dans une archive avant concaténation globale. */
const MAX_ZIP_ENTRY_CHARS = 25000;
/** Taille max fichier ZIP uploadé. */
const MAX_ZIP_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Taille max d’un PDF brut avant extraction. */
const MAX_PDF_BYTES = 20 * 1024 * 1024;

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

export function findSection(
  lines: string[],
  keywords: string[],
  maxChars = 1200,
  maxLines = 18
) {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].toLowerCase();
    if (normalizedKeywords.some((keyword) => line.includes(keyword))) {
      const collected = [lines[index]];
      for (let next = index + 1; next < Math.min(lines.length, index + maxLines); next += 1) {
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
    contexte: findSection(lines, [
      "introduction",
      "contexte",
      "présentation de l'organisation",
      "presentation de l'organisation",
      "contact",
      "coordonnées",
      "coordination",
      "référent",
      "referent",
      "représentant"
    ]),
    objet: findSection(lines, [
      "objet",
      "objectif",
      "mission",
      "appel d'offres",
      "cahier des charges",
      "besoin exprimé",
      "besoins"
    ]),
    perimetre: findSection(lines, [
      "périmètre",
      "perimetre",
      "scope",
      "prestations attendues",
      "besoins",
      "lieu",
      "localisation",
      "ville",
      "site",
      "adresse",
      "géographique",
      "geographique"
    ]),
    livrables: findSection(lines, ["livrables", "deliverables", "restitution", "rapport", "documents attendus"]),
    duree: findSection(lines, [
      "durée",
      "duree",
      "planning",
      "calendrier",
      "délai",
      "delai",
      "remise des offres",
      "clôture",
      "echeance",
      "échéance"
    ]),
    profils: findSection(lines, [
      "profil",
      "expert",
      "consultant",
      "équipe",
      "equipe",
      "qualification",
      "contact",
      "interlocuteur",
      "référent technique"
    ]),
    criteres: findSection(lines, ["critères", "criteres", "évaluation", "evaluation", "notation", "pondération", "ponderation"]),
    budget: findSection(lines, ["budget", "enveloppe", "montant", "prix", "financière", "financiere", "tenders"]),
    risques: findSection(lines, [
      "risques",
      "contraintes",
      "sécurité",
      "securite",
      "exigences",
      "pénalité",
      "penalite",
      "soumission"
    ]),
    pointsVigilance: detectWarnings(cleaned)
  };
}

async function extractPdfBuffer(buffer: Buffer): Promise<{ text: string; warning: string }> {
  if (buffer.length > MAX_PDF_BYTES) {
    return { text: "", warning: `PDF trop volumineux (max ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} Mo).` };
  }
  try {
    const pdfParseMod = await import("pdf-parse");
    const pdfParse = pdfParseMod.default as unknown as (
      data: Buffer
    ) => Promise<{ text: string; numpages: number }>;
    const data = await pdfParse(buffer);
    const raw = cleanText(data.text || "").slice(0, MAX_ZIP_ENTRY_CHARS);
    let warning = "";
    if (data.numpages > 100) warning = `PDF très long (${data.numpages} p.), extrait tronqué pour analyse.`;
    return { text: raw, warning };
  } catch (error) {
    return {
      text: "",
      warning: `Erreur extraction PDF : ${error instanceof Error ? error.message : "erreur inconnue"}`
    };
  }
}

async function extractZipBuffer(buffer: Buffer, outerName: string): Promise<ExtractedDocument> {
  if (buffer.length > MAX_ZIP_UPLOAD_BYTES) {
    return {
      name: outerName,
      text: "",
      warning: `ZIP trop volumineux (max ${Math.round(MAX_ZIP_UPLOAD_BYTES / (1024 * 1024))} Mo).`
    };
  }

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const parts: string[] = [];
  const warnings: string[] = [];
  let totalLen = 0;

  const names = Object.keys(zip.files)
    .filter((n) => !zip.files[n].dir)
    .sort();

  for (const path of names) {
    const entry = zip.files[path];
    const base = path.split("/").pop() || path;
    const ext = base.split(".").pop()?.toLowerCase() || "";

    if (!["pdf", "docx", "txt"].includes(ext)) continue;

    let buf: Buffer;
    try {
      buf = await entry.async("nodebuffer");
    } catch {
      warnings.push(`Lecture impossible : ${path}`);
      continue;
    }

    if (buf.length > 15 * 1024 * 1024) {
      warnings.push(`Fichier ignoré (trop lourd) : ${path}`);
      continue;
    }

    let chunk = "";
    let localWarning = "";

    if (ext === "txt") {
      chunk = cleanText(buf.toString("utf8"));
    } else if (ext === "docx") {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: buf });
        chunk = cleanText(result.value || "");
        if (result.messages?.length) {
          localWarning = `DOCX ${base} : ${result.messages.length} avertissement(s).`;
        }
      } catch (error) {
        warnings.push(`DOCX ${path} : ${error instanceof Error ? error.message : "erreur"}`);
        continue;
      }
    } else if (ext === "pdf") {
      const r = await extractPdfBuffer(buf);
      chunk = r.text;
      if (r.warning) localWarning = `${base}: ${r.warning}`;
      if (!chunk.trim() && r.warning.includes("Erreur extraction")) {
        warnings.push(r.warning);
        continue;
      }
    }

    chunk = chunk.slice(0, MAX_ZIP_ENTRY_CHARS);
    const sep = `\n\n--- Fichier ZIP : ${path} ---\n\n`;
    if (totalLen + sep.length + chunk.length > MAX_EXTRACT_CHARS) {
      warnings.push("Archive tronquée : limite de texte globale atteinte.");
      break;
    }
    parts.push(sep + chunk);
    totalLen += sep.length + chunk.length;
    if (localWarning) warnings.push(localWarning);
  }

  const text = parts.join("").slice(0, MAX_EXTRACT_CHARS);
  const warning = warnings.join(" ");
  if (!text.trim()) {
    return {
      name: outerName,
      text: "",
      warning: warning || "ZIP sans fichier .pdf / .docx / .txt exploitable."
    };
  }
  return { name: outerName, text, warning };
}

export async function extractUploadedDocument(file: File | null): Promise<ExtractedDocument> {
  if (!file || file.size === 0) {
    return { name: "", text: "", warning: "Aucun document transmis." };
  }

  const name = file.name;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const buffer = Buffer.from(await file.arrayBuffer());

  if (ext === "zip") {
    if (file.size > MAX_ZIP_UPLOAD_BYTES) {
      return {
        name,
        text: "",
        warning: `ZIP trop volumineux (max ${Math.round(MAX_ZIP_UPLOAD_BYTES / (1024 * 1024))} Mo).`
      };
    }
    return extractZipBuffer(buffer, name);
  }

  if (ext === "txt" || file.type.startsWith("text/")) {
    return { name, text: cleanText(buffer.toString("utf8")).slice(0, MAX_EXTRACT_CHARS), warning: "" };
  }

  if (ext === "pdf") {
    const { text, warning } = await extractPdfBuffer(buffer);
    return {
      name,
      text: text.slice(0, MAX_EXTRACT_CHARS),
      warning
    };
  }

  if (ext === "docx") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return {
        name,
        text: cleanText(result.value || "").slice(0, MAX_EXTRACT_CHARS),
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
    warning: `Extraction automatique non disponible pour .${ext}. Formats pris en charge : .txt, .docx, .pdf, .zip (PDF/DOCX/TXT). Ajoutez un extrait manuel si besoin.`
  };
}

export function summarizeDocumentText(text: string, fallback: string) {
  const normalized = cleanText(text || fallback || "");
  if (!normalized) return "Non trouvé dans le document.";
  return normalized.slice(0, 6000);
}
