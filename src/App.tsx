import { useState, useEffect } from "react";
import LanguagesBar from "./components/LanguagesBar";
import TranslationTextField from "./components/TranslationTextField";
import { BrowserRouter as Router, Route, Routes, useSearchParams } from "react-router-dom";
import TranslatedText from "components/TranslatedText";
import { AI_MODELS, DEFAULT_MODEL } from "utils/constants";

const modes = ["TEXT MODE", "VOICE MODE"];

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
    <div className="flex items-center justify-center bg-slate-50/80 backdrop-blur-sm px-2.5 py-1 rounded border border-slate-200 shadow-sm w-28 h-6">
      <span className="text-[10px] font-semibold text-slate-500 tracking-widest font-mono flex items-center">
        {displayedText}
        <span className="relative flex h-1.5 w-1.5 ml-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-600"></span>
        </span>
      </span>
    </div>
  );
};

const Header = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentModel = searchParams.get("model") || DEFAULT_MODEL;

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("model", e.target.value);
    setSearchParams(newParams);
  };

  return (
    <>
      <div className="fixed top-0 left-0 w-full p-4 md:top-6 md:left-8 md:w-auto md:p-0 flex flex-col sm:flex-row items-center justify-between gap-3 z-50 select-none cursor-default bg-white/90 md:bg-transparent backdrop-blur-md md:backdrop-blur-none border-b border-slate-200 md:border-none shadow-sm md:shadow-none transition-all">
        <div className="flex items-center gap-3">
          <div className="font-semibold text-lg md:text-xl text-slate-800 tracking-tight">
            interpeter-0 AI agent
          </div>
          <ModeIndicator />
        </div>
        
        <div className="flex items-center gap-2 md:fixed md:top-6 md:right-8">
          <div className="relative flex items-center gap-1.5 group">
          <span className="text-xs text-slate-500 font-medium tracking-wide">Neural Network Model</span>
          <div className="text-slate-400 hover:text-slate-600 cursor-help transition-colors">
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
          className="bg-white border border-slate-200 text-slate-700 text-xs rounded px-2 py-1 outline-none focus:border-blue-400 shadow-sm font-sans max-w-[120px] sm:max-w-none truncate"
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
  return (
    <Router>
      <Header />
      <Routes>
        <Route
          path="/"
          Component={() => (
            <div className="text-center text-[#111111] h-[calc(100vh-7rem)] md:h-[80vh] w-[95vw] md:w-[97vw] bg-white rounded-2xl mx-auto mt-24 md:mt-[10vh] overflow-hidden flex flex-col font-sans shadow-lg">
              <LanguagesBar />
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                <TranslationTextField />
                <TranslatedText />
              </div>
            </div>
          )}
        />
      </Routes>
    </Router>
  );
}

export default App;
