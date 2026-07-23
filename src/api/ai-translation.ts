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
    },
    "medical_vns": {
      "chequeo general": "general checkup",
      "medicina para el dolor": "pain medication",
      "mamografía": "mammogram",
      "rayos x": "X-ray",
      "cáncer": "cancer",
      "receta médica": "prescription",
      "autorización previa": "prior authorization",
      "copago": "copay",
      "proveedor de atención médica": "healthcare provider",
      "seguro médico": "health insurance",
      "cobertura": "coverage",
      "VNS Health": "VNS Health",
      "Medicaid": "Medicaid",
      "Medicare": "Medicare",
      "sala de emergencias": "emergency room (ER)",
      "cuidados paliativos": "hospice care"
    },
    "legal_us": {
      "juez": "judge",
      "abogado": "attorney",
      "fiscal": "prosecutor",
      "testigo": "witness",
      "jurado": "jury",
      "veredicto": "verdict",
      "demanda": "lawsuit",
      "demandante": "plaintiff",
      "demandado": "defendant",
      "acusado": "defendant",
      "audiencia": "hearing",
      "fianza": "bail",
      "libertad condicional": "probation",
      "orden de cateo": "search warrant",
      "orden de arresto": "arrest warrant",
      "declaración de culpabilidad": "guilty plea",
      "apelar": "to appeal"
    }
  }
};

const buildSystemPrompt = (targetLang: string, sourceLang: string): string => {
  const targetName = getLanguageName(targetLang);

  // Generar reglas desde el glosario automáticamente para todos los dominios
  const automotiveTerms = Object.entries(GLOSSARY["es-en"].automotive)
    .map(([es, en]) => `    - "${es}" → "${en}"`)
    .join("\n");
    
  const medicalTerms = Object.entries(GLOSSARY["es-en"].medical_vns)
    .map(([es, en]) => `    - "${es}" → "${en}"`)
    .join("\n");
    
  const legalTerms = Object.entries(GLOSSARY["es-en"].legal_us)
    .map(([es, en]) => `    - "${es}" → "${en}"`)
    .join("\n");

  let dialectRule = "";
  if (targetLang === "en") dialectRule = "\n- Use professional American English (US dialect, not British).";
  else if (targetLang === "es") dialectRule = "\n- Use professional Spanish (neutral Latin American dialect).";

  const styleRules = `
STYLE RULES & DOMAIN TERMINOLOGY - MANDATORY:
- Maintain formal/professional tone appropriate for business, medical, and legal contexts.${dialectRule}
- When translating concepts related to the following domains, you MUST use the exact domain-specific terminology equivalent to these standard references (shown as Spanish->English reference, but apply the exact professional equivalent in ${targetName}):
  [AUTOMOTIVE]:
${automotiveTerms}
  [MEDICAL / VNS HEALTH / MEDICARE]:
${medicalTerms}
  [US LEGAL / COURT]:
${legalTerms}
- Analyze context to determine the domain, then choose the most natural and accurate professional terminology.`;

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
  options?: { signal?: AbortSignal; onData?: (text: string) => void }
): Promise<string> => {
  const cleanedText = text.trim();
  if (!cleanedText) throw new Error("El texto a traducir no puede estar vacío.");

  // Cortocircuito Inteligente: No llamar a la IA para texto que no necesita traducción
  if (isTrivialText(cleanedText)) {
    return text.trim(); // Devolvemos el texto original
  }

  const cacheKey = getCacheKey(cleanedText, targetLang, sourceLang, modelId);
  const cached = translationCache.get(cacheKey);
  if (cached) {
    if (options?.onData) {
      options.onData(cached);
    }
    return cached;
  }

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
      if (options?.onData) {
        const fetchResponse = await fetch(NVIDIA_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelId,
            messages: messages,
            temperature: dynamicTemperature,
            max_tokens: 4096,
            stream: true,
          }),
          signal: options?.signal,
        });

        if (!fetchResponse.ok) {
          throw new Error(`HTTP Error: ${fetchResponse.status}`);
        }

        const reader = fetchResponse.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        let accumulatedRawText = "";
        let buffer = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine === "data: [DONE]") continue;
              if (trimmedLine.startsWith("data: ")) {
                try {
                  const data = JSON.parse(trimmedLine.substring(6));
                  const content = data.choices?.[0]?.delta?.content || "";
                  if (content) {
                    accumulatedRawText += content;
                    options.onData(accumulatedRawText);
                  }
                } catch (e) {
                  // Ignore incomplete JSON chunks
                }
              }
            }
          }
        }
        
        let translated = accumulatedRawText;
        const translationMatch = accumulatedRawText.match(/<translation>([\s\S]*?)<\/translation>/);
        if (translationMatch && translationMatch[1]) {
          translated = translationMatch[1].trim();
        } else {
          const thinkingMatch = accumulatedRawText.match(/<\/thinking>([\s\S]*)/);
          if (thinkingMatch && thinkingMatch[1]) {
            translated = thinkingMatch[1].trim();
          }
        }
        
        translationCache.set(cacheKey, translated);
        return accumulatedRawText; // Return the full raw text including thinking tags so UI is consistent with the stream
      } else {
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
      }
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
      if (error instanceof Error && error.message.startsWith("HTTP Error: ")) {
         lastError = error;
         continue;
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
