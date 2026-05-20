import type { AoSourceConnector } from "@/lib/aoSources/types";
import { moroccoPublicWebConnectors } from "@/lib/aoSources/publicWeb";
import { tedConnector } from "@/lib/aoSources/ted";
import { worldBankConnector } from "@/lib/aoSources/worldBank";

export const aoSourceConnectors: AoSourceConnector[] = [
  tedConnector,
  worldBankConnector,
  ...moroccoPublicWebConnectors
];

export function activeAoSourceConnectors() {
  const enabled = (process.env.AO_ENABLED_SOURCES || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (enabled.length === 0) return aoSourceConnectors;
  return aoSourceConnectors.filter((connector) => enabled.includes(connector.name.toLowerCase()));
}
