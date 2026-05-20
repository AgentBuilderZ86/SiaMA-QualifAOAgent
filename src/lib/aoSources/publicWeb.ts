import type { AoSourceConnector, CollectedAo } from "@/lib/aoSources/types";
import { MOROCCO_WEB_AO_SOURCES, type MoroccoAoSourceRegistryEntry } from "@/lib/aoSources/moroccoSourceRegistry";
import { fetchWithTimeout, extractPublicNoticeLinks, maxRecords, sourceResult, stripHtml } from "@/lib/aoSources/utils";

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

async function collectSeed(seed: MoroccoAoSourceRegistryEntry) {
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
          sourceKind: seed.kind,
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
          raw: {
            seedUrl,
            label: link.label,
            registryId: seed.id,
            accessMethod: seed.accessMethod,
            documentHints: seed.documentHints.join(" | "),
            evidenceUrls: seed.evidenceUrls.join(" | ")
          }
        });
      }
    } catch (error) {
      errors.push(`${seedUrl}: ${error instanceof Error ? error.message : "Erreur inconnue"}`);
    }
  }
  return sourceResult(seed.sourceName, records, errors);
}

export function buildMoroccoWebConnector(source: MoroccoAoSourceRegistryEntry): AoSourceConnector {
  return {
    name: source.sourceName,
    kind: source.kind,
    homepage: source.homepage,
    fetchAos: () => collectSeed(source)
  };
}

export const moroccoPublicWebConnectors: AoSourceConnector[] = MOROCCO_WEB_AO_SOURCES.map(buildMoroccoWebConnector);

export const marchesPublicsMarocConnector =
  moroccoPublicWebConnectors.find((connector) => connector.name === "Portail Marocain des Marches Publics") ??
  buildMoroccoWebConnector(MOROCCO_WEB_AO_SOURCES[0]);
