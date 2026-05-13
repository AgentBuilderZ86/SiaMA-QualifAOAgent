import { describe, expect, it } from "vitest";
import {
  normalizeDashboardReturnPathFromReferer,
  parseRefreshSourcesFlash,
  stripRefreshQueryFromSearch
} from "./refreshReturnPath";

describe("normalizeDashboardReturnPathFromReferer", () => {
  it("retombe sur /dashboard sans referer", () => {
    expect(normalizeDashboardReturnPathFromReferer(null)).toBe("/dashboard");
    expect(normalizeDashboardReturnPathFromReferer("")).toBe("/dashboard");
  });

  it("extrait pathname + query pour une URL dashboard", () => {
    expect(normalizeDashboardReturnPathFromReferer("https://ex.net/dashboard?statut=GO")).toBe("/dashboard?statut=GO");
  });

  it("ignore les chemins hors dashboard", () => {
    expect(normalizeDashboardReturnPathFromReferer("https://ex.net/ao/123")).toBe("/dashboard");
  });

  it("retire refreshSources et refreshMsg du referer", () => {
    expect(
      normalizeDashboardReturnPathFromReferer(
        "https://ex.net/dashboard?statut=GO&refreshSources=error&refreshMsg=foo"
      )
    ).toBe("/dashboard?statut=GO");
  });
});

describe("stripRefreshQueryFromSearch", () => {
  it("supprime les clés flash", () => {
    expect(stripRefreshQueryFromSearch("?a=1&refreshSources=error&refreshMsg=x")).toBe("?a=1");
  });
});

describe("parseRefreshSourcesFlash", () => {
  it("retourne null si pas d erreur", () => {
    expect(parseRefreshSourcesFlash({})).toBeNull();
    expect(parseRefreshSourcesFlash({ refreshSources: "ok" })).toBeNull();
  });

  it("parse erreur avec message", () => {
    const msg = encodeURIComponent("Timeout");
    const r = parseRefreshSourcesFlash({ refreshSources: "error", refreshMsg: msg });
    expect(r?.kind).toBe("error");
    expect(r?.message).toBe("Timeout");
  });
});
