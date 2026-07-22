import { useState, useEffect } from "react";
import LanguagesBar from "./components/LanguagesBar";
import TranslationTextField from "./components/TranslationTextField";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import TranslatedText from "components/TranslatedText";

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
    <div className="flex items-center gap-2 bg-slate-50/80 backdrop-blur-sm px-2.5 py-1 rounded border border-slate-200 shadow-sm w-28 h-6">
      <div className="relative flex h-1.5 w-1.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-600"></span>
      </div>
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

function App() {
  return (
    <Router>
      <div className="absolute top-6 left-8 flex items-center gap-3 z-50 select-none cursor-default">
        <div className="font-semibold text-xl text-slate-800 tracking-tight">
          interpeter AI agent
        </div>
        <ModeIndicator />
      </div>
      <Routes>
        <Route
          path="/"
          Component={() => (
            <div className="text-center text-[#111111] h-[80vh] w-[97vw] bg-white rounded-2xl mx-auto mt-[10vh] overflow-hidden flex flex-col font-sans">
              <LanguagesBar />
              <div className="flex-1 flex">
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
