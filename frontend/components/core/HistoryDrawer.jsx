import React, { useEffect, useState } from 'react';
import { getMainThread } from '../../api/db';
import { FaTimes, FaCommentAlt } from 'react-icons/fa';
import ResponseArea from './ResponseArea';

const formatHistoryContent = (content) => {
  if (typeof content === 'string') return content;
  if (content == null) return '';

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        if (part?.type === 'image_url') return '[Gambar]';
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return JSON.stringify(content);
};

const HistoryDrawer = ({ isOpen, onClose }) => {
  const [historyTurns, setHistoryTurns] = useState([]);
  const [selectedTurnId, setSelectedTurnId] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    } else {
      setPreviewData(null);
      setSelectedTurnId(null);
    }
  }, [isOpen]);

  const loadHistory = async () => {
    const data = await getMainThread();
    if (!data || data.length === 0) {
      setHistoryTurns([]);
      return;
    }
    
    // Parse linear chatData into turns (user msg + subsequent ai msg, or standalone ai)
    const turns = [];
    let currentTurn = null;
    
    for (let i = 0; i < data.length; i++) {
      const msg = data[i];
      if (msg.role === 'user') {
        if (currentTurn) turns.push(currentTurn);
        currentTurn = { id: i, user: formatHistoryContent(msg.content), ai: null };
      } else if (msg.role === 'ai') {
        if (currentTurn && !currentTurn.ai) {
          currentTurn.ai = msg;
          turns.push(currentTurn);
          currentTurn = null;
        } else {
          turns.push({ id: i, user: '🤖 [Inisiatif Mark]', ai: msg });
        }
      }
    }
    if (currentTurn) turns.push(currentTurn);
    // Reverse to show newest on top
    setHistoryTurns(turns.reverse());
  };

  const loadPreview = (turn) => {
    setSelectedTurnId(turn.id);
    if (turn.ai) {
      const aiText = formatHistoryContent(turn.ai.content);
      setPreviewData({
        text: aiText,
        type: aiText.length > 500 ? 'long' : 'short',
        sources: turn.ai.sources || [],
        reasoning: turn.ai.reasoning,
        pluginResult: turn.ai.pluginExecution,
        mood: turn.ai.mood
      });
    } else {
      setPreviewData({ text: 'Tidak ada respons AI.', type: 'short' });
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] animate-[response-fade-in_0.2s_ease-out_forwards]"
          onClick={onClose}
        />
      )}

      {/* Drawer Panel */}
      <div 
        className={`fixed top-0 right-0 h-screen w-full max-w-md bg-base-300 border-l border-[var(--glass-border)] shadow-2xl z-[70] transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}
      >
        <div className="flex items-center justify-between p-6 border-b border-[var(--glass-border)]">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FaCommentAlt className="text-success" />
            Riwayat Obrolan
          </h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-base-200 hover:bg-error hover:text-white transition-colors"
          >
            <FaTimes />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-2">
          {historyTurns.map((turn, idx) => (
            <button
              key={turn.id}
              onClick={() => loadPreview(turn)}
              className={`p-4 rounded-xl text-left transition-all ${
                selectedTurnId === turn.id 
                  ? 'bg-success/20 border border-success/50'
                  : 'bg-base-200 hover:bg-base-200/80 border border-transparent'
              }`}
            >
              <h3 className="font-medium text-white/90 truncate">{turn.user || 'Instruksi Tanpa Teks'}</h3>
              <p className="text-xs text-white/40 mt-1 line-clamp-2">
                {formatHistoryContent(turn.ai?.content).substring(0, 100) || 'Belum ada balasan'}
              </p>
            </button>
          ))}

          {historyTurns.length === 0 && (
            <div className="text-center text-white/50 mt-10">
              Belum ada riwayat.
            </div>
          )}
        </div>
      </div>

      {/* Preview Overlay */}
      {isOpen && previewData && (
        <div className="fixed top-1/2 left-[calc(50%-12rem)] -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl z-[65] animate-[response-fade-in_0.3s_ease-out_forwards] pointer-events-none">
          <div className="bg-base-300/95 backdrop-blur-xl border border-[var(--glass-border)] rounded-3xl p-8 max-h-[80vh] overflow-y-auto custom-scrollbar shadow-[0_0_50px_rgba(0,0,0,0.5)] pointer-events-auto">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-base-300/95 backdrop-blur-md pb-4 border-b border-white/5 z-20">
              <span className="text-sm font-semibold tracking-widest uppercase text-success">Preview Riwayat</span>
              <button onClick={() => {setPreviewData(null); setSelectedTurnId(null)}} className="text-white/50 hover:text-error transition-colors"><FaTimes size={20}/></button>
            </div>
            <div className="mt-4">
              <ResponseArea currentResponse={previewData} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HistoryDrawer;
