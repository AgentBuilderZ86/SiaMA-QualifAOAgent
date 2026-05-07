import type { AoRecord, SourcedFact } from "@/lib/aoTypes";

const TIMEOUT_MS = 8_000;

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "SiaMA-QualifAOAgent/0.1 (+qualification research)",
        accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        ...(init.headers ?? {})
      },
      next: { revalidate: 3600 }
    });
  } finally {
    clearTimeout(timeout);
  }
}

function fact(title: string, url: string, excerpt: string): SourcedFact | null {
  const cleanedUrl = cleanText(url);
  const cleanedExcerpt = cleanText(excerpt);
  if (!cleanedUrl.startsWith("http") || !cleanedExcerpt) return null;
  return {
    title: cleanText(title) || cleanedUrl,
    url: cleanedUrl,
    excerpt: cleanedExcerpt.slice(0, 800),
    consultedAt: new Date().toISOString()
  };
}

async function searchDuckDuckGo(query: string): Promise<SourcedFact[]> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return [];
    const data = (await response.json()) as {
      Heading?: string;
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Name?: string } | { Topics?: Array<{ Text?: string; FirstURL?: string; Name?: string }> }>;
    };
    const results: SourcedFact[] = [];
    const main = fact(data.Heading || query, data.AbstractURL || "", data.AbstractText || "");
    if (main) results.push(main);
    for (const topic of data.RelatedTopics ?? []) {
      if ("Topics" in topic && Array.isArray(topic.Topics)) {
        for (const nested of topic.Topics) {
          const item = fact(nested.Name || query, nested.FirstURL || "", nested.Text || "");
          if (item) results.push(item);
        }
      } else if ("Text" in topic) {
        const item = fact(topic.Name || query, topic.FirstURL || "", topic.Text || "");
        if (item) results.push(item);
      }
      if (results.length >= 5) break;
    }
    return results;
  } catch {
    return [];
  }
}

async function fetchSourcePage(ao: AoRecord): Promise<SourcedFact[]> {
  if (!ao.sourceUrl?.startsWith("http")) return [];
  try {
    const response = await fetchWithTimeout(ao.sourceUrl);
    if (!response.ok) return [];
    const html = await response.text();
    const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ao.sujet);
    const description = cleanText(
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    );
    const item = fact(title, ao.sourceUrl, description);
    return item ? [item] : [];
  } catch {
    return [];
  }
}

export async function researchQualificationContext(ao: AoRecord, enabled: boolean): Promise<SourcedFact[]> {
  const internalSources = [
    fact("Données AO internes", ao.sourceUrl || `internal:${ao.aoNum}`, [ao.client, ao.sujet, ao.budget, ao.dateLimite].filter(Boolean).join(" | "))
  ].filter((item): item is SourcedFact => Boolean(item));
  if (!enabled) return internalSources;

  const queries = [
    `${ao.client} activité stratégie Maroc`,
    `${ao.client} appel d'offres ${ao.sujet}`,
    `${ao.client} concurrents secteur ${ao.sujet}`
  ];
  const results = await Promise.all([fetchSourcePage(ao), ...queries.map(searchDuckDuckGo)]);
  const byUrl = new Map<string, SourcedFact>();
  [...internalSources, ...results.flat()].forEach((item) => byUrl.set(item.url, item));
  return [...byUrl.values()].slice(0, 10);
}
