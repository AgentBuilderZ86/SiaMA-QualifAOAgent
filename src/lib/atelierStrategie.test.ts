import { describe, expect, it } from "vitest";
import {
  appendWorkshopMessages,
  atelierCommitPayloadSchema,
  ATELIER_STRATEGIE_COLUMN,
  buildAtelierAssistantInstruction,
  emptyAtelierStrategie,
  extractDraftFromAssistant,
  mergeLastDraft,
  parseAtelierStrategie,
  serializeAtelierStrategie,
  stripDraftMarkerForDisplay
} from "./atelierStrategie";

describe("atelierStrategie", () => {
  it("exposes pipeline column name aligned with aoTypes", () => {
    expect(ATELIER_STRATEGIE_COLUMN).toBe("Atelier stratégie");
  });

  it("parseAtelierStrategie returns empty state for invalid JSON", () => {
    const s = parseAtelierStrategie("not json");
    expect(s.messages).toEqual([]);
    expect(s.version).toBe(1);
  });

  it("roundtrips valid state", () => {
    const base = emptyAtelierStrategie("u@x.com");
    const withMsg = appendWorkshopMessages(base, [{ role: "user", content: "hello" }]);
    const json = serializeAtelierStrategie(withMsg);
    const again = parseAtelierStrategie(json);
    expect(again.messages.length).toBe(1);
    expect(again.messages[0].content).toBe("hello");
  });

  it("mergeLastDraft applies parsed draft", () => {
    let s = emptyAtelierStrategie();
    s = mergeLastDraft(s, { budgetTtcPropose: "1000000", strategieResume: "x" });
    expect(s.lastDraft?.budgetTtcPropose).toBe("1000000");
  });

  it("extractDraftFromAssistant reads marker block", () => {
    const text = `Voici un conseil.\n\n---ATELIER_DRAFT_JSON---\n{"budgetTtcPropose":"2M DH","strategieResume":"focus"}`;
    const d = extractDraftFromAssistant(text);
    expect(d?.budgetTtcPropose).toContain("2M");
    expect(d?.strategieResume).toBe("focus");
    expect(stripDraftMarkerForDisplay(text)).not.toContain("---ATELIER_DRAFT_JSON---");
  });

  it("buildAtelierAssistantInstruction contains marker name", () => {
    expect(buildAtelierAssistantInstruction()).toContain("---ATELIER_DRAFT_JSON---");
  });

  it("atelierCommitPayloadSchema accepts partial payload", () => {
    const r = atelierCommitPayloadSchema.safeParse({ appendNote: "note seule" });
    expect(r.success).toBe(true);
  });
});
