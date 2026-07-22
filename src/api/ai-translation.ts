import axios from "axios";
import { LRUCache } from "lru-cache";

const NVIDIA_API_URL = "/api/nvidia/chat/completions";

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

const CACHE_TTL = 5 * 60 * 1000;
const translationCache = new LRUCache<string, string>({ max: 1000, ttl: CACHE_TTL });

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

// 2. Glosario Modularizado
const GLOSSARY: Record<string, Record<string, Record<string, string>>> = {
  "es-en": {
    "automotive": {
      "defensa": "bumper",
      "parrilla": "grill",
      "caja": "trunk",
      "capó": "hood",
      "guardafangos": "fender",
      "llanta": "tire",
      "troca": "truck",
      "camión": "truck"
    }
  }
};

const buildSystemPrompt = (targetLang: string, sourceLang: string): string => {
  const targetName = getLanguageName(targetLang);

  let styleRules = "";
  if (sourceLang === "es" && targetLang === "en") {
    // Generar reglas desde el glosario automáticamente
    const terms = Object.entries(GLOSSARY["es-en"].automotive)
      .map(([es, en]) => `  - "${es}" → "${en}"`)
      .join("\n");
      
    styleRules = `
STYLE RULES (es→en) - MANDATORY:
- Use professional American English (US dialect, not British).
- Maintain formal/professional tone appropriate for business contexts.
- Domain-specific terms MUST use natural American English equivalents:
${terms}
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

  return `You are an elite, highly precise professional interpreter. You MUST obey the following rules WITHOUT EXCEPTION.

CRITICAL RULES:
1. Translate EVERYTHING. NEVER omit, summarize, or skip content.
2. NEVER add or remove words, punctuation, or content.
3. PRESERVE numbers exactly as they appear: "123", "45.6", "$50", "2024-03-15".
4. If the text is already in ${targetName}, return it AS-IS.
5. REPEATED PHRASES: if the same phrase appears consecutively (e.g., "el dia de ayer el dia de ayer"), translate it ONCE only.
6. Interpret in first person when source uses "I" or "we".
7. Preserve original formatting, line breaks, and structure.
${styleRules}

<execution_instructions>
1. First, analyze the source text, context, and apply rules in a <thinking> block.
2. Then, provide the final translated text inside <translation> tags.
3. Your final response MUST be formatted exactly as:
<thinking>
...your analysis here...
</thinking>
<translation>
...your final translation here...
</translation>
</execution_instructions>`;
};

const normalizeText = (text: string): string => text.trim().replace(/\s+/g, " ");

// 1. Cortocircuito Inteligente
const isTrivialText = (text: string): boolean => {
  // Solo números, puntuación básica o espacios
  const trivialRegex = /^[\d\s.,!?;:'"()[\]{}<>\-_=+*/\\|@#%^&`~]+$/;
  // Emails o URLs puras
  const urlEmailRegex = /^(https?:\/\/[^\s]+|[^\s@]+@[^\s@]+\.[^\s@]+)$/i;
  
  return trivialRegex.test(text) || urlEmailRegex.test(text);
};

export const translate = async (
  targetLang: string,
  sourceLang: string,
  text: string,
  modelId: string,
  options?: { signal?: AbortSignal }
): Promise<string> => {
  const cleanedText = normalizeText(text);
  if (!cleanedText) throw new Error("El texto a traducir no puede estar vacío.");

  // Cortocircuito Inteligente: No llamar a la IA para texto que no necesita traducción
  if (isTrivialText(cleanedText)) {
    return text.trim(); // Devolvemos el texto original
  }

  const cacheKey = getCacheKey(cleanedText, targetLang, sourceLang, modelId);
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  const systemPrompt = buildSystemPrompt(targetLang, sourceLang);
  const userPrompt = `Translate the following text to ${getLanguageName(targetLang)}.\n\n${cleanedText}`;

  // 3. Few-Shot Prompting (Ejemplos dinámicos en contexto)
  const messages = [
    { role: "system", content: systemPrompt },
    // Few-Shot Example
    { role: "user", content: `Translate the following text to ${getLanguageName(targetLang)}.\n\nHola, 123!` },
    { role: "assistant", content: `<thinking>\n- Source text contains a greeting and a number.\n- Number "123" must be preserved exactly.\n- Translation required.\n</thinking>\n<translation>\nHello, 123!\n</translation>` },
    // Actual Request
    { role: "user", content: userPrompt },
  ];

  // Ajuste Dinámico de Temperatura
  const dynamicTemperature = cleanedText.length < 15 ? 0.0 : 0.1;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (attempt > 0) {
      const delay = BASE_DELAY * Math.pow(2, attempt - 1) + Math.random() * 1000;
      await wait(delay);
      if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    }

    try {
      const response = await axios.post(
        NVIDIA_API_URL,
        {
          model: modelId,
          messages: messages,
          temperature: dynamicTemperature,
          max_tokens: 4096,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          signal: options?.signal,
        }
      );

      const rawContent = response.data?.choices?.[0]?.message?.content?.trim();
      if (!rawContent) throw new Error("No se recibió traducción del modelo");

      // 4. Extracción de <translation> XML
      let translated = rawContent;
      const translationMatch = rawContent.match(/<translation>([\s\S]*?)<\/translation>/);
      
      if (translationMatch && translationMatch[1]) {
        translated = translationMatch[1].trim();
      } else {
        // Fallback robusto en caso de que el modelo ignore las etiquetas XML (poco probable con Few-Shot)
        const thinkingMatch = rawContent.match(/<\/thinking>([\s\S]*)/);
        if (thinkingMatch && thinkingMatch[1]) {
          translated = thinkingMatch[1].trim();
        }
      }

      if (!translated) throw new Error("Fallo al extraer la traducción de las etiquetas XML");

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
