import React from "react";
import { useSearchParams } from "react-router-dom";
import { useSpeechSynthesis } from "react-speech-kit";
import styled from "styled-components";
import { translate } from "api/freetranslation";
import CopyIcon from "assets/CopyIcon";
import { DEFAULT_SOURCE_LANGUAGE, DEFAULT_TARGET_LANGUAGE } from "utils/constants";
import { debounce } from "lodash";

const TranslatedText = () => {
  const [searchParams, setURLSearchParams] = useSearchParams();
  // Se elimina la desestructuración de cancel, speaking y supported, ya que no se usan.
  useSpeechSynthesis();
  const text = searchParams.get("text") || "";
  const tl = searchParams.get("tl") || DEFAULT_TARGET_LANGUAGE;
  const sl = searchParams.get("sl") || DEFAULT_SOURCE_LANGUAGE;
  const isRTL = ["ar", "fa", "ur"].includes(tl);
  const [translatedText, setTranslatedText] = React.useState<string[]>([]);
  const abortControllerRef = React.useRef<AbortController>();
  const currentTextRef = React.useRef(text);
  const prevSlRef = React.useRef<string | null>(null);
  const prevTlRef = React.useRef<string | null>(null);

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
        // Preservar mayúsculas y formato de la API, sólo recortar líneas vacías
        const normalizedText = translated
          .split("\n")
          .map(line => line.trim())
          .filter(line => line.length > 0);
        setTranslatedText(normalizedText.length ? normalizedText : [translated.trim()]);
      }
    } catch (error) {
      if (!(error instanceof DOMException)) { // Ignore abort errors
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
      translatedText.length > 0
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
  }, [text, tl, sl, debouncedTranslateHandler, setURLSearchParams, translatedText]);

  // Keep previous language refs in sync for swap detection
  React.useEffect(() => {
    prevSlRef.current = sl;
    prevTlRef.current = tl;
  }, [sl, tl]);

  // Toast state and timeout ref for copy feedback
  const [copied, setCopied] = React.useState(false);
  const copyTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Container $rtl={isRTL}>
      <div>
        {translatedText.map((line, index) => (
          <React.Fragment key={index}>
            {line || <br />}
          </React.Fragment>
        ))}
      </div>
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
    max-height: 52vh;

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
  right: 10px;
  background: rgba(0,0,0,0.8);
  color: #fff;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  z-index: 20;
`;

export default TranslatedText;