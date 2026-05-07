import {
  calculateDeadlineDays,
  collectedAoToRecord,
  dedupeCollectedAos,
  normalizeCollectedAo
} from "@/lib/aoSources/normalize";
import type { CollectedAo } from "@/lib/aoSources/types";

const fixture: CollectedAo = {
  sourceKind: "public-web",
  sourceName: "Source officielle test",
  sourceUrl: "https://example.org/appels-offres/ao-1",
  sourceNoticeId: "AO-1",
  title: "Mission de conseil",
  buyer: "Acheteur public",
  country: "Maroc",
  publishedAt: "2026-05-01",
  deadline: "2026-05-10",
  procedureType: "Appel d'offres ouvert",
  estimatedBudget: "",
  currency: "",
  collectedAt: "2026-05-07T00:00:00.000Z",
  raw: {}
};

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

export function runNormalizeSelfTest() {
  const normalized = normalizeCollectedAo(fixture);
  assert(normalized?.dataQuality?.warnings.includes("Budget non publié par la source"), "Le budget absent doit rester tracé comme alerte.");

  const duplicate = { ...fixture, sourceUrl: "https://example.org/appels-offres/ao-1?copy=1" };
  assert(dedupeCollectedAos([fixture, duplicate]).length === 1, "La déduplication doit retirer les doublons source/titre/échéance.");

  const record = collectedAoToRecord(fixture);
  assert(record.budget === "NC", "Un budget absent ne doit pas être inventé.");
  assert(record.sourceUrl === fixture.sourceUrl, "L'URL source officielle doit être conservée.");
  assert(calculateDeadlineDays("2026-05-10", new Date("2026-05-07T12:00:00.000Z")) === 3, "Le délai doit être calculé en jours calendaires.");
}
