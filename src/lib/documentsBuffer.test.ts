import { describe, expect, it } from "vitest";
import { extractDocumentBufferWithOcr, extractUploadedDocuments, extractDocumentBuffer } from "@/lib/documents";

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

  it("agrège les champs Avis, CPS et RC en documents typés", async () => {
    const formData = new FormData();
    formData.append("documentAvis", new File(["Avis : appel d'offres."], "avis.txt", { type: "text/plain" }));
    formData.append("documentCps", new File(["CPS : prestations attendues."], "cps.txt", { type: "text/plain" }));
    formData.append("documentRc", new File(["RC : critères de notation."], "rc.txt", { type: "text/plain" }));

    const documents = await extractUploadedDocuments(formData);

    expect(documents.map((document) => document.kind)).toEqual(["Avis", "CPS", "RC"]);
    expect(documents.map((document) => document.name)).toEqual(["avis.txt", "cps.txt", "rc.txt"]);
  });

  it("n'échoue pas à l'import du parseur PDF (régression pdf-parse debug)", async () => {
    const extracted = await extractDocumentBuffer({
      name: "minimal.pdf",
      contentType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n%%EOF", "utf8")
    });

    expect(extracted.warning).not.toContain("ENOENT");
    expect(extracted.warning).not.toMatch(/test\/data\/05-versions-space/);
  });

  it("signale explicitement un besoin OCR quand un PDF n'a pas de texte exploitable", async () => {
    const previousProvider = process.env.OCR_PROVIDER;
    process.env.OCR_PROVIDER = "none";
    const extracted = await extractDocumentBufferWithOcr({
      name: "scan.pdf",
      contentType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n%%EOF", "utf8"),
      kind: "Avis"
    });
    process.env.OCR_PROVIDER = previousProvider;

    expect(extracted.kind).toBe("Avis");
    expect(extracted.extractionMode).toBe("unreadable");
    expect(extracted.warning).toContain("OCR requis");
  });
});
