import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

interface HistoryItem {
  original: string;
  translated: string;
  timestamp: number;
}

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ isOpen, onClose }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();

  const loadHistory = () => {
    try {
      const data = localStorage.getItem("translation_history");
      if (data) setHistory(JSON.parse(data));
    } catch (e) {}
  };

  useEffect(() => {
    loadHistory();
    window.addEventListener("historyUpdated", loadHistory);
    return () => window.removeEventListener("historyUpdated", loadHistory);
  }, []);

  const clearHistory = () => {
    localStorage.removeItem("translation_history");
    setHistory([]);
  };

  const deleteItem = (index: number) => {
    const newHistory = history.filter((_, i) => i !== index);
    localStorage.setItem("translation_history", JSON.stringify(newHistory));
    setHistory(newHistory);
  };

  const handleRestore = (originalText: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("text", originalText);
    setSearchParams(newParams);
    onClose();
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[55] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Panel */}
      <div 
        className={`fixed top-0 left-0 h-full w-80 md:w-96 bg-white dark:bg-slate-900 shadow-2xl z-[60] transform transition-transform duration-300 ease-in-out flex flex-col border-r border-slate-200 dark:border-slate-800 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            Historial
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Cerrar historial"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col bg-slate-50 dark:bg-slate-900/50">
          {history.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-500 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-medium">No hay traducciones recientes</p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Tu historial de traducción aparecerá aquí.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end mb-1">
                <button 
                  onClick={clearHistory} 
                  className="text-xs text-red-400 hover:text-red-500 dark:hover:text-red-400 font-medium transition-colors"
                >
                  Borrar historial
                </button>
              </div>
              {history.map((item, i) => (
                <div 
                  key={i} 
                  onClick={() => handleRestore(item.original)}
                  className="relative bg-white dark:bg-slate-800 p-3 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 text-left animate-fadeIn cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors group"
                >
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteItem(i); }}
                    className="absolute top-2 right-2 p-1 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded opacity-0 group-hover:opacity-100 transition-all"
                    aria-label="Eliminar traducción"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1 pr-6 line-clamp-1 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors">{item.original}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200 font-medium line-clamp-3">{item.translated}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default HistoryPanel;
