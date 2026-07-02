import React, { useState, useEffect, useRef } from 'react';

const DraggableHoloCard = ({ 
  children, 
  title, 
  id, 
  defaultPosition = { x: window.innerWidth - 400, y: 80 }, 
  onClose, 
  isVisible = true 
}) => {
  const [pos, setPos] = useState(defaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [animState, setAnimState] = useState(isVisible ? 'entering' : 'hidden');
  const dragRef = useRef({ offsetX: 0, offsetY: 0 });

  useEffect(() => {
    if (isVisible) {
      setAnimState('entering');
      const timer = setTimeout(() => setAnimState('visible'), 300);
      return () => clearTimeout(timer);
    } else {
      setAnimState('exiting');
      const timer = setTimeout(() => setAnimState('hidden'), 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      let newX = e.clientX - dragRef.current.offsetX;
      let newY = e.clientY - dragRef.current.offsetY;

      // Simple boundary clamping
      const maxX = window.innerWidth - 100; // at least 100px visible
      const maxY = window.innerHeight - 50;
      
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      setPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    dragRef.current = {
      offsetX: e.clientX - pos.x,
      offsetY: e.clientY - pos.y
    };
  };

  if (animState === 'hidden') return null;

  const animationClass = animState === 'entering' 
    ? 'animate-[holo-project-in_0.3s_ease-out_forwards]'
    : animState === 'exiting'
      ? 'animate-[holo-dismiss_0.3s_ease-in_forwards]'
      : '';

  const dragClass = isDragging ? 'scale-[1.02] rotate-1 shadow-2xl z-50' : 'shadow-lg z-40';

  return (
    <div 
      className={`fixed ${animationClass} ${dragClass} transition-transform duration-75`}
      style={{ left: pos.x, top: pos.y, width: 'fit-content' }}
    >
      <div className="relative overflow-hidden rounded-2xl bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] shadow-[0_4px_30px_oklch(var(--p)/0.1)]">
        
        {/* Animated Border Flow (Top & Bottom) */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-[var(--color-holo-border)] bg-[length:200%_auto] animate-[holo-border-flow_3s_linear_infinite]" />
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--color-holo-border)] bg-[length:200%_auto] animate-[holo-border-flow_3s_linear_infinite] rotate-180" />
        
        {/* Corner Accents */}
        <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-success rounded-tl-2xl opacity-50 pointer-events-none" />
        <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-success rounded-tr-2xl opacity-50 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-success rounded-bl-2xl opacity-50 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-success rounded-br-2xl opacity-50 pointer-events-none" />

        {/* Header / Drag Handle */}
        <div 
          className="flex items-center justify-between px-4 py-2 bg-base-300/50 cursor-grab active:cursor-grabbing border-b border-white/5 select-none"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse shadow-[0_0_8px_oklch(var(--su))]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-success opacity-90">{title}</span>
          </div>
          
          <button 
            onClick={onClose}
            className="text-white/50 hover:text-error transition-colors p-1 -mr-2 rounded-md hover:bg-white/10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh] custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

export default DraggableHoloCard;
