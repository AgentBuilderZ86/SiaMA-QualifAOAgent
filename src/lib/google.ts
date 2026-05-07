import { google } from "googleapis";

export type SheetRow = Record<string, string>;
export type SheetRecord = SheetRow & { _rowIndex: string };

export type SheetsConfigStatus = {
  configured: boolean;
  missing: string[];
  authMode: "oauth-refresh" | "application-default" | "missing";
};

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const SHEET_CACHE_TTL_MS = 15_000;
const SHEET_TITLES_CACHE_TTL_MS = 60_000;

const headersCache = new Map<string, string[]>();
const readCache = new Map<string, { expiresAt: number; value: { headers: string[]; records: SheetRecord[] } }>();
let sheetTitlesCache: { expiresAt: number; titles: Set<string> } | null = null;

export function getSheetsConfigStatus(): SheetsConfigStatus {
  const missing = ["GOOGLE_SHEET_ID"].filter((name) => !process.env[name]);
  const hasRefreshFlow = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN
  );

  return {
    configured: missing.length === 0,
    missing,
    authMode: hasRefreshFlow ? "oauth-refresh" : missing.length === 0 ? "application-default" : "missing"
  };
}

export function columnLetter(index: number) {
  let current = index + 1;
  let letters = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    current = Math.floor((current - 1) / 26);
  }
  return letters;
}

async function getSheetsClient() {
  const status = getSheetsConfigStatus();
  if (!status.configured) {
    throw new Error(`Configuration Google incomplète : ${status.missing.join(", ")}`);
  }

  if (status.authMode === "oauth-refresh") {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "urn:ietf:wg:oauth:2.0:oob"
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return google.sheets({ version: "v4", auth });
  }

  const auth = await google.auth.getClient({ scopes: SCOPES });
  return google.sheets({ version: "v4", auth });
}

function hasAllHeaders(current: string[], expected: string[]) {
  return expected.every((header) => current.includes(header));
}

function invalidateReadCache(tabName: string) {
  readCache.delete(tabName);
}

async function getSheetTitles() {
  const now = Date.now();
  if (sheetTitlesCache && sheetTitlesCache.expiresAt > now) return sheetTitlesCache.titles;
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID });
  const titles = new Set((meta.data.sheets ?? []).flatMap((sheet) => (sheet.properties?.title ? [sheet.properties.title] : [])));
  sheetTitlesCache = { expiresAt: now + SHEET_TITLES_CACHE_TTL_MS, titles };
  return titles;
}

export async function readSheet(tabName: string): Promise<SheetRow[]> {
  const { records } = await readSheetWithMeta(tabName);
  return records.map(({ _rowIndex, ...row }) => row);
}

export async function readSheetWithMeta(tabName: string): Promise<{ headers: string[]; records: SheetRecord[] }> {
  const cached = readCache.get(tabName);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `'${tabName}'`,
    valueRenderOption: "FORMATTED_VALUE"
  });

  const values = response.data.values ?? [];
  if (values.length < 2) {
    const emptyValue = { headers: values[0]?.map((header) => String(header ?? "").trim()) ?? [], records: [] };
    headersCache.set(tabName, emptyValue.headers);
    readCache.set(tabName, { expiresAt: Date.now() + SHEET_CACHE_TTL_MS, value: emptyValue });
    return emptyValue;
  }

  const headers = values[0].map((header) => String(header ?? "").trim());
  const records = values.slice(1).flatMap((row, index) => {
    if (!row.some((cell) => String(cell ?? "").trim())) return [];
    const record: SheetRecord = { _rowIndex: String(index + 2) };
    headers.forEach((header, index) => {
      record[header] = String(row[index] ?? "").trim();
    });
    return [record];
  });
  const value = { headers, records };
  headersCache.set(tabName, headers);
  readCache.set(tabName, { expiresAt: Date.now() + SHEET_CACHE_TTL_MS, value });
  return value;
}

export async function ensureSheet(tabName: string, headers: string[]) {
  const cachedHeaders = headersCache.get(tabName);
  if (cachedHeaders && hasAllHeaders(cachedHeaders, headers)) return cachedHeaders;

  const sheets = await getSheetsClient();
  const titles = await getSheetTitles();
  const existing = titles.has(tabName);

  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `'${tabName}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] }
    });
    titles.add(tabName);
    headersCache.set(tabName, headers);
    invalidateReadCache(tabName);
    return headers;
  }

  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `'${tabName}'!1:1`,
    valueRenderOption: "FORMATTED_VALUE"
  });
  const currentHeaders = (current.data.values?.[0] ?? []).map((header) => String(header ?? "").trim());
  const merged = [...currentHeaders];
  headers.forEach((header) => {
    if (!merged.includes(header)) merged.push(header);
  });

  if (merged.length !== currentHeaders.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `'${tabName}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [merged] }
    });
    invalidateReadCache(tabName);
  }

  headersCache.set(tabName, merged);
  return merged;
}

export async function appendRow(tabName: string, headers: string[], row: SheetRow) {
  const sheets = await getSheetsClient();
  const mergedHeaders = await ensureSheet(tabName, headers);
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `'${tabName}'`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [mergedHeaders.map((header) => row[header] ?? "")] }
  });
  invalidateReadCache(tabName);
}

export async function updateRow(tabName: string, rowIndex: number, headers: string[], row: SheetRow) {
  const sheets = await getSheetsClient();
  const mergedHeaders = await ensureSheet(tabName, headers);
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `'${tabName}'!A${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [mergedHeaders.map((header) => row[header] ?? "")] }
  });
  invalidateReadCache(tabName);
}

export async function updateCell(tabName: string, rowIndex: number, columnIndex: number, value: string) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `'${tabName}'!${columnLetter(columnIndex)}${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] }
  });
  invalidateReadCache(tabName);
}
