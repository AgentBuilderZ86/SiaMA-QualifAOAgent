/**
 * Routage LLM : Anthropic Messages (api.anthropic.com) si ANTHROPIC_API_KEY,
 * sinon API compatible OpenAI (chat/completions).
 *
 * Priorité : LLM_PROVIDER=anthropic|openai si défini ; sinon Anthropic si clé présente ; sinon OpenAI.
 */

export type LlmProviderName = "anthropic" | "openai";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export function resolveLlmProvider(): LlmProviderName | null {
  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === "anthropic") {
    return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  }
  if (explicit === "openai") {
    return process.env.OPENAI_API_KEY || process.env.LLM_API_KEY ? "openai" : null;
  }
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY || process.env.LLM_API_KEY) return "openai";
  return null;
}

/** True si au moins une configuration LLM utilisable est présente. */
export function hasConfiguredLlm(): boolean {
  return resolveLlmProvider() !== null;
}

function anthropicTextFromResponse(json: unknown): string {
  const root = json as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
  };
  if (root.error?.message) {
    console.error("[llmChat] Anthropic error:", root.error.message);
  }
  const blocks = root.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

async function completeAnthropic(options: {
  system: string;
  user: string;
  temperature: number;
  maxOutputTokens: number;
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model =
    process.env.ANTHROPIC_MODEL?.trim() ||
    process.env.LLM_MODEL?.trim() ||
    "claude-sonnet-4-20250514";

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxOutputTokens,
      temperature: options.temperature,
      system: options.system,
      messages: [{ role: "user", content: options.user }]
    })
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const msg = json && typeof json === "object" && "error" in json ? JSON.stringify((json as { error: unknown }).error) : response.statusText;
    console.error("[llmChat] Anthropic HTTP", response.status, msg);
    return null;
  }

  const text = anthropicTextFromResponse(json);
  return text || null;
}

async function completeOpenAiCompatible(options: {
  system: string;
  user: string;
  temperature: number;
  maxOutputTokens: number;
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || process.env.LLM_MODEL || "gpt-4o-mini";
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: options.temperature,
      max_tokens: options.maxOutputTokens,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user }
      ]
    })
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("[llmChat] OpenAI-compatible HTTP", response.status, json);
    return null;
  }

  const content = (json as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content;
  return typeof content === "string" && content.length ? content : null;
}

export type CompleteChatOptions = {
  system: string;
  user: string;
  temperature?: number;
  /** Sortie max ; défaut 8192 (réponses courtes) ou ANTHROPIC_MAX_OUTPUT_TOKENS pour les longues réponses JSON. */
  maxOutputTokens?: number;
};

/**
 * Appelle le LLM configuré. Retourne null si pas de clé, erreur réseau ou réponse vide.
 */
export async function completeChat(options: CompleteChatOptions): Promise<string | null> {
  const provider = resolveLlmProvider();
  if (!provider) return null;

  const temperature = options.temperature ?? 0.2;
  const maxOutputTokens =
    options.maxOutputTokens ?? parseInt(process.env.LLM_MAX_OUTPUT_TOKENS || "8192", 10);

  if (provider === "anthropic") {
    return completeAnthropic({
      system: options.system,
      user: options.user,
      temperature,
      maxOutputTokens: Math.min(Math.max(maxOutputTokens, 256), 64000)
    });
  }

  return completeOpenAiCompatible({
    system: options.system,
    user: options.user,
    temperature,
    maxOutputTokens: Math.min(Math.max(maxOutputTokens, 256), 128000)
  });
}

/**
 * Extrait les informations business clés d'un PDF scanné via Claude vision (document input).
 * Fait extraction structurée directement depuis les images — évite OCR texte brut + pre-summary séparé.
 * Utilise le modèle configuré (ANTHROPIC_MODEL) ou Sonnet par défaut pour meilleure précision sur AOs.
 * Retourne null si l'API Anthropic n'est pas configurée ou si l'extraction échoue.
 */
export async function extractPdfTextVision(pdfBuffer: Buffer): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const base64 = pdfBuffer.toString("base64");
  // Use configured model or Sonnet for better precision on structured AO data
  const model =
    process.env.ANTHROPIC_MODEL?.trim() ||
    process.env.LLM_MODEL?.trim() ||
    "claude-sonnet-4-20250514";

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 }
            },
            {
              type: "text",
              text:
                "Tu es expert en qualification d'appels d'offres publics. Ce document est un AO scanné.\n\n" +
                "Extrais uniquement les informations suivantes si elles sont clairement présentes :\n" +
                "1. Objet exact de la mission (1-2 phrases)\n" +
                "2. Périmètre et livrables attendus\n" +
                "3. Durée d'exécution\n" +
                "4. Budget estimé ou montant indicatif\n" +
                "5. Critères d'évaluation technique avec pondérations\n" +
                "6. Profils requis (niveau, expérience, compétences clés)\n" +
                "7. Références similaires exigées\n" +
                "8. Date limite de remise des offres\n" +
                "9. Lieu d'exécution / maître d'ouvrage\n" +
                "10. Modalités de paiement et jalons financiers\n\n" +
                "Pour chaque item absent du document : ne pas inventer, omettre simplement.\n" +
                "Retourne le texte structuré, sans reformulation ni commentaire."
            }
          ]
        }
      ]
    })
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) return null;
  const text = anthropicTextFromResponse(json);
  return text.trim() || null;
}

