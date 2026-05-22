export type PatternKind = "GO" | "NOGO" | "WATCH";

export type GoPatternDefinition = {
  id: string;
  keywords: string[];
  score: number;
  manager: string;
  reason: string;
};

export type NogoPatternDefinition = {
  id: string;
  keywords: string[];
  reason: string;
  isWatch?: boolean;
};

export type ManagerInfo = {
  name: string;
  title: string;
};

export type PatternHit = {
  patternId: string;
  reason: string;
  hits: string[];
  score?: number;
  manager?: string;
};

export type PatternBonus = {
  client: string;
  points: number;
};

export type PatternScoreResult = {
  score: number;
  maxScore: number;
  decision: "GO" | "WATCH" | "NO GO";
  decisionLabel: string;
  decisionTone: "go" | "watch" | "nogo";
  activated: PatternHit[];
  blocking: PatternHit[];
  watching: PatternHit[];
  bonusClient: PatternBonus | null;
  recommendedManager: ManagerInfo | null;
  rationale: string;
  generatedAt: string;
};

export const MANAGERS: Record<string, ManagerInfo> = {
  "ZRIOUIL ADIL": { name: "ZRIOUIL ADIL", title: "Senior Manager TEC" },
  "ARHMIR GHITA": { name: "ARHMIR GHITA", title: "Manager" },
  "AL ALAMI HOUDA": { name: "AL ALAMI HOUDA", title: "Manager" },
  "TERCHOUNE ILIASS": { name: "TERCHOUNE ILIASS", title: "Manager" },
  "RHOUNI FARAH": { name: "RHOUNI FARAH", title: "Manager" }
};

export const GO_PATTERNS: GoPatternDefinition[] = [
  {
    id: "ia",
    keywords: [
      "intelligence artificielle",
      "ia generative",
      "ia générative",
      "llm",
      "machine learning",
      "roadmap ia",
      "base de donnees ia",
      "base de données ia",
      "formation ia"
    ],
    score: 3,
    manager: "ZRIOUIL ADIL",
    reason: "Pattern IA — Cosumar, BCP, CDG"
  },
  {
    id: "data-gouvernance",
    keywords: [
      "gouvernance",
      "data governance",
      "data catalog",
      "data quality",
      "qualite des donnees",
      "qualité des données",
      "mdm",
      "raci data",
      "data steward"
    ],
    score: 3,
    manager: "ZRIOUIL ADIL",
    reason: "Pattern Data/Gouvernance — OPTORG, CDG, BCP"
  },
  {
    id: "architecture-data",
    keywords: [
      "architecture data",
      "data warehouse",
      "data lakehouse",
      "data mesh",
      "etl",
      "elt",
      "pipeline donnees",
      "pipeline données",
      "plateforme donnees",
      "plateforme données",
      "platteforme données"
    ],
    score: 3,
    manager: "ZRIOUIL ADIL",
    reason: "Pattern Architecture Data / SI"
  },
  {
    id: "sap-erp",
    keywords: ["sap", "erp finance", "integration erp", "intégration erp", "consolidation legale", "consolidation légale"],
    score: 3,
    manager: "ZRIOUIL ADIL",
    reason: "Pattern SAP / ERP"
  },
  {
    id: "transfo-digitale",
    keywords: [
      "transformation digitale",
      "schema directeur",
      "schéma directeur",
      "sdsi",
      "systeme d'information",
      "système d'information",
      "si metier",
      "si métier"
    ],
    score: 3,
    manager: "ZRIOUIL ADIL",
    reason: "Pattern SI / Transformation digitale"
  },
  {
    id: "urbanisation-si",
    keywords: [
      "urbanisation si",
      "urbanisation des si",
      "plan de transformation",
      "architecture d'entreprise",
      "togaf",
      "cartographie des processus"
    ],
    score: 3,
    manager: "ZRIOUIL ADIL",
    reason: "Pattern SDSI — urbanisation SI / architecture d'entreprise"
  },
  {
    id: "capacity-building",
    keywords: [
      "renforcement des capacites",
      "renforcement des capacités",
      "capacity building",
      "ingenierie de formation",
      "ingénierie de formation",
      "programme de formation"
    ],
    score: 2,
    manager: "ARHMIR GHITA",
    reason: "Pattern Formation / Capacity Building — Expertise France"
  },
  {
    id: "rh",
    keywords: ["capital humain", "ressources humaines", "strategie rh", "stratégie rh", "gpec"],
    score: 3,
    manager: "AL ALAMI HOUDA",
    reason: "Pattern RH — COSUMAR"
  },
  {
    id: "sirh",
    keywords: ["sirh", "systeme d'information rh", "système d'information rh", "gestion paie"],
    score: 3,
    manager: "AL ALAMI HOUDA",
    reason: "Pattern SIRH"
  },
  {
    id: "transport",
    keywords: ["transport", "mobilite", "mobilité", "mass transit", "oncf"],
    score: 3,
    manager: "TERCHOUNE ILIASS",
    reason: "Pattern Transport — ONCF"
  },
  {
    id: "regulation",
    keywords: ["regulation", "régulation", "autorite de regulation", "autorité de régulation", "appui financement", "kfw"],
    score: 2,
    manager: "TERCHOUNE ILIASS",
    reason: "Pattern Régulation — Iliass"
  }
];

export const NOGO_PATTERNS: NogoPatternDefinition[] = [
  {
    id: "passi",
    keywords: ["passi", "audit securite des si", "audit sécurité des si", "pentest"],
    reason: "NO GO — PASSI requis"
  },
  {
    id: "cyber",
    keywords: ["siem", "soar", "soc ", "utm ", "antivirus", "firewall", "cybersecurite", "cybersécurité", "iso 27001"],
    reason: "NO GO — cybersécurité hors périmètre"
  },
  {
    id: "tma",
    keywords: ["tierce maintenance applicative", "tma", "maintenance applicative"],
    reason: "NO GO — TMA hors offre"
  },
  {
    id: "licences",
    keywords: ["location des licences", "microsoft 365", "licences logicielles"],
    reason: "NO GO — licences, pas du conseil"
  },
  {
    id: "sig",
    keywords: ["cadastre", "sig ", "modelisation sig", "modélisation sig", "recensement foncier"],
    reason: "NO GO — SIG/cadastre hors périmètre"
  },
  {
    id: "site-web",
    keywords: ["developpement d'un site web", "développement d'un site web", "site web institutionnel"],
    reason: "WATCH — dev web standard",
    isWatch: true
  }
];

export const STRATEGIC_CLIENTS = [
  "al mada",
  "bnp",
  "bmce",
  "attijariwafa",
  "cdc",
  "cdg",
  "ocp",
  "oncf",
  "pnud",
  "undp",
  "banque mondiale",
  "ades",
  "mca"
];

const MAX_PATTERN_SCORE = 15;

function normalize(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\n\r\t]+/g, " ");
}

function findHits(haystack: string, keywords: string[]): string[] {
  const normalizedHaystack = normalize(haystack);
  const found = new Set<string>();
  for (const keyword of keywords) {
    const normalizedKeyword = normalize(keyword);
    if (!normalizedKeyword) continue;
    if (normalizedHaystack.includes(normalizedKeyword)) {
      found.add(keyword);
    }
  }
  return [...found];
}

export function detectGoPatterns(text: string): PatternHit[] {
  const hits: PatternHit[] = [];
  for (const pattern of GO_PATTERNS) {
    const matches = findHits(text, pattern.keywords);
    if (matches.length) {
      hits.push({
        patternId: pattern.id,
        reason: pattern.reason,
        hits: matches,
        score: pattern.score,
        manager: pattern.manager
      });
    }
  }
  return hits;
}

export function detectNogoPatterns(text: string): { blocking: PatternHit[]; watching: PatternHit[] } {
  const blocking: PatternHit[] = [];
  const watching: PatternHit[] = [];
  for (const pattern of NOGO_PATTERNS) {
    const matches = findHits(text, pattern.keywords);
    if (!matches.length) continue;
    const hit: PatternHit = {
      patternId: pattern.id,
      reason: pattern.reason,
      hits: matches
    };
    if (pattern.isWatch) {
      watching.push(hit);
    } else {
      blocking.push(hit);
    }
  }
  return { blocking, watching };
}

export function detectStrategicClient(client: string): PatternBonus | null {
  const haystack = normalize(client);
  if (!haystack) return null;
  for (const strategic of STRATEGIC_CLIENTS) {
    if (haystack.includes(normalize(strategic))) {
      return { client: strategic, points: 1 };
    }
  }
  return null;
}

/** Seuils métier alignés spec pipeline : score >= 6 → GO, >= 3 → WATCH ; NOGO si `hasBlocker` (signaux bloquants). */
function decisionFromScore(score: number, hasBlocker: boolean): { decision: "GO" | "WATCH" | "NO GO"; tone: "go" | "watch" | "nogo"; label: string } {
  if (hasBlocker) return { decision: "NO GO", tone: "nogo", label: "NO GO — Signal bloquant détecté" };
  if (score >= 6) return { decision: "GO", tone: "go", label: "GO — Répondre fortement recommandé" };
  if (score >= 3) return { decision: "WATCH", tone: "watch", label: "WATCH — À confirmer avec le manager" };
  return { decision: "NO GO", tone: "nogo", label: "NO GO — Score insuffisant" };
}

function pickRecommendedManager(activated: PatternHit[]): ManagerInfo | null {
  if (!activated.length) return null;
  const sorted = [...activated].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const winner = sorted[0];
  if (!winner.manager) return null;
  return MANAGERS[winner.manager] || { name: winner.manager, title: "Manager" };
}

function buildRationale(score: number, activated: PatternHit[], blocking: PatternHit[], bonus: PatternBonus | null) {
  if (blocking.length) {
    return `Bloqué par ${blocking.length} signal(s) NO GO : ${blocking.map((item) => item.reason).join(" ; ")}.`;
  }
  if (!activated.length) {
    return "Aucun pattern Sia activé dans le document analysé.";
  }
  const parts = activated.map((hit) => `${hit.reason} (+${hit.score ?? 0} pts)`);
  if (bonus) {
    parts.push(`Bonus client stratégique « ${bonus.client} » (+${bonus.points} pt)`);
  }
  return `Score patterns ${score}/${MAX_PATTERN_SCORE} : ${parts.join(" ; ")}.`;
}

export function scoreAoFromPatterns(text: string, client: string): PatternScoreResult {
  const activated = detectGoPatterns(text);
  const { blocking, watching } = detectNogoPatterns(text);
  const baseScore = activated.reduce((sum, hit) => sum + (hit.score ?? 0), 0);
  const bonusClient = baseScore > 0 ? detectStrategicClient(client) : null;
  const totalScore = Math.min(MAX_PATTERN_SCORE, baseScore + (bonusClient?.points ?? 0));
  const hasBlocker = blocking.length > 0;
  const { decision, tone, label } = decisionFromScore(totalScore, hasBlocker);
  return {
    score: totalScore,
    maxScore: MAX_PATTERN_SCORE,
    decision,
    decisionLabel: label,
    decisionTone: tone,
    activated,
    blocking,
    watching,
    bonusClient,
    recommendedManager: pickRecommendedManager(activated),
    rationale: buildRationale(totalScore, activated, blocking, bonusClient),
    generatedAt: new Date().toISOString()
  };
}

export function patternToneClass(tone: "go" | "watch" | "nogo") {
  return tone === "go" ? "tag-go" : tone === "watch" ? "tag-warn" : "tag-nogo";
}
