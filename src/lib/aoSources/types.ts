import type { AoDataQuality, AoSourceKind } from "@/lib/aoTypes";

export type CollectedAo = {
  sourceKind: Exclude<AoSourceKind, "google-sheet" | "manual">;
  sourceName: string;
  sourceUrl: string;
  sourceNoticeId: string;
  title: string;
  buyer: string;
  country: string;
  publishedAt: string;
  deadline: string;
  procedureType: string;
  estimatedBudget: string;
  currency: string;
  collectedAt: string;
  raw: Record<string, string>;
  dataQuality?: AoDataQuality;
};

export type AoSourceRunResult = {
  sourceName: string;
  collectedAt: string;
  records: CollectedAo[];
  errors: string[];
};

export type AoSourceConnector = {
  name: string;
  kind: CollectedAo["sourceKind"];
  homepage: string;
  fetchAos: () => Promise<AoSourceRunResult>;
};

export type AoCachePayload = {
  generatedAt: string;
  records: CollectedAo[];
  report: Array<{
    sourceName: string;
    collectedAt: string;
    count: number;
    errors: string[];
  }>;
};
