/**
 * Tests unitaires du pipeline OCR dans documents.ts.
 * Les modules OCR natifs (Tesseract, pdfRasterOcr) sont mockés pour rester en pur Node/CI.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { extractDocumentBuffer, extractDocumentBufferWithOcr, isServerlessRuntime, extractUploadedDocuments } from "@/lib/documents";

// --- Mocks modules OCR (imports dynamiques dans runOcrFallback) ---

vi.mock("@/lib/ocr/pdfRasterOcr", () => ({
  ocrPdfBuffer: vi.fn().mockResolvedValue({ text: "", warning: "OCR PDF mock vide." })
}));

vi.mock("@/lib/ocr/tesseractOcr", () => ({
  recognizeImageBuffer: vi.fn().mockResolvedValue({ text: "", warning: "OCR Tesseract mock vide." })
}));

vi.mock("@/lib/ocr/paddleOcr", () => ({
  paddleOcrConfigured: vi.fn().mockReturnValue(false),
  extractWithPaddleOcr: vi.fn().mockResolvedValue({ text: "", warning: "PaddleOCR mock non configuré." })
}));

// Mock minimal pour pdf-parse (avoid fichier de test ENOENT)
vi.mock("pdf-parse/lib/pdf-parse.js", () => ({
  default: vi.fn().mockResolvedValue({ text: "", numpages: 1 })
}));

// --- Helpers ---

const minimalPdfBuffer = Buffer.from("%PDF-1.4\n%%EOF", "utf8");
const textBuffer = Buffer.from("Objet : mission de gouvernance data.\nCritères : expérience SI.", "utf8");

describe("isServerlessRuntime", () => {
  it("retourne false en environnement local", () => {
    const prev = process.env.NETLIFY;
    delete process.env.NETLIFY;
    expect(isServerlessRuntime()).toBe(false);
    process.env.NETLIFY = prev;
  });

  it("retourne true quand NETLIFY=true", () => {
    const prev = process.env.NETLIFY;
    process.env.NETLIFY = "true";
    expect(isServerlessRuntime()).toBe(true);
    process.env.NETLIFY = prev;
  });
});

describe("extractDocumentBuffer — texte natif", () => {
  it("extrait un .txt directement", async () => {
    const result = await extractDocumentBuffer({ name: "note.txt", buffer: textBuffer });
    expect(result.text).toContain("gouvernance data");
    expect(result.warning).toBe("");
  });

  it("retourne vide + warning pour un buffer vide", async () => {
    const result = await extractDocumentBuffer({ name: "vide.pdf", buffer: Buffer.alloc(0) });
    expect(result.text).toBe("");
    expect(result.warning).toMatch(/vide/i);
  });

  it("n'inclut pas ENOENT dans le warning PDF (régression pdf-parse debug)", async () => {
    const result = await extractDocumentBuffer({ name: "scan.pdf", buffer: minimalPdfBuffer });
    expect(result.warning).not.toContain("ENOENT");
    expect(result.warning).not.toMatch(/test\/data\/05-versions-space/);
  });

  it("extrait un .docx via mammoth", async () => {
    // Buffer DOCX minimal valide — mammoth retourne string vide sans crasher
    const result = await extractDocumentBuffer({
      name: "doc.docx",
      buffer: Buffer.from("PK\x03\x04", "binary"),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
    // Peut retourner warning ou texte vide — ne doit pas throw
    expect(typeof result.text).toBe("string");
    expect(typeof result.warning).toBe("string");
  });
});

describe("extractDocumentBufferWithOcr — branchement OCR", () => {
  let prevProvider: string | undefined;

  beforeEach(() => {
    prevProvider = process.env.OCR_PROVIDER;
  });

  afterEach(() => {
    if (prevProvider === undefined) {
      delete process.env.OCR_PROVIDER;
    } else {
      process.env.OCR_PROVIDER = prevProvider;
    }
    vi.clearAllMocks();
  });

  it("retourne extractionMode=native si le PDF a du texte (>= 180 chars)", async () => {
    const longText = "Texte natif ".repeat(20); // ~240 chars
    const { default: pdfParseMock } = await import("pdf-parse/lib/pdf-parse.js");
    vi.mocked(pdfParseMock).mockResolvedValueOnce({ text: longText, numpages: 1 });

    const result = await extractDocumentBufferWithOcr({
      name: "rapport.pdf",
      buffer: minimalPdfBuffer,
      kind: "CPS"
    });

    expect(result.extractionMode).toBe("native");
    expect(result.ocrUsed).toBe(false);
    expect(result.kind).toBe("CPS");
  });

  it("déclenche OCR si le texte natif est insuffisant (< 180 chars)", async () => {
    process.env.OCR_PROVIDER = "tesseract";
    const { default: pdfParseMock } = await import("pdf-parse/lib/pdf-parse.js");
    vi.mocked(pdfParseMock).mockResolvedValueOnce({ text: "Peu de texte.", numpages: 1 });

    const { ocrPdfBuffer } = await import("@/lib/ocr/pdfRasterOcr");
    vi.mocked(ocrPdfBuffer).mockResolvedValueOnce({ text: "Texte OCR extrait.", warning: "" });

    const result = await extractDocumentBufferWithOcr({
      name: "scan.pdf",
      buffer: minimalPdfBuffer,
      kind: "Avis"
    });

    expect(result.ocrUsed).toBe(true);
    expect(result.extractionMode).toBe("ocr");
    expect(result.text).toContain("Texte OCR extrait");
  });

  it("retourne extractionMode=unreadable si OCR=none", async () => {
    process.env.OCR_PROVIDER = "none";

    const result = await extractDocumentBufferWithOcr({
      name: "scan.pdf",
      buffer: minimalPdfBuffer,
      kind: "RC"
    });

    expect(result.extractionMode).toBe("unreadable");
    expect(result.ocrUsed).toBe(false);
    expect(result.warning).toMatch(/OCR désactivé/);
  });

  it("inclut sha256 dans le résultat", async () => {
    process.env.OCR_PROVIDER = "none";

    const result = await extractDocumentBufferWithOcr({
      name: "doc.txt",
      buffer: textBuffer
    });

    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("extractUploadedDocuments — logique serverless OCR skip", () => {
  let prevNetlify: string | undefined;

  afterEach(() => {
    if (prevNetlify === undefined) {
      delete process.env.NETLIFY;
    } else {
      process.env.NETLIFY = prevNetlify;
    }
    vi.clearAllMocks();
  });

  it("saute l'OCR sur Netlify si le texte natif global ≥ 1200 chars", async () => {
    prevNetlify = process.env.NETLIFY;
    process.env.NETLIFY = "true";

    const longAvis = "Avis : " + "x".repeat(1300);
    const formData = new FormData();
    formData.append("documentAvis", new File([longAvis], "avis.txt", { type: "text/plain" }));
    formData.append("documentCps", new File([minimalPdfBuffer], "cps.pdf", { type: "application/pdf" }));

    const docs = await extractUploadedDocuments(formData);

    const cps = docs.find((d) => d.kind === "CPS");
    expect(cps?.ocrUsed).toBeFalsy();
    expect(cps?.warning).toContain("OCR non exécuté");
  });

  it("retourne un tableau vide si formData sans fichiers", async () => {
    const formData = new FormData();
    const docs = await extractUploadedDocuments(formData);
    expect(docs).toHaveLength(0);
  });
});
