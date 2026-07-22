import axios from "axios";
import { LRUCache } from "lru-cache";

const NVIDIA_API_URL = "/api/nvidia/chat/completions";

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

const CACHE_TTL = 5 * 60 * 1000;
const translationCache = new LRUCache<string, string>({ max: 1000, ttl: CACHE_TTL });

const MIN_REQUEST_INTERVAL = 600;
let lastRequestTime = 0;

const getCacheKey = (text: string, targetLang: string, sourceLang: string, modelId: string): string =>
  `${modelId}:${sourceLang}:${targetLang}:${text}`;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const LANGUAGE_NAMES: Record<string, string> = {
  ar: "Arabic",
  bn: "Bengali",
  de: "German",
  en: "English",
  es: "Spanish",
  fa: "Persian",
  fr: "French",
  hi: "Hindi",
  it: "Italian",
  id: "Indonesian",
  ja: "Japanese",
  ko: "Korean",
  la: "Latin",
  ms: "Malay",
  pt: "Portuguese",
  tr: "Turkish",
  ur: "Urdu",
  zh: "Chinese",
};

const getLanguageName = (code: string): string => {
  if (code === "auto" || code === "auto-detect") return "the source language";
  return LANGUAGE_NAMES[code] || code;
};

const buildSystemPrompt = (targetLang: string, sourceLang: string): string => {
  const targetName = getLanguageName(targetLang);

  let styleRules = "";
  if (sourceLang === "es" && targetLang === "en") {
    styleRules = `
STYLE RULES (es→en) - MANDATORY:
- Use professional American English (US dialect, not British).
- Maintain formal/professional tone appropriate for business contexts.
- Domain-specific terms MUST use natural American English equivalents:
  - "defensa" → "bumper" (NOT "defense")
  - "parrilla" → "grill" (NOT "grid" or "grille")
  - "caja" (auto) → "trunk" (NOT "box")
  - "capó" → "hood" (NOT "cap" or "cover")
  - "guardafangos" → "fender" (NOT "mudguard")
  - "llanta" → "tire" (NOT "wheel rim")
  - "troca/camión" → "truck" (NOT "camion" or literal)
- Analyze context to determine the domain, then choose the most natural American English equivalent.`;
  } else if (sourceLang === "en" && targetLang === "es") {
    styleRules = `
STYLE RULES (en→es) - MANDATORY:
- Use professional Spanish (neutral Latin American dialect).
- Maintain formal/professional tone appropriate for business contexts.`;
  } else {
    styleRules = `
STYLE RULES - MANDATORY:
- Use professional and natural language in the target language.`;
  }

  return `You are a professional interpreter. You MUST obey the following rules. They are STRICT and MANDATORY.

CRITICAL RULES - You MUST follow these WITHOUT EXCEPTION:
1. OUTPUT ONLY the translated text. NEVER add explanations, notes, metadata, or any text outside the translation.
2. Translate EVERYTHING. NEVER omit, summarize, or skip content.
3. NEVER add or remove words, punctuation, or content.
4. PRESERVE numbers exactly as they appear: "123", "45.6", "$50", "2024-03-15".
5. If the text is already in ${targetName}, return it AS-IS.
6. REPEATED PHRASES: if the same phrase appears consecutively (e.g., "el dia de ayer el dia de ayer"), translate it ONCE only.
7. Interpret in first person when source uses "I" or "we".
8. Preserve original formatting, line breaks, and structure.
${styleRules}

<output_validation>
BEFORE responding, verify:
(1) Is there any text outside the translation? If yes, REMOVE IT.
(2) Are all numbers preserved exactly?
(3) Is every source word accounted for?
(4) Did you avoid adding any new words?
If any check fails, fix your output. Respond with ONLY the translated text.
</output_validation>`;
};

const normalizeText = (text: string): string =>
  text.trim().replace(/\s+/g, " ");

export const translate = async (
  targetLang: string,
  sourceLang: string,
  text: string,
  modelId: string,
  options?: { signal?: AbortSignal }
): Promise<string> => {
  const cleanedText = normalizeText(text);
  if (!cleanedText) throw new Error("El texto a traducir no puede estar vacío.");

  const cacheKey = getCacheKey(cleanedText, targetLang, sourceLang, modelId);
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  const systemPrompt = buildSystemPrompt(targetLang, sourceLang);
  const userPrompt = `Translate the following text to ${getLanguageName(targetLang)}. Output ONLY the translation, nothing else:\n\n${cleanedText}`;

  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await wait(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (attempt > 0) {
      const delay = BASE_DELAY * Math.pow(2, attempt - 1) + Math.random() * 1000;
      await wait(delay);
      if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    }

    try {
      lastRequestTime = Date.now();
      const response = await axios.post(
        NVIDIA_API_URL,
        {
          model: modelId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 4096,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          signal: options?.signal,
        }
      );

      const translated = response.data?.choices?.[0]?.message?.content?.trim();
      if (!translated) throw new Error("No se recibió traducción del modelo");

      translationCache.set(cacheKey, translated);

      return translated;
    } catch (error) {
      if (axios.isCancel(error)) throw error;
      if (error instanceof DOMException) throw error;

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 429 || (status && status >= 500 && status < 600)) {
          lastError = error;
          continue;
        }
      }

      throw new Error(`Error en traducción AI: ${(error as Error).message}`);
    }
  }

  throw new Error(
    `Error en traducción AI (after ${MAX_RETRIES} retries): ${(lastError as Error).message}`
  );
};

export const translateMultiple = async (
  texts: string[],
  targetLang: string,
  sourceLang: string,
  modelId: string
): Promise<string[]> => {
  return Promise.all(texts.map((text) => translate(targetLang, sourceLang, text, modelId)));
};
