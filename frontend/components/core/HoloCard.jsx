import React, { useState, useRef, useEffect } from 'react';

const HoloCard = ({ children, title, defaultExpanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    if (contentRef.current) {
      if (contentRef.current.scrollHeight > 200) {
        setIsOverflowing(true);
      }
    }
  }, [children]);

  return (
    <div className="relative w-full overflow-hidden rounded-sm bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] animate-[holo-enter_0.4s_ease-out_forwards] shadow-xl">
      
      {/* Animated Border Flow (Top) */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-[var(--color-holo-border)] bg-[length:200%_auto] animate-[holo-border-flow_3s_linear_infinite]" />
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--color-holo-border)] bg-[length:200%_auto] animate-[holo-border-flow_3s_linear_infinite] rotate-180" />
      
      {/* HUD Brackets */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white/30" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white/30" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white/30" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white/30" />

      {/* Scan lines effect */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[repeating-linear-gradient(transparent,transparent_2px,oklch(var(--p))_3px,transparent_4px)] mix-blend-screen" />

      <div className="relative z-10 flex flex-col p-5">
        {title && (
          <h3 className="text-success font-semibold text-xs mb-3 uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse shadow-[0_0_8px_oklch(var(--su))]" />
            {title}
          </h3>
        )}

        <div 
          ref={contentRef}
          className={`transition-all duration-500 ease-in-out relative custom-markdown text-sm text-[#e2e8f0] ${isExpanded ? 'max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar' : 'max-h-[200px] overflow-hidden'}`}
        >
          {children}
        </div>

        {isOverflowing && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-success opacity-70 hover:opacity-100 hover:bg-white/10 transition-all bg-white/5 py-2 rounded-lg border border-white/5"
          >
            {isExpanded ? (
              <>▲ Ringkas Detail</>
            ) : (
              <>▼ Baca Detail Sepenuhnya</>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default HoloCard;
