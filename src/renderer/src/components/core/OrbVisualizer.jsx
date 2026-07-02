import React, { useState, useEffect } from 'react';


const OrbVisualizer = ({ status = 'idle', intensity = 0, mood = 'neutral' }) => {
  // status: 'idle' | 'thinking' | 'speaking' | 'listening' | 'error'
  
  const [colorClass, setColorClass] = useState('from-primary to-success');

  useEffect(() => {
    if (status === 'error') {
      setColorClass('from-red-600 to-red-900/50');
    } else {
      if (mood === 'negative') setColorClass('from-red-600 to-orange-500');
      else if (mood === 'positive') setColorClass('from-green-500 to-teal-400');
      else setColorClass('from-primary to-success');
    }
  }, [mood, status]);

  let animationClass = '';
  let scaleStyle = {};
  
  switch (status) {
    case 'idle':
      animationClass = 'animate-[orb-breathe_4s_ease-in-out_infinite]';
      break;
    case 'nudge':
      animationClass = 'animate-[orb-breathe_1s_ease-in-out_infinite] scale-105';
      break;
    case 'thinking':
      animationClass = 'animate-[orb-think_3s_linear_infinite] scale-110';
      break;
    case 'speaking':
      animationClass = ''; // Scale is handled by inline style based on intensity
      scaleStyle.transform = `scale(${1 + intensity * 0.3})`;
      break;
    case 'listening':
      animationClass = 'audio-pulse-ring';
      break;
    case 'error':
      animationClass = 'animate-[orb-error_2s_ease-in-out_infinite]';
      break;
    default:
      animationClass = 'animate-[orb-breathe_4s_ease-in-out_infinite]';
  }

  return (
    <div className="relative shrink-0 w-32 h-32 flex items-center justify-center my-8 transition-all duration-500">
      {/* Layer 3: Aura */}
      <div 
        className={`absolute inset-0 rounded-full bg-gradient-to-tr ${colorClass} blur-[60px] opacity-20 transition-all duration-200 ${animationClass}`}
        style={scaleStyle}
      />
      
      {/* Layer 2: Glow */}
      <div 
        className={`absolute inset-0 rounded-full bg-gradient-to-tr ${colorClass} blur-[30px] opacity-40 transition-all duration-200 ${animationClass}`}
        style={scaleStyle}
      />
      
      {/* Layer 1: Inti (3D Sphere) */}
      <div 
        className={`absolute inset-6 rounded-full bg-gradient-to-tr ${colorClass} shadow-[inset_-8px_-8px_16px_rgba(0,0,0,0.5),inset_8px_8px_16px_rgba(255,255,255,0.4),0_0_30px_oklch(var(--p)/0.4)] transition-all duration-200 ${animationClass}`}
        style={scaleStyle}
      />
    </div>
  );
};

export default OrbVisualizer;
