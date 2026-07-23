import React from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { translate } from "api/ai-translation";
import CopyIcon from "assets/CopyIcon";
import { DEFAULT_SOURCE_LANGUAGE, DEFAULT_TARGET_LANGUAGE, DEFAULT_MODEL, AI_MODELS } from "utils/constants";
import { debounce } from "lodash";

const cleanText = (rawText: string) => {
  // 1. Fully formed <translation> block
  const translationMatch = rawText.match(/<translation\s*>([\s\S]*?)(?:<\/translation\s*>|$)/i);
  if (translationMatch) {
    let result = translationMatch[1].trimStart();
    // Hide any incomplete tag being typed at the very end of the stream (e.g. "</", "</trans")
    return result.replace(/<\/?[a-z]*\s*$/i, "");
  }

  // 2. Past </thinking>, waiting for or in the middle of <translation>
  const thinkingMatch = rawText.match(/<\/thinking\s*>([\s\S]*)/i);
  if (thinkingMatch) {
    let afterThinking = thinkingMatch[1].trimStart();
    if ("<translation>".startsWith(afterThinking.toLowerCase())) {
       return "";
    }
    afterThinking = afterThinking.replace(/<translation\s*>/ig, "").trimStart();
    return afterThinking.replace(/<\/?[a-z]*\s*$/i, "");
  }

  // 3. Inside <thinking> block
  if (rawText.toLowerCase().includes("<thinking")) {
    return "";
  }

  // 4. At the very beginning, typing out tags
  const trimmedLower = rawText.trimStart().toLowerCase();
  if ("<thinking>".startsWith(trimmedLower) || "<translation>".startsWith(trimmedLower)) {
    return "";
  }

  // 5. Fallback for cached clean text or model forgetting tags
  return rawText.replace(/<\/?[a-z]*\s*$/i, "").trimStart();
};

const TranslatedText = () => {
  const [searchParams] = useSearchParams();
  const text = searchParams.get("text") || "";
  const tl = searchParams.get("tl") || DEFAULT_TARGET_LANGUAGE;
  const sl = searchParams.get("sl") || DEFAULT_SOURCE_LANGUAGE;
  const modelKey = searchParams.get("model") || DEFAULT_MODEL;
  const modelId = AI_MODELS[modelKey as keyof typeof AI_MODELS]?.id || AI_MODELS[DEFAULT_MODEL as keyof typeof AI_MODELS].id;
  const isRTL = ["ar", "fa", "ur"].includes(tl);
  const [translatedText, setTranslatedText] = React.useState<string[]>([]);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const currentTextRef = React.useRef(text);

  const translateHandler = React.useCallback(async (value: string, targetLang: string, sourceLang: string, mId: string) => {
    if (!value || value !== currentTextRef.current) {
      setTranslatedText([]);
      return;
    }
    
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
  
      const translated = await translate(targetLang, sourceLang, value, mId, {
        signal: abortControllerRef.current.signal,
        onData: (text) => {
          const cleaned = cleanText(text);
          if (cleaned) {
            setTranslatedText([cleaned]);
          }
        },
      });
      
      if (translated) {
        const cleaned = cleanText(translated);
        setTranslatedText(cleaned ? [cleaned] : []);
      }
    } catch (error) {
      if (axios.isCancel(error)) return;
      if (!(error instanceof DOMException)) {
        console.error("Error de traducción:", error);
        setTranslatedText(["<< Error en la traducción >>"]);
      }
    }
  }, [setTranslatedText]);

  const copyHandler = () => {
    try {
      const txt = translatedText.join("\n");
      navigator.clipboard.writeText(txt);
      setCopied(true);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Error al copiar:", error);
      alert("No se pudo copiar el texto");
    }
  };

  const debouncedTranslateHandler = React.useMemo(
    () =>
      debounce((text: string, targetLang: string, sourceLang: string, mId: string) => {
        translateHandler(text, targetLang, sourceLang, mId);
      }, 300),
    [translateHandler]
  );

  React.useEffect(() => {
    currentTextRef.current = text;

    if (!text) {
      debouncedTranslateHandler.cancel();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setTranslatedText([]);
      return;
    }

    // Always re-translate when text, target lang, source lang, or model change
    debouncedTranslateHandler(text, tl, sl, modelId);

    return () => {
      debouncedTranslateHandler.cancel();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [text, tl, sl, modelId, debouncedTranslateHandler]);

  React.useEffect(() => {
    const event = new CustomEvent("translatedTextChanged", {
      detail: translatedText.join("\n"),
    });
    window.dispatchEvent(event);
  }, [translatedText]);




  const [copied, setCopied] = React.useState(false);
  const copyTimeoutRef = React.useRef<number | null>(null);

  const messages = React.useMemo(() => [
    "Translate any text instantly",
    "Interpreter AI agent always ready",
    "Type and I'll translate instantly",
    "Fast AI translation",
    "Select your language and start",
  ], []);

  const [placeholderIndex, setPlaceholderIndex] = React.useState(0);
  const [displayedText, setDisplayedText] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);

  React.useEffect(() => {
    const typingSpeed = isDeleting ? 30 : 60;
    const currentMessage = messages[placeholderIndex];

    const timer = setTimeout(() => {
      if (!isDeleting && displayedText === currentMessage) {
        setTimeout(() => setIsDeleting(true), 2500);
      } else if (isDeleting && displayedText === "") {
        setIsDeleting(false);
        setPlaceholderIndex((prev) => (prev + 1) % messages.length);
      } else {
        setDisplayedText(currentMessage.substring(0, displayedText.length + (isDeleting ? -1 : 1)));
      }
    }, typingSpeed);

    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, placeholderIndex, messages]);

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={`relative bg-[#f3f4f6] text-[#0f1720] font-sans font-normal leading-normal ${isRTL ? 'text-right' : 'text-left'} text-lg break-words min-h-[100px] border-t md:border-t-0 md:border-l border-[#e6e9ee] flex-1 flex flex-col`}>
      {translatedText.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[100px] text-[#9ca3af] text-base font-normal p-4 px-6 text-center leading-relaxed">
          <div className="flex items-center justify-center">
            {displayedText}
            <span className="relative flex h-2 w-2 ml-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9ca3af] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#9ca3af]"></span>
            </span>
          </div>
        </div>
      ) : (
        <div className="p-4 overflow-auto max-h-[68vh] blue-scrollbar h-full whitespace-pre-wrap">
          {translatedText.join("\n")}
        </div>
      )}
      {translatedText.length !== 0 && (
        <div className="absolute bottom-2.5 right-2.5">
          <button onClick={copyHandler} aria-label="Copiar texto" className="bg-none border-none cursor-pointer p-1 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:scale-110">
            <div className="text-[#2196F3]">
              <CopyIcon />
            </div>
          </button>
        </div>
      )}
      {copied && <div className="absolute bottom-[50px] left-1/2 -translate-x-1/2 bg-[#333] text-white px-4 py-2 rounded-lg text-[13px] font-sans shadow-[0_4px_12px_rgba(0,0,0,0.15)] z-20 animate-fadeIn whitespace-nowrap">Text copied</div>}
    </div>
  );
};

export default TranslatedText;
