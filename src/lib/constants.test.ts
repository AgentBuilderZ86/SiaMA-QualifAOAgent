import { describe, expect, it } from "vitest";
import {
  NETLIFY_MAX_DURATION_MS,
  QUALIFICATION_BUDGET_MS,
  DOCUMENT_LIMITS,
} from "@/lib/constants";

describe("constants — cohérence du budget de qualification", () => {
  it("le budget serverless (rec + intelligence) reste sous le plafond Netlify sans OCR", () => {
    const { recommendation, intelligence } = QUALIFICATION_BUDGET_MS;
    // Budget sans OCR : extraction 5 s + saves 4 s + rec + intelligence
    // Quand l'OCR est déclenché (≤ 20 s), aoService.ts réduit intelligenceMs dynamiquement.
    const extractionOverhead = 5_000 + 4_000;
    const total = extractionOverhead + recommendation.serverless + intelligence.serverless;
    expect(total).toBeLessThanOrEqual(NETLIFY_MAX_DURATION_MS);
  });

  it("le budget ZIP serverless est plus conservateur que le budget standard", () => {
    const { intelligence } = QUALIFICATION_BUDGET_MS;
    expect(intelligence.zip).toBeLessThan(intelligence.serverless);
  });

  it("les limites de document sont positives et cohérentes", () => {
    expect(DOCUMENT_LIMITS.maxExtractChars).toBeGreaterThan(DOCUMENT_LIMITS.maxZipEntryChars);
    expect(DOCUMENT_LIMITS.maxZipEntriesServerless).toBeLessThan(DOCUMENT_LIMITS.maxZipEntriesLocal);
    expect(DOCUMENT_LIMITS.maxZipDeferredOcrServerless).toBeLessThan(DOCUMENT_LIMITS.maxZipDeferredOcrLocal);
    expect(DOCUMENT_LIMITS.minTextCharsBeforeOcr).toBeGreaterThan(0);
    expect(DOCUMENT_LIMITS.serverlessSkipOcrIfNativeChars).toBeGreaterThan(
      DOCUMENT_LIMITS.minTextCharsBeforeOcr
    );
  });
});
