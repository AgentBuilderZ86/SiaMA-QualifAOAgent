import { describe, expect, it } from "vitest";
import { aoSourceConnectors, activeAoSourceConnectors } from "@/lib/aoSources/registry";
import { MOROCCO_GITHUB_AO_LEADS, MOROCCO_WEB_AO_SOURCES } from "@/lib/aoSources/moroccoSourceRegistry";
import { moroccoPublicWebConnectors } from "@/lib/aoSources/publicWeb";

describe("moroccoSourceRegistry", () => {
  it("declare des sources Maroc uniques, sourcées et exploitables", () => {
    const ids = new Set(MOROCCO_WEB_AO_SOURCES.map((source) => source.id));
    const homepages = new Set(MOROCCO_WEB_AO_SOURCES.map((source) => source.homepage));

    expect(ids.size).toBe(MOROCCO_WEB_AO_SOURCES.length);
    expect(homepages.size).toBe(MOROCCO_WEB_AO_SOURCES.length);
    expect(MOROCCO_WEB_AO_SOURCES.length).toBeGreaterThanOrEqual(10);
    expect(MOROCCO_WEB_AO_SOURCES.every((source) => source.country === "Maroc")).toBe(true);
    expect(MOROCCO_WEB_AO_SOURCES.every((source) => source.seeds.length > 0 && source.evidenceUrls.length > 0)).toBe(true);
  });

  it("convertit toutes les sources web Maroc en connecteurs activables", () => {
    expect(moroccoPublicWebConnectors).toHaveLength(MOROCCO_WEB_AO_SOURCES.length);
    expect(aoSourceConnectors.map((connector) => connector.name)).toContain("Portail Marocain des Marches Publics");
    expect(aoSourceConnectors.map((connector) => connector.name)).toContain("ADM Achats");
  });

  it("filtre les connecteurs par nom de source configuré", () => {
    const previous = process.env.AO_ENABLED_SOURCES;
    process.env.AO_ENABLED_SOURCES = "ADM Achats,ONDA Appels d'offres Achats";
    try {
      expect(activeAoSourceConnectors().map((connector) => connector.name)).toEqual([
        "ADM Achats",
        "ONDA Appels d'offres Achats"
      ]);
    } finally {
      process.env.AO_ENABLED_SOURCES = previous;
    }
  });

  it("garde les repos GitHub comme pistes d'audit uniquement", () => {
    expect(MOROCCO_GITHUB_AO_LEADS.length).toBeGreaterThanOrEqual(5);
    expect(MOROCCO_GITHUB_AO_LEADS.every((lead) => lead.use === "audit-only")).toBe(true);
    expect(MOROCCO_GITHUB_AO_LEADS.every((lead) => lead.license.length > 0)).toBe(true);
  });
});
