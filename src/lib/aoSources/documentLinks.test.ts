import { describe, expect, it } from "vitest";
import { extractAoDocumentCandidates } from "@/lib/aoSources/documentLinks";

describe("aoSources documentLinks", () => {
  it("détecte et classe les liens de pièces AO depuis HTML et Markdown", () => {
    const content = `
      <a href="/docs/cps.pdf">CPS - cahier des prescriptions spéciales</a>
      <a href="https://buyer.test/rc.docx">Télécharger le RC</a>
      [Bordereau des prix](https://buyer.test/bpu.zip)
      <a href="/actualites">Actualité sans document</a>
    `;

    const candidates = extractAoDocumentCandidates(content, {
      aoNum: "AO-1",
      sourceUrl: "https://buyer.test/ao/1"
    });

    expect(candidates.map((candidate) => candidate.kind)).toEqual(["CPS", "RC", "Bordereau"]);
    expect(candidates.map((candidate) => candidate.documentUrl)).toEqual([
      "https://buyer.test/docs/cps.pdf",
      "https://buyer.test/rc.docx",
      "https://buyer.test/bpu.zip"
    ]);
  });
});
