import React from "react";
import { useSearchParams } from "react-router-dom";
import styled, { createGlobalStyle } from "styled-components";
import axios from "axios";
import { translate } from "api/ai-translation";
import CopyIcon from "assets/CopyIcon";
import { DEFAULT_SOURCE_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from "utils/constants";
import { debounce } from "lodash";

const GlobalStyle = createGlobalStyle`
  @keyframes blink {
    50% { opacity: 0; }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateX(-50%) translateY(4px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
`;

const Cursor = styled.span`
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #9ca3af;
  border-radius: 50%;
  margin-left: 4px;
  vertical-align: baseline;
  position: relative;
  top: -2px;
  animation: blink 0.8s step-end infinite;
`;

const TranslatedText = () => {
  const [searchParams, setURLSearchParams] = useSearchParams();
  const text = searchParams.get("text") || "";
  const tl = searchParams.get("tl") || DEFAULT_TARGET_LANGUAGE;
  const sl = searchParams.get("sl") || DEFAULT_SOURCE_LANGUAGE;
  const isRTL = ["ar", "fa", "ur"].includes(tl);
  const [translatedText, setTranslatedText] = React.useState<string[]>([]);
  const abortControllerRef = React.useRef<AbortController>();
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
  
      // Modificar la llamada a translate para incluir el signal
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

  // Se crea la función debounced solo una vez
  const debouncedTranslateHandler = React.useMemo(
    () =>
      debounce((text: string, targetLang: string, sourceLang: string) => {
        translateHandler(text, targetLang, sourceLang);
      }, 300),
    [translateHandler]
  );

  // Actualizar la traducción cuando cambie el texto o los idiomas.
  // Usamos un único useEffect para evitar llamadas duplicadas y
  // asegurarnos de cancelar traducciones pendientes al borrar el texto.
  React.useEffect(() => {
    // Detect language swap (sl/tl swapped) and, if we have a translated
    // value, replace the `text` param with the translated content so
    // the UI effectively reverses the translation.
    if (
      prevSlRef.current !== null &&
      prevTlRef.current !== null &&
      sl === prevTlRef.current &&
      tl === prevSlRef.current &&
      hasTranslatedRef.current
    ) {
      const newText = translatedText.join("\n");
      if (text !== newText) {
        setURLSearchParams((params) => {
          params.set("text", newText);
          return params;
        });
        // Do not continue with current effect — the URL change will
        // trigger this effect again with the updated `text`.
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
  }, [text, tl, sl, translatedText, debouncedTranslateHandler, setURLSearchParams]);

  // Keep previous language refs in sync for swap detection
  React.useEffect(() => {
    prevSlRef.current = sl;
    prevTlRef.current = tl;
  }, [sl, tl]);

  // Toast state and timeout ref for copy feedback
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
    <Container $rtl={isRTL}>
      <GlobalStyle />
      {translatedText.length === 0 ? (
        <Placeholder>
          <div key={placeholderIndex}>
            {messages[placeholderIndex]}<Cursor />
          </div>
        </Placeholder>
      ) : (
        <div>
          {translatedText.map((line, index) => (
            <React.Fragment key={index}>
              {line || <br />}
            </React.Fragment>
          ))}
        </div>
      )}
      {translatedText.length !== 0 && (
        <Actions>
          <button onClick={copyHandler} aria-label="Copiar texto">
            <div style={{ color: "#2196F3" }}>
              <CopyIcon />
            </div>
          </button>
        </Actions>
      )}
      {copied && <Toast>Text copied</Toast>}
    </Container>
  );
};

const Placeholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 100px;
  color: #9ca3af;
  font-size: 16px;
  font-weight: 400;
  padding: 16px 24px;
  text-align: center;
  line-height: 1.6;
`;

const Container = styled.div<{ $rtl: boolean }>`
  position: relative;
  background-color: #f3f4f6;
  color: #0f1720;
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 400;
  line-height: 1.4;
  text-align: ${(props) => (props.$rtl ? "right" : "left")};
  font-size: 18px;
  word-break: break-word;
  min-height: 100px;

  div {
    padding: 16px;
    overflow: auto;
    max-height: 68vh;

    &::-webkit-scrollbar {
      width: 8px;
    }

    &::-webkit-scrollbar-thumb {
      background: #bdbdbd;
      border-radius: 4px;
    }
  }
  border: 1px solid #e6e9ee;
`;

const Actions = styled.div`
  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 5px;
    transition: all 0.2s ease;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    &:hover:not(:disabled) {
      transform: scale(1.1);
    }
  }

  button {
    position: absolute;
    bottom: 10px;
    right: 10px;
  }
`;

const Toast = styled.div`
  position: absolute;
  bottom: 50px;
  left: 50%;
  transform: translateX(-50%);
  background: #333;
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 20;
  animation: fadeIn 0.2s ease;
  white-space: nowrap;
`;

export default TranslatedText;