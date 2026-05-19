import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { AoRecord, AoStatus } from "@/lib/aoTypes";

const dashboard = vi.hoisted(() => ({
  getDashboardData: vi.fn()
}));

vi.mock("@/lib/ao", () => ({
  getDashboardData: dashboard.getDashboardData
}));

vi.mock("@/lib/google", () => ({
  readSheet: vi.fn().mockResolvedValue([])
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue("office.manager@example.com")
}));

function ao(statut: AoStatus, client: string): AoRecord {
  return {
    aoNum: `AO-${statut}`,
    displayAoNum: `AO-${statut}`,
    client,
    sujet: "Mission test",
    manager: "Alice Martin",
    budget: "NC",
    delaiJours: 10,
    dateLimite: "2026-06-15",
    decisionIa: "",
    justificationIa: "",
    statut,
    sourceTab: "Pipeline",
    raw: {}
  };
}

function dashboardData(records: AoRecord[]) {
  return {
    configured: true,
    missingConfig: [],
    loadError: "",
    generatedAt: "2026-05-19T00:00:00.000Z",
    sourceMode: "native",
    sourceReport: [],
    totals: {
      all: records.length,
      go: 0,
      aQualifier: records.filter((record) => record.statut === "A QUALIFIER").length,
      noGo: 0,
      activePipeline: records.filter((record) => ["BO", "P2P", "PS", "PITCH"].includes(record.statut)).length,
      won: records.filter((record) => record.statut === "PW").length,
      lost: records.filter((record) => record.statut === "PL").length,
      urgent: 0
    },
    byManager: [],
    urgent: [],
    recent: records,
    records,
    googleSheetRecords: records,
    scrapedRecords: []
  };
}

function propsOf(node: ReactNode): { children?: ReactNode; id?: string } {
  return (node as ReactElement<{ children?: ReactNode; id?: string }>).props;
}

function findById(node: ReactNode, id: string): ReactNode | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findById(child, id);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const props = propsOf(node);
  if (props.id === id) return node;
  return findById(props.children, id);
}

function textContent(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  if (isValidElement(node)) return textContent(propsOf(node).children);
  return "";
}

describe("OfficeManagerPage", () => {
  it("limite la section todolist aux AO BO et P2P", async () => {
    dashboard.getDashboardData.mockResolvedValue(
      dashboardData([
        ao("P2P", "Client P2P"),
        ao("BO", "Client BO"),
        ao("A QUALIFIER", "Client A Qualifier"),
        ao("PW", "Client PW")
      ])
    );
    const { default: OfficeManagerPage } = await import("./page");

    const page = await OfficeManagerPage();
    const todoSection = findById(page, "todo-office");
    const text = textContent(todoSection);

    expect(text).toContain("Client P2P");
    expect(text).toContain("Client BO");
    expect(text).not.toContain("Client A Qualifier");
    expect(text).not.toContain("Client PW");
  });
});
