import { z } from "zod";

/** Nom de colonne Pipeline Google Sheets (aligné sur PIPELINE_HEADERS). */
export const ATELIER_STRATEGIE_COLUMN = "Atelier stratégie" as const;

const MAX_MESSAGE_LEN = 12_000;
const MAX_MESSAGES = 40;
const MAX_CELL_CHARS = 45_000;

const workshopMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_MESSAGE_LEN),
  at: z.string()
});

export const atelierLastDraftSchema = z.object({
  budgetTtcPropose: z.string().max(500).optional(),
  strategieResume: z.string().max(16_000).optional(),
  equipeChiffrageNarratif: z.string().max(16_000).optional(),
  sectionsPropaleCibles: z.array(z.string().max(200)).max(24).optional()
});

export type AtelierLastDraft = z.infer<typeof atelierLastDraftSchema>;

export const atelierStrategieV1Schema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  actorEmail: z.string().max(320).optional(),
  messages: z.array(workshopMessageSchema).max(MAX_MESSAGES),
  lastDraft: atelierLastDraftSchema.optional(),
  committedAt: z.string().optional()
});

export type AtelierStrategieV1 = z.infer<typeof atelierStrategieV1Schema>;

export const atelierCommitPayloadSchema = z.object({
  budgetTtcPropose: z.string().max(500).optional(),
  strategieResume: z.string().max(16_000).optional(),
  equipeChiffrageNarratif: z.string().max(16_000).optional(),
  sectionsPropaleCibles: z.array(z.string().max(200)).max(24).optional(),
  recommandation: z.string().max(4000).optional(),
  appendNote: z.string().max(8000).optional()
});

export type AtelierCommitPayload = z.infer<typeof atelierCommitPayloadSchema>;

export function emptyAtelierStrategie(actorEmail?: string): AtelierStrategieV1 {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    actorEmail,
    messages: [],
    lastDraft: undefined,
    committedAt: undefined
  };
}

export function parseAtelierStrategie(raw: string | undefined | null): AtelierStrategieV1 {
  if (!raw?.trim()) return emptyAtelierStrategie();
  try {
    const parsed = JSON.parse(raw) as unknown;
    const r = atelierStrategieV1Schema.safeParse(parsed);
    if (r.success) return trimAtelierForCell(r.data);
    return emptyAtelierStrategie();
  } catch {
    return emptyAtelierStrategie();
  }
}

function trimAtelierForCell(state: AtelierStrategieV1): AtelierStrategieV1 {
  let s = { ...state, messages: [...state.messages] };
  while (JSON.stringify(s).length > MAX_CELL_CHARS && s.messages.length > 2) {
    s = { ...s, messages: s.messages.slice(1) };
  }
  return s;
}

export function serializeAtelierStrategie(state: AtelierStrategieV1): string {
  return `${JSON.stringify(trimAtelierForCell(state), null, 0)}\n`;
}

export function appendWorkshopMessages(
  state: AtelierStrategieV1,
  additions: Array<{ role: "user" | "assistant"; content: string }>,
  actorEmail?: string
): AtelierStrategieV1 {
  const now = new Date().toISOString();
  const next: AtelierStrategieV1 = {
    ...state,
    updatedAt: now,
    actorEmail: actorEmail ?? state.actorEmail,
    messages: [
      ...state.messages,
      ...additions.map((m) => ({
        role: m.role,
        content: m.content.slice(0, MAX_MESSAGE_LEN),
        at: now
      }))
    ]
  };
  if (next.messages.length > MAX_MESSAGES) {
    next.messages = next.messages.slice(-MAX_MESSAGES);
  }
  return trimAtelierForCell(next);
}

export function mergeLastDraft(state: AtelierStrategieV1, draft: AtelierLastDraft | undefined): AtelierStrategieV1 {
  if (!draft) return { ...state, updatedAt: new Date().toISOString() };
  const parsed = atelierLastDraftSchema.safeParse(draft);
  return {
    ...state,
    updatedAt: new Date().toISOString(),
    lastDraft: parsed.success ? parsed.data : state.lastDraft
  };
}

const DRAFT_MARKER = "---ATELIER_DRAFT_JSON---";

export function buildAtelierAssistantInstruction(): string {
  return [
    "Après ta réponse conversationnelle (en français), termine toujours par un bloc sur une nouvelle ligne exactement :",
    DRAFT_MARKER,
    "Puis un objet JSON sur une seule ligne ou un bloc ```json ... ``` avec uniquement les clés optionnelles :",
    '{"budgetTtcPropose":"texte","strategieResume":"texte","equipeChiffrageNarratif":"texte","sectionsPropaleCibles":["..."]}',
    "N'invente aucun chiffre : utilise À confirmer si besoin. Les champs absentes peuvent être omis."
  ].join("\n");
}

export function extractDraftFromAssistant(text: string): AtelierLastDraft | undefined {
  const idx = text.indexOf(DRAFT_MARKER);
  const tail = idx >= 0 ? text.slice(idx + DRAFT_MARKER.length) : text;
  const fenced = tail.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced || tail).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) return undefined;
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    const r = atelierLastDraftSchema.safeParse(obj);
    return r.success ? r.data : undefined;
  } catch {
    return undefined;
  }
}

export function stripDraftMarkerForDisplay(text: string): string {
  const idx = text.indexOf(DRAFT_MARKER);
  return idx >= 0 ? text.slice(0, idx).trimEnd() : text;
}
