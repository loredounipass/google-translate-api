import axios from "axios";
import LRUCache from "lru-cache";

const NVIDIA_API_URL = "/api/nvidia/chat/completions";
const MODEL = "mistralai/mistral-medium-3.5-128b";

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

const CACHE_TTL = 5 * 60 * 1000;
const translationCache = new LRUCache<string, string>({ max: 1000, ttl: CACHE_TTL });

const MIN_REQUEST_INTERVAL = 600;
let lastRequestTime = 0;

const getCacheKey = (text: string, targetLang: string, sourceLang: string): string =>
  `${sourceLang}:${targetLang}:${text}`;

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
  const sourceName = getLanguageName(sourceLang);
  const targetName = getLanguageName(targetLang);

  let styleRules = "";
  if (sourceLang === "es" && targetLang === "en") {
    styleRules = `- Use professional American English (US dialect, not British).
- Maintain formal/professional tone appropriate for business contexts.
- When you encounter Spanish words for car parts, house parts, body parts, or injuries, do NOT use literal/generic translations. Use the natural American English word that a native speaker would actually use. For example:
  - "defensa" → "bumper" (not "defense")
  - "parrilla" → "grill" (not "grid" or "grille" as a generic rack)
  - "caja" (trunk of a car) → "trunk" (not "box")
  - "capó" → "hood" (not "cap" or "cover")
  - "guardafangos" → "fender" (not "mudguard")
  - "llanta" → "tire" (not "wheel rim")
  - "troca/camión" → "truck" (not "camion" or literal)
  Analyze the context first to determine if the term refers to an automotive, home, medical, or other domain, then choose the most natural American English equivalent.`;
  } else if (sourceLang === "en" && targetLang === "es") {
    styleRules = `- Use professional Spanish (neutral Latin American dialect).
- Maintain formal/professional tone appropriate for business contexts.`;
  } else {
    styleRules = `- Use professional and natural language in the target language.`;
  }

  return `You are a professional interpreter following Lionbridge quality standards. Translate the following text from ${sourceName} to ${targetName}.

INTERPRETER STANDARDS (Lionbridge):
- Translate EVERYTHING. Do NOT omit, summarize, or add any content.
- Do NOT add any words, punctuation, or explanations that were not in the original text.
- Preserve original meaning, tone, register, and intent of the speaker.
- Maintain cultural neutrality — convey idioms and cultural references accurately without bias.
- Keep original formatting, line breaks, punctuation, and structure.
- Interpret in first person when the source uses first person ("I", "we").
- Maintain consistent terminology throughout the translation.
- Output ONLY the translated text. No explanations, notes, or metadata.
- If the text is already in ${targetName}, return it as-is.
- For ambiguous terms, use context to determine the most accurate interpretation.
- NUMBERS: Preserve all numbers exactly as they appear. Do not modify, spell out, or reformat numeric digits (e.g., "123", "45.6", "2024-03-15", "$50").
- REPEATED PHRASES: If the same phrase is repeated consecutively or near-consecutively in the source (e.g., "el dia de ayer el dia de ayer" or "el el"), translate it as a single occurrence. Do not repeat the same translation unless the repetition is clearly intentional for emphasis.
- CLEAN TRANSLATION: Do not add or omit any content. The output must be a clean, faithful rendering with no extra words, no missing words, and no invented content.
${styleRules}`;
};

const normalizeText = (text: string): string =>
  text.trim().replace(/\s+/g, " ");

export const translate = async (
  targetLang: string,
  sourceLang: string,
  text: string,
  options?: { signal?: AbortSignal }
): Promise<string> => {
  const cleanedText = normalizeText(text);
  if (!cleanedText) throw new Error("El texto a traducir no puede estar vacío.");

  const cacheKey = getCacheKey(cleanedText, targetLang, sourceLang);
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  const systemPrompt = buildSystemPrompt(targetLang, sourceLang);
  const userPrompt = `Interpret and translate the following text:\n\n${cleanedText}`;

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
          model: MODEL,
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
  sourceLang: string
): Promise<string[]> => {
  return Promise.all(texts.map((text) => translate(targetLang, sourceLang, text)));
};
