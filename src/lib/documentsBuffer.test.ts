import { describe, expect, it } from "vitest";
import { extractDocumentBuffer } from "@/lib/documents";

describe("extractDocumentBuffer", () => {
  it("extrait un document texte téléchargé depuis une URL", async () => {
    const extracted = await extractDocumentBuffer({
      name: "rc.txt",
      contentType: "text/plain",
      buffer: Buffer.from("Objet : mission de gouvernance data\nCritères : expérience SI", "utf8")
    });

    expect(extracted.name).toBe("rc.txt");
    expect(extracted.text).toContain("gouvernance data");
    expect(extracted.warning).toBe("");
  });
});
