import axios from "axios";

const NVIDIA_API_URL = "/api/nvidia/chat/completions";
const MODEL = "meta/llama-3.1-8b-instruct";

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

const CACHE_TTL = 5 * 60 * 1000;
const translationCache = new Map<string, { result: string; timestamp: number }>();

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
- Maintain formal/professional tone appropriate for business contexts.`;
  } else if (sourceLang === "en" && targetLang === "es") {
    styleRules = `- Use professional Spanish (neutral Latin American dialect).
- Maintain formal/professional tone appropriate for business contexts.`;
  } else {
    styleRules = `- Use professional and natural language in the target language.`;
  }

  return `You are an interpreter. Translate the following text from ${sourceName} to ${targetName}.

INTERPRETER RULES:
- Translate EVERYTHING. Do NOT omit any word, phrase, or sentence.
- Do NOT add, summarize, or aggregate. Translate exactly what is written.
- Preserve the original formatting, line breaks, and punctuation.
- Interpret all content correctly including idioms, technical terms, and cultural references.
- Output ONLY the translated text. No explanations, notes, or original text.
- If the text is already in ${targetName}, return it as-is.
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
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

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

      translationCache.set(cacheKey, { result: translated, timestamp: Date.now() });

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
