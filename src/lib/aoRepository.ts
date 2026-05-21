import {
  appendRow,
  ensureSheet,
  readSheetWithMeta,
  updateCell,
  updateRow,
  type SheetRecord,
  type SheetRow
} from "@/lib/google";
import { getSheetsConfigStatus } from "@/lib/google";
import { readLocalPipelineRow, upsertLocalPipelineRow } from "@/lib/pipelineLocalCache";
import {
  DEFAULT_REFERENTIELS,
  FEEDBACK_RULE_HEADERS,
  HIST_HEADERS,
  PIPELINE_HEADERS,
  REF_HEADERS,
  type AoRecord,
  type AoStatus,
  type PipelineEvent,
  type ReferentielItem,
  mergeAoRecords,
  sheetRecordToAo
} from "@/lib/aoTypes";
import { readAoCache } from "@/lib/aoSources/cache";
import { collectedAoToRecord } from "@/lib/aoSources/normalize";
import { buildPipelineByAoLookup, mergeScrapedWithPipeline, mergeSourcesWithPipelineTab, normalizeAoLookupKey } from "@/lib/aoMergeForDashboard";

const tabs = {
  aq: process.env.SHEET_AQ || "A qualifier vs qualifié",
  ec: process.env.SHEET_EC || "En cours",
  ng: process.env.SHEET_NG || "NO GO",
  pipeline: process.env.SHEET_PIPELINE || "Pipeline BO-Propale",
  history: process.env.SHEET_HIST || "Historique",
  referentials: process.env.SHEET_REFERENTIALS || "Référentiels",
  feedback: process.env.SHEET_FEEDBACK || "Feedback_Règles"
};

const sourceTabs: Array<{ name: string; fallback: AoStatus }> = [
  { name: tabs.aq, fallback: "A QUALIFIER" },
  { name: tabs.ec, fallback: "GO" },
  { name: tabs.ng, fallback: "NO GO" }
];

const allTabs: Array<{ name: string; fallback: AoStatus }> = [
  ...sourceTabs,
  { name: tabs.pipeline, fallback: "AUTRE" }
];

function nowFr() {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date());
}

function rowForPipeline(ao: Partial<AoRecord> & { aoNum: string }, status: AoStatus, updates: SheetRow = {}) {
  return {
    "N° AO": ao.aoNum,
    Sujet: ao.sujet || updates.Sujet || "",
    Client: ao.client || updates.Client || "",
    Manager: ao.manager || updates.Manager || "",
    Budget: ao.budget || updates.Budget || "",
    "Date limite": ao.dateLimite || updates["Date limite"] || "",
    "Statut workflow": status,
    "Date entrée statut": nowFr(),
    ...updates
  };
}

function dedupeKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function aoIdentityKeys(ao: AoRecord) {
  return [
    ao.aoNum,
    ao.displayAoNum,
    ao.sourceNoticeId || "",
    `${ao.client}|${ao.sujet}|${ao.dateLimite}`,
    `${ao.buyer || ao.client}|${ao.sujet}|${ao.dateLimite}`
  ]
    .map(dedupeKey)
    .filter(Boolean);
}

function dedupeNativeAgainstSheet(native: AoRecord[], sheet: AoRecord[]) {
  const sheetKeys = new Set(sheet.flatMap(aoIdentityKeys));
  return native.filter((ao) => !aoIdentityKeys(ao).some((key) => sheetKeys.has(key)));
}

export class GoogleSheetsAoRepository {
  async listNativeAos(): Promise<AoRecord[]> {
    const cache = await readAoCache();
    return cache.records.map(collectedAoToRecord);
  }

  async listSheetAos(): Promise<AoRecord[]> {
    if (!getSheetsConfigStatus().configured) return [];
    const groups = await Promise.all(
      allTabs.map(async (tab) => {
        try {
          const { records } = await readSheetWithMeta(tab.name);
          return records.map((row) => sheetRecordToAo(row, tab.name, tab.fallback));
        } catch {
          return [];
        }
      })
    );
    return groups.flat().filter((ao) => ao.aoNum && ao.aoNum !== "NC");
  }

  /** Onglets AQ / EC / NG uniquement (sans doublon avec l’onglet pipeline). */
  async listSourceSheetAos(): Promise<AoRecord[]> {
    if (!getSheetsConfigStatus().configured) return [];
    const groups = await Promise.all(
      sourceTabs.map(async (tab) => {
        try {
          const { records } = await readSheetWithMeta(tab.name);
          return records.map((row) => sheetRecordToAo(row, tab.name, tab.fallback));
        } catch {
          return [];
        }
      })
    );
    return groups.flat().filter((ao) => ao.aoNum && ao.aoNum !== "NC");
  }

  async listPipelineTabAos(): Promise<AoRecord[]> {
    if (!getSheetsConfigStatus().configured) return [];
    try {
      const { records } = await readSheetWithMeta(tabs.pipeline);
      return records.map((row) => sheetRecordToAo(row, tabs.pipeline, "AUTRE")).filter((ao) => ao.aoNum && ao.aoNum !== "NC");
    } catch {
      return [];
    }
  }

  async listGroupedAos(): Promise<{ googleSheet: AoRecord[]; scraped: AoRecord[]; combined: AoRecord[] }> {
    const [native, sourceRows, pipelineRows] = await Promise.all([
      this.listNativeAos(),
      this.listSourceSheetAos(),
      this.listPipelineTabAos()
    ]);
    const pipelineByKey = buildPipelineByAoLookup(pipelineRows);
    const googleSheet = mergeSourcesWithPipelineTab(sourceRows, pipelineRows);
    const scrapedRaw = dedupeNativeAgainstSheet(native, googleSheet);
    const scraped = mergeScrapedWithPipeline(scrapedRaw, pipelineByKey);
    return {
      googleSheet,
      scraped,
      combined: [...googleSheet, ...scraped]
    };
  }

  async ensureBaseSheets() {
    if (!getSheetsConfigStatus().configured) return;
    await ensureSheet(tabs.pipeline, PIPELINE_HEADERS);
    await ensureSheet(tabs.history, HIST_HEADERS);
    await ensureSheet(tabs.feedback, FEEDBACK_RULE_HEADERS);
    const refHeaders = await ensureSheet(tabs.referentials, REF_HEADERS);
    const { records } = await readSheetWithMeta(tabs.referentials);
    if (records.length === 0) {
      await Promise.all(
        DEFAULT_REFERENTIELS.map((item) =>
          appendRow(tabs.referentials, refHeaders, {
            type: item.type,
            name: item.name,
            value: item.value,
            unit: item.unit,
            source: item.source,
            active: item.active
          })
        )
      );
    }
  }

  async listAos(): Promise<AoRecord[]> {
    const { combined } = await this.listGroupedAos();
    return combined;
  }

  async findAo(aoNum: string): Promise<AoRecord | null> {
    const normalized = String(aoNum).trim();
    const key = normalizeAoLookupKey(normalized);
    const { googleSheet, scraped } = await this.listGroupedAos();
    const list = [...googleSheet, ...scraped];
    const source =
      list.find((ao) => ao.aoNum === normalized || ao.displayAoNum === normalized) ??
      (key
        ? list.find(
            (ao) =>
              normalizeAoLookupKey(ao.aoNum) === key ||
              normalizeAoLookupKey(ao.displayAoNum) === key ||
              decodeURIComponent(normalized) === ao.aoNum
          )
        : null) ??
      null;
    const pipelineRow = await this.getPipelineRecord(normalized).catch(() => null);
    const pipeline = pipelineRow ? sheetRecordToAo(pipelineRow, tabs.pipeline, "AUTRE") : null;
    return mergeAoRecords(source, pipeline);
  }

  async listPipeline(): Promise<AoRecord[]> {
    const { records } = await readSheetWithMeta(tabs.pipeline);
    return records.map((row) => sheetRecordToAo(row, tabs.pipeline, "AUTRE"));
  }

  async getPipelineRecord(aoNum: string): Promise<SheetRecord | null> {
    if (!getSheetsConfigStatus().configured) {
      const local = await readLocalPipelineRow(aoNum);
      return local ? { ...local, _rowIndex: "local" } : null;
    }
    const { records } = await readSheetWithMeta(tabs.pipeline);
    return records.find((row) => String(row["N° AO"]).trim() === String(aoNum).trim()) ?? null;
  }

  async upsertPipeline(ao: AoRecord, status: AoStatus, updates: SheetRow = {}) {
    const existing = await this.getPipelineRecord(ao.aoNum);
    const row = rowForPipeline(ao, status, { ...existing, ...updates });
    if (!getSheetsConfigStatus().configured) {
      await upsertLocalPipelineRow(ao.aoNum, row);
      return;
    }
    const headers = await ensureSheet(tabs.pipeline, PIPELINE_HEADERS);
    if (existing?._rowIndex && existing._rowIndex !== "local") {
      await updateRow(tabs.pipeline, Number(existing._rowIndex), headers, row);
    } else if (existing?._rowIndex === "local") {
      await appendRow(tabs.pipeline, headers, row);
    } else {
      await appendRow(tabs.pipeline, headers, row);
    }
  }

  async updateSourceStatus(ao: AoRecord, status: AoStatus) {
    if (!ao.rowIndex || ao.sourceTab === tabs.pipeline) return;
    const { headers } = await readSheetWithMeta(ao.sourceTab);
    const workflowIndex = headers.findIndex((header) => header.toLowerCase() === "statut workflow");
    const statutIndex = headers.findIndex((header) => header.toLowerCase() === "statut");
    if (workflowIndex >= 0) {
      await updateCell(ao.sourceTab, ao.rowIndex, workflowIndex, status);
    } else if (statutIndex >= 0) {
      await updateCell(ao.sourceTab, ao.rowIndex, statutIndex, status);
    }
  }

  async appendHistory(event: PipelineEvent) {
    if (!getSheetsConfigStatus().configured) return;
    await appendRow(tabs.history, HIST_HEADERS, {
      Timestamp: event.timestamp,
      "N° AO": event.aoNum,
      "Ancien statut": event.fromStatus,
      "Nouveau statut": event.toStatus,
      Acteur: event.actor,
      Note: event.note
    });
  }

  async appendRuleFeedback(row: SheetRow) {
    const headers = await ensureSheet(tabs.feedback, FEEDBACK_RULE_HEADERS);
    await appendRow(tabs.feedback, headers, row);
  }

  async transition(aoNum: string, toStatus: AoStatus, actor: string, note = "", updates: SheetRow = {}) {
    const ao = await this.findAo(aoNum);
    if (!ao) throw new Error(`AO ${aoNum} introuvable.`);
    const fromStatus = ao.statut;
    await this.upsertPipeline(ao, toStatus, updates);
    await this.updateSourceStatus(ao, toStatus);
    await this.appendHistory({
      timestamp: new Date().toISOString(),
      aoNum,
      fromStatus,
      toStatus,
      actor,
      note
    });
  }

  async readReferentials(): Promise<ReferentielItem[]> {
    let records: SheetRecord[] = [];
    try {
      ({ records } = await readSheetWithMeta(tabs.referentials));
    } catch {
      return DEFAULT_REFERENTIELS;
    }
    if (records.length === 0) return DEFAULT_REFERENTIELS;
    return records
      .filter((row) => String(row.active || row.actif || "").toUpperCase() !== "FALSE")
      .map((row) => ({
        type: row.type || row.Type || "",
        name: row.name || row.Nom || "",
        value: row.value || row.Valeur || "",
        unit: row.unit || row.Unité || "",
        source: row.source || row.Source || "Source non renseignée",
        active: row.active || row.actif || "TRUE"
      }));
  }
}

export const aoRepository = new GoogleSheetsAoRepository();
