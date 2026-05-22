import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { extractDocumentBuffer, extractDocumentBufferWithOcr } from "@/lib/documents";

const FILES = [
  ["/home/ubuntu/.cursor/projects/workspace/uploads/Avis_Fran_ais_26_959d.pdf", "Avis Français 26.pdf"],
  ["/home/ubuntu/.cursor/projects/workspace/uploads/CPS_0c42.pdf", "CPS.pdf"],
  ["/home/ubuntu/.cursor/projects/workspace/uploads/RC_26_8be5.pdf", "RC 26.pdf"]
] as const;

describe("PDF utilisateur Office des Changes", () => {
  it("mesure extraction native et besoin OCR", async () => {
    const report: string[] = [];
    for (const [path, name] of FILES) {
      if (!fs.existsSync(path)) {
        report.push(`${name}: fichier absent`);
        continue;
      }
      const buffer = fs.readFileSync(path);
      const native = await extractDocumentBuffer({ name, buffer, contentType: "application/pdf" });
      report.push(`${name}: ${buffer.length}o native=${native.text.length} chars`);
      if (native.text.length < 200) {
        const t0 = Date.now();
        const ocr = await extractDocumentBufferWithOcr({ name, buffer, contentType: "application/pdf" });
        report.push(`  OCR ${Date.now() - t0}ms → ${ocr.text.length} chars ocrUsed=${ocr.ocrUsed}`);
      }
    }
    console.log(report.join("\n"));
    expect(report.length).toBeGreaterThan(0);
  }, 180_000);
});
