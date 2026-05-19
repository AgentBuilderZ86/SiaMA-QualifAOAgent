import crypto from "node:crypto";
import type { AoRecord } from "@/lib/aoTypes";
import { extractDocumentBuffer, summarizeDocumentText, type ExtractedDocument } from "@/lib/documents";
import { absoluteUrl, fetchWithTimeout, stripHtml } from "@/lib/aoSources/utils";
import { BrightDataWebUnlockerClient, getBrightDataConfigStatus } from "@/lib/aoSources/brightDataClient";

export type AoDocumentKind = "CPS" | "RC" | "Avis" | "Bordereau" | "Acte engagement" | "Caution" | "Annexe" | "Dossier" | "Autre";

export type AoDocumentCandidate = {
  aoNum: string;
  sourceUrl: string;
  documentUrl: string;
  label: string;
  kind: AoDocumentKind;
  confidence: number;
};

export type AoDocumentExtraction = AoDocumentCandidate & {
  filename: string;
  contentType: string;
  sha256: string;
  text: string;
  warning: string;
  extractedAt: string;
};

type ScrapePage = (url: string) => Promise<string>;

const DOCUMENT_EXT_RE = /\.(pdf|docx?|zip|txt)(?:[?#].*)?$/i;

function filenameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(last || "document-ao.txt");
  } catch {
    return "document-ao.txt";
  }
}

function classify(label: string, url: string): { kind: AoDocumentKind; confidence: number } {
  const text = `${label} ${url}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const extBoost = DOCUMENT_EXT_RE.test(url) ? 30 : 0;
  const rules: Array<[AoDocumentKind, RegExp, number]> = [
    ["CPS", /\bcps\b|cahier des prescriptions|prescriptions speciales/, 70],
    ["RC", /\brc\b|reglement de consultation/, 70],
    ["Avis", /avis d.?appel|lettre de consultation|aapc/, 65],
    ["Bordereau", /bordereau|bpu|detail estimatif|offre financiere/, 60],
    ["Acte engagement", /acte d.?engagement|declaration sur l.?honneur/, 55],
    ["Caution", /caution|garantie provisoire/, 55],
    ["Annexe", /annexe|appendice/, 45],
    ["Dossier", /dossier|pieces?|telecharger|download/, 40]
  ];
  const match = rules.find(([, pattern]) => pattern.test(text));
  if (match) return { kind: match[0], confidence: Math.min(100, match[2] + extBoost) };
  return { kind: "Autre", confidence: extBoost };
}

function uniqueCandidates(candidates: AoDocumentCandidate[]) {
  const byUrl = new Map<string, AoDocumentCandidate>();
  for (const candidate of candidates) {
    const previous = byUrl.get(candidate.documentUrl);
    if (!previous || previous.confidence < candidate.confidence) byUrl.set(candidate.documentUrl, candidate);
  }
  return [...byUrl.values()].sort((a, b) => b.confidence - a.confidence);
}

export function extractAoDocumentCandidates(content: string, ao: Pick<AoRecord, "aoNum" | "sourceUrl">): AoDocumentCandidate[] {
  if (!ao.sourceUrl?.startsWith("http")) return [];
  const candidates: AoDocumentCandidate[] = [];
  const htmlLinkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g;

  const pushCandidate = (hrefRaw: string, labelRaw: string) => {
    const href = absoluteUrl(ao.sourceUrl || "", hrefRaw);
    const label = stripHtml(labelRaw || href);
    const classified = classify(label, href);
    if (!href.startsWith("http")) return;
    if (classified.confidence < 40 && !DOCUMENT_EXT_RE.test(href)) return;
    candidates.push({
      aoNum: ao.aoNum,
      sourceUrl: ao.sourceUrl || "",
      documentUrl: href,
      label: label || filenameFromUrl(href),
      kind: classified.kind,
      confidence: classified.confidence
    });
  };

  let htmlMatch: RegExpExecArray | null;
  while ((htmlMatch = htmlLinkPattern.exec(content))) {
    pushCandidate(htmlMatch[1] || "", htmlMatch[2] || "");
  }

  let markdownMatch: RegExpExecArray | null;
  while ((markdownMatch = markdownLinkPattern.exec(content))) {
    pushCandidate(markdownMatch[2] || "", markdownMatch[1] || "");
  }

  return uniqueCandidates(candidates);
}

export async function scrapeAoSourcePage(url: string) {
  const status = getBrightDataConfigStatus();
  if (status.configured) {
    return new BrightDataWebUnlockerClient().scrapeUrl(url, { dataFormat: "html" });
  }
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} sur ${url}`);
  return response.text();
}

export async function discoverAoDocumentCandidates(ao: AoRecord, scrapePage: ScrapePage = scrapeAoSourcePage) {
  if (!ao.sourceUrl?.startsWith("http")) return [];
  const content = await scrapePage(ao.sourceUrl);
  return extractAoDocumentCandidates(content, ao);
}

export async function downloadAndExtractAoDocument(candidate: AoDocumentCandidate): Promise<AoDocumentExtraction> {
  const response = await fetchWithTimeout(candidate.documentUrl, {}, Number(process.env.AO_DOCUMENT_FETCH_TIMEOUT_MS) || 20_000);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} sur ${candidate.documentUrl}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
  const filename = filenameFromUrl(candidate.documentUrl);
  const extracted: ExtractedDocument = await extractDocumentBuffer({ name: filename, buffer, contentType });

  return {
    ...candidate,
    filename,
    contentType,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    text: summarizeDocumentText(extracted.text, ""),
    warning: extracted.warning,
    extractedAt: new Date().toISOString()
  };
}
