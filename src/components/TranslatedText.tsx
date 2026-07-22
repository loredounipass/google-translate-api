import React from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { translate } from "api/ai-translation";
import CopyIcon from "assets/CopyIcon";
import { DEFAULT_SOURCE_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from "utils/constants";
import { debounce } from "lodash";

const TranslatedText = () => {
  const [searchParams, setURLSearchParams] = useSearchParams();
  const text = searchParams.get("text") || "";
  const tl = searchParams.get("tl") || DEFAULT_TARGET_LANGUAGE;
  const sl = searchParams.get("sl") || DEFAULT_SOURCE_LANGUAGE;
  const isRTL = ["ar", "fa", "ur"].includes(tl);
  const [translatedText, setTranslatedText] = React.useState<string[]>([]);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const currentTextRef = React.useRef(text);
  const prevSlRef = React.useRef<string | null>(null);
  const prevTlRef = React.useRef<string | null>(null);
  const hasTranslatedRef = React.useRef(false);

  const translateHandler = React.useCallback(async (value: string, targetLang: string, sourceLang: string) => {
    if (!value || value !== currentTextRef.current) {
      setTranslatedText([]);
      return;
    }
    
    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
  
      const translated = await translate(targetLang, sourceLang, value, {
        signal: abortControllerRef.current.signal
      });
      
      if (translated) {
        hasTranslatedRef.current = true;
        const normalizedText = translated
          .split("\n")
          .map(line => line.trim())
          .filter(line => line.length > 0);
        setTranslatedText(normalizedText.length ? normalizedText : [translated.trim()]);
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
      debounce((text: string, targetLang: string, sourceLang: string) => {
        translateHandler(text, targetLang, sourceLang);
      }, 300),
    [translateHandler]
  );

  React.useEffect(() => {
    if (
      prevSlRef.current !== null &&
      prevTlRef.current !== null &&
      sl === prevTlRef.current &&
      tl === prevSlRef.current &&
      hasTranslatedRef.current
    ) {
      const newText = translatedTextRef.current.join("\n");
      if (text !== newText) {
        setURLSearchParams((params) => {
          params.set("text", newText);
          return params;
        });
        prevSlRef.current = sl;
        prevTlRef.current = tl;
        return;
      }
    }

    currentTextRef.current = text;

    if (!text) {
      debouncedTranslateHandler.cancel();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setTranslatedText([]);
      return;
    }

    debouncedTranslateHandler(text, tl, sl);

    return () => {
      debouncedTranslateHandler.cancel();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [text, tl, sl, debouncedTranslateHandler, setURLSearchParams]);

  React.useEffect(() => {
    prevSlRef.current = sl;
    prevTlRef.current = tl;
  }, [sl, tl]);

  const translatedTextRef = React.useRef(translatedText);
  translatedTextRef.current = translatedText;

  const [copied, setCopied] = React.useState(false);
  const copyTimeoutRef = React.useRef<number | null>(null);

  const messages = React.useMemo(() => [
    "Traduce cualquier texto al instante",
    "Interpreter AI agent siempre listo",
    "Escribe y te traduzco al momento",
    "Traducción rápida con IA",
    "Selecciona tu idioma y comienza",
  ], []);

  const [placeholderIndex, setPlaceholderIndex] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % messages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [messages.length]);

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={`relative bg-[#f3f4f6] text-[#0f1720] font-sans font-normal leading-normal ${isRTL ? 'text-right' : 'text-left'} text-lg break-words min-h-[100px] border border-[#e6e9ee] flex-1`}>
      {translatedText.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[100px] text-[#9ca3af] text-base font-normal p-4 px-6 text-center leading-relaxed">
          <div key={placeholderIndex}>
            {messages[placeholderIndex]}<span className="inline-block w-2 h-2 bg-[#9ca3af] rounded-full ml-1 align-baseline relative -top-0.5 animate-blink" />
          </div>
        </div>
      ) : (
        <div className="p-4 overflow-auto max-h-[68vh] blue-scrollbar">
          {translatedText.map((line, index) => (
            <React.Fragment key={index}>
              {line || <br />}
            </React.Fragment>
          ))}
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
