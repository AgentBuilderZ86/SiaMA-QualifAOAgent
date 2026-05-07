import pptxgen from "pptxgenjs";
import type { AoRecord, IntelligentQualificationFiche, QualificationFiche, QualificationSlide } from "@/lib/aoTypes";

function clean(value: unknown) {
  return String(value ?? "").trim() || "À confirmer";
}

function addTitle(slide: pptxgen.Slide, title: string, subtitle?: string) {
  slide.addText(title, { x: 0.5, y: 0.35, w: 12.3, h: 0.45, fontSize: 24, bold: true, color: "172033", margin: 0.02 });
  if (subtitle) slide.addText(subtitle, { x: 0.5, y: 0.85, w: 12.2, h: 0.3, fontSize: 10, color: "64748B", margin: 0.02 });
}

function addBullets(slide: pptxgen.Slide, bullets: string[], x: number, y: number, w: number, h: number) {
  slide.addText(
    bullets.map((bullet) => ({ text: clean(bullet), options: { bullet: { type: "bullet" as const } } })),
    { x, y, w, h, fontSize: 13, color: "172033", breakLine: false, fit: "shrink", valign: "top" }
  );
}

function addSourceFooter(slide: pptxgen.Slide, sources: string[]) {
  slide.addText(`Sources : ${sources.length ? sources.join(" | ") : "À confirmer"}`, {
    x: 0.5,
    y: 7.1,
    w: 12.3,
    h: 0.25,
    fontSize: 7,
    color: "64748B",
    margin: 0.02
  });
}

function ensureSlides(fiche: QualificationFiche, intelligence: IntelligentQualificationFiche): QualificationSlide[] {
  if (intelligence.slideStoryboard.length >= 6) return intelligence.slideStoryboard.slice(0, 6);
  return [
    ...intelligence.slideStoryboard,
    {
      title: "Périmètre et livrables",
      keyMessage: intelligence.scopeSynthesis,
      bullets: [fiche.perimetre, fiche.livrables, fiche.duree],
      speakerNotes: "Vérifier que les livrables et échéances sont alignés avec le dossier de consultation."
    },
    {
      title: "Risques et questions ouvertes",
      keyMessage: "Les risques doivent être traités avant engagement ferme.",
      bullets: [...intelligence.risks.map((risk) => `${risk.label} : ${risk.mitigation}`), ...intelligence.clarificationQuestions],
      speakerNotes: "Utiliser cette slide comme base de comité GO/NO GO."
    },
    {
      title: "Stratégie de réponse",
      keyMessage: intelligence.responseStrategy,
      bullets: intelligence.differentiators,
      speakerNotes: "Adapter les différenciants aux références réellement disponibles."
    }
  ].slice(0, 6);
}

export async function buildQualificationDeck(ao: AoRecord, fiche: QualificationFiche, intelligence: IntelligentQualificationFiche) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "SiaMA Qualif AO";
  pptx.subject = `Qualification AO ${ao.displayAoNum}`;
  pptx.title = `Qualification ${ao.client}`;
  pptx.company = "Sia";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos"
  };

  const sources = intelligence.sources.map((source) => source.title).slice(0, 4);
  const cover = pptx.addSlide();
  cover.background = { color: "EEF3FF" };
  cover.addText("Qualification AO", { x: 0.55, y: 0.7, w: 5, h: 0.35, fontSize: 14, bold: true, color: "1D4ED8" });
  cover.addText(clean(ao.client), { x: 0.55, y: 1.15, w: 8.5, h: 0.7, fontSize: 32, bold: true, color: "172033", fit: "shrink" });
  cover.addText(clean(ao.sujet), { x: 0.55, y: 2.0, w: 8.6, h: 1.1, fontSize: 16, color: "334155", fit: "shrink" });
  cover.addText(`Recommandation : ${intelligence.recommendation}`, { x: 9.3, y: 1.15, w: 3, h: 0.45, fontSize: 18, bold: true, color: "FFFFFF", fill: { color: "1D4ED8" }, margin: 0.1 });
  cover.addText(`${intelligence.goNoGoScore}/100`, { x: 9.3, y: 1.75, w: 3, h: 0.75, fontSize: 34, bold: true, color: "172033", margin: 0.02 });
  cover.addText(`Confiance : ${intelligence.confidenceLevel}`, { x: 9.3, y: 2.55, w: 3, h: 0.35, fontSize: 12, color: "64748B" });
  addBullets(cover, intelligence.winThemes, 0.8, 4.0, 5.5, 1.4);
  cover.addText(intelligence.executiveSummary, { x: 6.7, y: 3.65, w: 5.8, h: 1.8, fontSize: 13, color: "172033", fit: "shrink", valign: "top" });
  addSourceFooter(cover, sources);

  const storyboard = ensureSlides(fiche, intelligence);
  storyboard.forEach((story, index) => {
    const slide = pptx.addSlide();
    addTitle(slide, `${index + 1}. ${story.title}`, story.keyMessage);
    addBullets(slide, story.bullets, 0.7, 1.55, 5.7, 4.8);
    slide.addShape(pptx.ShapeType.roundRect, { x: 6.9, y: 1.55, w: 5.7, h: 4.8, rectRadius: 0.12, fill: { color: "EFF6FF" }, line: { color: "DBE3EF" } });
    slide.addText(story.speakerNotes || intelligence.responseStrategy, { x: 7.25, y: 1.9, w: 5, h: 3.8, fontSize: 13, color: "172033", fit: "shrink", valign: "top" });
    addSourceFooter(slide, sources);
  });

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
}
