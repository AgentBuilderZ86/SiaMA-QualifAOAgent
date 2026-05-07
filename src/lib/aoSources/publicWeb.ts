import type { AoSourceConnector, CollectedAo } from "@/lib/aoSources/types";
import { fetchWithTimeout, extractPublicNoticeLinks, maxRecords, sourceResult, stripHtml } from "@/lib/aoSources/utils";

type WebSeed = {
  sourceName: string;
  country: string;
  homepage: string;
  seeds: string[];
};

const marocPublic: WebSeed = {
  sourceName: "Portail Marocain des Marches Publics",
  country: "Maroc",
  homepage: "https://www.marchespublics.gov.ma/",
  seeds: [
    "https://www.marchespublics.gov.ma/index.php?page=entreprise.EntrepriseHome",
    "https://www.marchespublics.gov.ma/?page=entreprise.EntrepriseAdvancedSearch"
  ]
};

const privateInstitutionalMarocSeeds: WebSeed = {
  sourceName: "Grands comptes institutionnels prives Maroc",
  country: "Maroc",
  homepage: "https://www.groupebcp.com/",
  seeds: [
    "https://www.groupebcp.com/",
    "https://attijari-sourcing.attijariwafabank.com/web_en/login.html",
    "https://ocpgroup.ma/Contact-us",
    "https://relationfournisseurs.ocp.ma/",
    "https://www.one.ma/FR/pages/aoselect.asp?esp=2&id1=7&id2=64&id3=54&t2=1&t3=1"
  ]
};

function noticeIdFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const pathId = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
    return `${parsed.hostname}:${pathId}${parsed.search ? `:${parsed.search}` : ""}`;
  } catch {
    return url;
  }
}

function titleFromHtml(html: string, fallback: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return stripHtml(title || fallback);
}

async function collectSeed(seed: WebSeed) {
  const collectedAt = new Date().toISOString();
  const errors: string[] = [];
  const records: CollectedAo[] = [];

  for (const seedUrl of seed.seeds) {
    if (records.length >= maxRecords()) break;
    try {
      const response = await fetchWithTimeout(seedUrl);
      if (!response.ok) {
        errors.push(`HTTP ${response.status} sur ${seedUrl}`);
        continue;
      }
      const html = await response.text();
      const links = extractPublicNoticeLinks(html, seedUrl).slice(0, maxRecords() - records.length);
      for (const link of links) {
        records.push({
          sourceKind: "public-web",
          sourceName: seed.sourceName,
          sourceUrl: link.url,
          sourceNoticeId: noticeIdFromUrl(link.url),
          title: link.label || titleFromHtml(html, link.url),
          buyer: seed.sourceName,
          country: seed.country,
          publishedAt: "",
          deadline: "",
          procedureType: "Avis publie sur site web",
          estimatedBudget: "",
          currency: "",
          collectedAt,
          raw: { seedUrl, label: link.label }
        });
      }
    } catch (error) {
      errors.push(`${seedUrl}: ${error instanceof Error ? error.message : "Erreur inconnue"}`);
    }
  }
  return sourceResult(seed.sourceName, records, errors);
}

export const marchesPublicsMarocConnector: AoSourceConnector = {
  name: marocPublic.sourceName,
  kind: "public-web",
  homepage: marocPublic.homepage,
  fetchAos: () => collectSeed(marocPublic)
};

export const privateInstitutionalMarocConnector: AoSourceConnector = {
  name: privateInstitutionalMarocSeeds.sourceName,
  kind: "public-web",
  homepage: privateInstitutionalMarocSeeds.homepage,
  fetchAos: () => collectSeed(privateInstitutionalMarocSeeds)
};
