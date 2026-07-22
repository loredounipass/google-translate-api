import React from "react";
import { Select } from "antd";
import { useSearchParams } from "react-router-dom";
import { 
  AVAILABLE_LANGUAGES, 
  DEFAULT_SOURCE_LANGUAGE, 
  DEFAULT_TARGET_LANGUAGE 
} from "utils/constants";
import { SwitchIcon } from "../assets/SwitchIcon";

const LanguagesBar = () => {
  const [searchParams, setURLSearchParams] = useSearchParams();
  const [sourceLang, setSourceLang] = React.useState(
    validateLang(searchParams.get("sl"), DEFAULT_SOURCE_LANGUAGE)
  );
  const [targetLang, setTargetLang] = React.useState(
    validateLang(searchParams.get("tl"), DEFAULT_TARGET_LANGUAGE)
  );

  const languageOptions = React.useMemo(() => 
    AVAILABLE_LANGUAGES.map(lang => ({
      value: lang.code,
      label: lang.name,
      disabled: false
    })), []);

  const setLangParam = React.useCallback((key: string, value: string) => {
    setURLSearchParams(params => {
      params.set(key, value);
      return params;
    });
  }, [setURLSearchParams]);

  const switchLangsHandler = () => {
    const newSource = targetLang;
    const newTarget = sourceLang;
    
    setSourceLang(newSource);
    setTargetLang(newTarget);
    setLangParam("sl", newSource);
    setLangParam("tl", newTarget);
  };

  const handleChangeSourceLang = (value: string) => {
    if(value === targetLang) switchLangsHandler();
    else updateLang(value, setSourceLang, "sl");
  };

  const handleChangeTargetLang = (value: string) => {
    if(value === sourceLang) switchLangsHandler();
    else updateLang(value, setTargetLang, "tl");
  };

  const updateLang = React.useCallback(
    (
      value: string,
      setter: React.Dispatch<React.SetStateAction<string>>,
      paramKey: "sl" | "tl"
    ) => {
      if (AVAILABLE_LANGUAGES.some((lang) => lang.code === value)) {
        setter(value);
        setLangParam(paramKey, value);
      }
    },
    [setLangParam]
  );

  React.useEffect(() => {
    if (!searchParams.get("sl")) setLangParam("sl", DEFAULT_SOURCE_LANGUAGE);
    if (!searchParams.get("tl")) setLangParam("tl", DEFAULT_TARGET_LANGUAGE);
  }, [searchParams, setLangParam]);

  return (
    <div className="bg-primary-main flex items-center px-4 gap-3 border-b border-primary-700 max-sm:px-2 max-sm:gap-1.5">
      <Select<string>
        value={sourceLang}
        onChange={handleChangeSourceLang}
        options={languageOptions as unknown as { value: string; label: string }[]}
        aria-label="Seleccionar idioma origen"
        popupMatchSelectWidth={false}
        className="lang-select min-w-[140px] flex-1 max-sm:min-w-[120px]"
      />
      
      <button
        onClick={switchLangsHandler}
        aria-label="Intercambiar idiomas"
        className="bg-none border-none cursor-pointer p-2 rounded transition-all duration-200 hover:bg-primary-500 hover:rotate-180 hover:scale-110 active:rotate-180 active:scale-95 max-sm:p-1 [&_svg]:block [&_svg]:w-6 [&_svg]:h-6 [&_svg]:fill-primary-contrast max-sm:[&_svg]:w-5 max-sm:[&_svg]:h-5"
      >
        <SwitchIcon />
      </button>
      
      <Select<string>
        value={targetLang}
        onChange={handleChangeTargetLang}
        options={languageOptions as unknown as { value: string; label: string }[]}
        aria-label="Seleccionar idioma destino"
        popupMatchSelectWidth={false}
        className="lang-select min-w-[140px] flex-1 max-sm:min-w-[120px]"
      />
    </div>
  );
};

const validateLang = (lang: string | null, fallback: string): string => {
  return lang && AVAILABLE_LANGUAGES.some(l => l.code === lang) 
    ? lang 
    : fallback;
};

export default React.memo(LanguagesBar);
