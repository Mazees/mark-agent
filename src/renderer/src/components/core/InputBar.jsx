import React, { useRef, useEffect } from 'react';
import { FaMicrophone, FaStop, FaArrowUp, FaDesktop, FaWhatsapp } from 'react-icons/fa';

const InputBar = ({ 
  value, 
  onChange, 
  onSubmit, 
  isLoading, 
  isSpeak, 
  onToggleSpeak, 
  onStop,
  source = 'pc'
}) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      // setTimeout to ensure it runs after the disabled attribute is fully removed by React
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    }
  }, [isLoading]);

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50">
      <form 
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        className="relative flex items-center bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] rounded-[2rem] p-2 pr-3 shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all focus-within:border-primary/50 focus-within:shadow-[0_0_20px_oklch(var(--su)/0.2)]"
      >
        {/* TTS Toggle */}
        <button
          type="button"
          onClick={onToggleSpeak}
          className={`p-3 rounded-full transition-all flex-shrink-0 ${
            isSpeak 
              ? 'text-primary bg-success/20' 
              : 'text-white/40 hover:text-white/80 hover:bg-white/5'
          }`}
          title={isSpeak ? 'Voice Response On' : 'Voice Response Off'}
        >
          <FaMicrophone size={18} />
        </button>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={onChange}
          disabled={isLoading}
          placeholder={isLoading ? 'Mark is thinking...' : 'Tanya apapun ke Mark...'}
          className="flex-1 bg-transparent border-none outline-none text-white px-3 py-3 placeholder:text-white/30 disabled:opacity-50"
        />

        {/* Action Button */}
        {isLoading ? (
          <button
            type="button"
            onClick={onStop}
            className="p-3 rounded-full bg-error/20 text-error hover:bg-error hover:text-white transition-all flex-shrink-0"
            title="Stop Generation"
          >
            <FaStop size={16} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            className="p-3 rounded-full bg-success text-success-content disabled:opacity-30 disabled:bg-white/10 disabled:text-white/30 hover:bg-success/80 hover:scale-105 active:scale-95 transition-all flex-shrink-0"
            title="Send Message"
          >
            <FaArrowUp size={16} />
          </button>
        )}
      </form>
    </div>
  );
};

export default InputBar;
