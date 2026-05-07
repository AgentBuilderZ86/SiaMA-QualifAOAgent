import mammoth from "mammoth";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts/inspect-docx.mjs <docx-path>");
  process.exit(1);
}

const result = await mammoth.extractRawText({ path: filePath });
const text = result.value.replace(/\s+/g, " ").trim();
const checks = {
  chars: result.value.length,
  hasOptorg: /optorg/i.test(text),
  hasGouvernanceData: /gouvernance de la data/i.test(text),
  hasQualiteDonnees: /qualit[eé] des donn[eé]es/i.test(text),
  sample: text.slice(0, 500)
};

console.log(JSON.stringify(checks, null, 2));
if (!checks.hasOptorg || !checks.hasGouvernanceData) process.exitCode = 1;
