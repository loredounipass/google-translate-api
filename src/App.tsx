import { useState, useEffect } from "react";
import React from "react";
import LanguagesBar from "./components/LanguagesBar";
import TranslationTextField from "./components/TranslationTextField";
import { BrowserRouter as Router, Route, Routes, useSearchParams } from "react-router-dom";
import TranslatedText from "components/TranslatedText";
import HistoryPanel from "./components/HistoryPanel";
import { AI_MODELS, DEFAULT_MODEL } from "utils/constants";
import { Analytics } from "@vercel/analytics/react";

const modes = ["TEXT MODE", "VOICE MODE"];

const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"></circle>
    <line x1="12" y1="1" x2="12" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line>
    <line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
  </svg>
);

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
);

const HistoryIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

const ModeIndicator = () => {
  const [currentModeIdx, setCurrentModeIdx] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const typingSpeed = isDeleting ? 40 : 100;
    const currentMode = modes[currentModeIdx];

    const timer = setTimeout(() => {
      if (!isDeleting && displayedText === currentMode) {
        setTimeout(() => setIsDeleting(true), 2500);
      } else if (isDeleting && displayedText === "") {
        setIsDeleting(false);
        setCurrentModeIdx((prev) => (prev + 1) % modes.length);
      } else {
        setDisplayedText(currentMode.substring(0, displayedText.length + (isDeleting ? -1 : 1)));
      }
    }, typingSpeed);

    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, currentModeIdx]);

  return (
    <div className="flex items-center justify-center bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-sm px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 shadow-sm w-28 h-6">
      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 tracking-widest font-mono flex items-center">
        {displayedText}
        <span className="relative flex h-1.5 w-1.5 ml-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-600"></span>
        </span>
      </span>
    </div>
  );
};

const Header = ({ 
  isDark, 
  toggleDark, 
  openHistory 
}: { 
  isDark: boolean; 
  toggleDark: () => void; 
  openHistory: () => void; 
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentModel = searchParams.get("model") || DEFAULT_MODEL;

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("model", e.target.value);
    setSearchParams(newParams);
  };

  return (
    <>
      <div className="fixed top-0 left-0 w-full p-4 md:top-6 md:left-8 md:w-auto md:p-0 flex flex-col sm:flex-row items-center justify-between gap-3 z-50 select-none cursor-default bg-white/90 dark:bg-slate-900/90 md:bg-transparent md:dark:bg-transparent backdrop-blur-md md:backdrop-blur-none border-b border-slate-200 dark:border-slate-800 md:border-none md:dark:border-none shadow-sm md:shadow-none transition-all">
        <div className="flex items-center gap-3">
          <div className="font-semibold text-lg md:text-xl text-slate-800 dark:text-slate-100 tracking-tight">
            AI translator
          </div>
          <ModeIndicator />
        </div>
        
        <div className="flex items-center gap-2 md:fixed md:top-6 md:right-8">
          <div className="relative group">
            <button 
              onClick={openHistory}
              className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Ver historial"
            >
              <HistoryIcon />
            </button>
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-slate-800 dark:bg-slate-700 text-white text-[11px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-lg border border-slate-700 dark:border-slate-600">
              History
            </div>
          </div>
          
          <div className="relative group mr-2 md:mr-4">
            <button 
              onClick={toggleDark}
              className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-slate-800 dark:bg-slate-700 text-white text-[11px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-lg border border-slate-700 dark:border-slate-600">
              {isDark ? "Light mode" : "Dark mode"}
            </div>
          </div>
          
          <div className="relative flex items-center gap-1.5 group">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">AI model</span>
          <div className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-help transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          
          <div className="absolute right-0 top-full mt-2 w-72 p-3 bg-slate-800 text-slate-300 text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50">
            <div className="font-semibold mb-1 text-slate-50 flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              Attention
            </div>
            These open-source neural network models vary in inference speed and translation accuracy. <strong className="text-slate-100 font-medium">Mistral</strong> and <strong className="text-slate-100 font-medium">Llama</strong> offer the fastest response times, while Mistral typically delivers the highest quality results for this application.
            <div className="absolute top-0 right-[7.5rem] -mt-1.5 w-3 h-3 bg-slate-800 transform rotate-45"></div>
          </div>
        </div>
        <select 
          value={currentModel} 
          onChange={handleModelChange}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded px-2 py-1 outline-none focus:border-blue-400 shadow-sm font-sans max-w-[120px] sm:max-w-none truncate transition-colors"
        >
          {Object.entries(AI_MODELS).map(([key, model]) => (
            <option key={key} value={key}>
              {model.name}
            </option>
          ))}
        </select>
      </div>
      </div>
    </>
  );
};

function App() {
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem("theme") === "dark";
    } catch (e) {
      return false;
    }
  });

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  return (
    <Router>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200 overflow-x-hidden">
        <Header 
          isDark={isDark} 
          toggleDark={() => setIsDark(!isDark)} 
          openHistory={() => setIsHistoryOpen(true)}
        />
        <HistoryPanel isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
        <Routes>
          <Route
            path="/"
            Component={() => (
              <div className="text-center text-[#111111] dark:text-slate-100 h-[calc(100vh-8rem)] md:h-[80vh] w-[95%] md:w-[97%] bg-white dark:bg-slate-800 rounded-2xl mx-auto mt-28 md:mt-[10vh] overflow-hidden flex flex-col font-sans shadow-lg border border-slate-200/50 dark:border-slate-700/50 transition-colors duration-200">
                <LanguagesBar />
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                <TranslationTextField />
                <TranslatedText />
              </div>
            </div>
          )}
        />
      </Routes>
      <Analytics />
      </div>
    </Router>
  );
}

export default App;
