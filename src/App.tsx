import LanguagesBar from "./components/LanguagesBar";
import TranslationTextField from "./components/TranslationTextField";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import TranslatedText from "components/TranslatedText";

function App() {
  return (
    <Router>
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
