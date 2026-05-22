import { aoRepository } from "@/lib/aoRepository";
import { getSheetsConfigStatus } from "@/lib/google";
import { readAoCache } from "@/lib/aoSources/cache";
import { operationalDeadlineSubset, urgentByDeadline } from "@/lib/aoDeadline";
import type { AoRecord } from "@/lib/aoTypes";

export type DashboardData = {
  configured: boolean;
  missingConfig: string[];
  loadError: string;
  generatedAt: string;
  sourceMode: "native" | "google" | "hybrid" | "unconfigured";
  sourceReport: Array<{ sourceName: string; collectedAt: string; count: number; errors: string[] }>;
  totals: {
    all: number;
    go: number;
    aQualifier: number;
    noGo: number;
    activePipeline: number;
    won: number;
    lost: number;
    urgent: number;
  };
  byManager: Array<{ manager: string; total: number; go: number; urgent: number }>;
  urgent: AoRecord[];
  recent: AoRecord[];
  records: AoRecord[];
  googleSheetRecords: AoRecord[];
  scrapedRecords: AoRecord[];
};

function emptyDashboard(
  status = getSheetsConfigStatus(),
  loadError = ""
): DashboardData {
  return {
    configured: status.configured,
    missingConfig: status.missing,
    loadError,
    generatedAt: new Date().toISOString(),
    sourceMode: status.configured ? "google" : "unconfigured",
    sourceReport: [],
    totals: { all: 0, go: 0, aQualifier: 0, noGo: 0, activePipeline: 0, won: 0, lost: 0, urgent: 0 },
    byManager: [],
    urgent: [],
    recent: [],
    records: [],
    googleSheetRecords: [],
    scrapedRecords: []
  };
}

function statusCounts(records: AoRecord[]) {
  return {
    all: records.length,
    go: records.filter((ao) => ao.statut === "GO").length,
    aQualifier: records.filter((ao) => ao.statut === "A QUALIFIER").length,
    noGo: records.filter((ao) => ao.statut === "NO GO").length,
    activePipeline: records.filter((ao) => ["BO", "P2P", "PS", "PITCH"].includes(ao.statut)).length,
    won: records.filter((ao) => ao.statut === "PW").length,
    lost: records.filter((ao) => ao.statut === "PL").length,
    urgent: records.filter(urgentByDeadline).length
  };
}

function groupByManager(records: AoRecord[]) {
  const groups = new Map<string, AoRecord[]>();
  records.forEach((ao) => groups.set(ao.manager, [...(groups.get(ao.manager) ?? []), ao]));
  return [...groups.entries()]
    .map(([manager, aos]) => ({
      manager,
      total: aos.length,
      go: aos.filter((ao) => ao.statut === "GO").length,
      urgent: aos.filter(urgentByDeadline).length
    }))
    .sort((a, b) => b.total - a.total);
}

export async function getDashboardData(): Promise<DashboardData> {
  const status = getSheetsConfigStatus();

  try {
    const cache = await readAoCache();
    const groups = await aoRepository.listGroupedAos();
    const combined = groups.combined;
    const records = operationalDeadlineSubset(combined);
    if (!status.configured && combined.length === 0) {
      return {
        ...emptyDashboard(status),
        generatedAt: cache.generatedAt || new Date().toISOString(),
        sourceReport: cache.report
      };
    }
    const urgent = records
      .filter(urgentByDeadline)
      .sort((a, b) => (a.delaiJours ?? 999) - (b.delaiJours ?? 999))
      .slice(0, 12);
    return {
      configured: status.configured || combined.length > 0,
      missingConfig: status.configured ? [] : status.missing,
      loadError: "",
      generatedAt: cache.generatedAt || new Date().toISOString(),
      sourceMode:
        status.configured && cache.records.length > 0
          ? "hybrid"
          : status.configured
            ? "google"
            : "native",
      sourceReport: cache.report,
      totals: statusCounts(records),
      byManager: groupByManager(records).slice(0, 8),
      urgent,
      recent: [...records]
        .sort((a, b) => (a.delaiJours ?? 999) - (b.delaiJours ?? 999))
        .slice(0, 20),
      records,
      googleSheetRecords: operationalDeadlineSubset(groups.googleSheet),
      scrapedRecords: operationalDeadlineSubset(groups.scraped)
    };
  } catch (error) {
    return emptyDashboard(
      status,
      error instanceof Error ? error.message : "Erreur inconnue pendant la lecture Google Sheets."
    );
  }
}
