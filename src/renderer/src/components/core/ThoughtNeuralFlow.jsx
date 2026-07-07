import React, { useEffect, useState } from 'react';
import { FaCheck, FaSpinner, FaBrain } from 'react-icons/fa';

const ThoughtNeuralFlow = ({ processes }) => {
  const [displayedPlan, setDisplayedPlan] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let activePlan = processes.find(p => p.type === 'planning');
    
    if (!activePlan && processes.length > 0) {
      const runningProc = processes.find(p => p.status !== 'done');
      if (runningProc) {
        let taskName = runningProc.type === 'web-search' ? 'Mencari Data...' : 
                       runningProc.type === 'plugin-execution' ? 'Eksekusi Plugin...' : 
                       'Memproses...';
        activePlan = {
          status: runningProc.status,
          data: {
            plan: ['Analisis', taskName, 'Sintesis'],
            currentStep: 1,
            reasoning: 'Fast Track Execution'
          }
        };
      }
    }

    if (activePlan) {
      setDisplayedPlan(activePlan);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [processes]);

  const plan = displayedPlan?.data?.plan || [];
  const currentStep = displayedPlan?.data?.currentStep || 0;
  const reasoning = displayedPlan?.data?.reasoning || '';
  const isDone = displayedPlan?.status === 'done';

  return (
    <div 
      className={`absolute inset-0 z-0 pointer-events-none flex items-center justify-center transition-all duration-500 ease-out
        ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
      `}
    >
      <style>
        {`
          @keyframes neuron-spin {
            0% { transform: rotateX(45deg) rotateY(0deg) rotateZ(45deg); }
            100% { transform: rotateX(45deg) rotateY(360deg) rotateZ(45deg); }
          }
          .perspective-1000 {
            perspective: 1000px;
          }
        `}
      </style>
      
      {/* Reasoning text removed as per user request */}

      {/* Nodes around the Orb */}
      {plan.map((step, idx) => {
        const isCompleted = idx < currentStep;
        const isActive = idx === currentStep && !isDone;
        const isPending = idx > currentStep;
        const stepText = typeof step === 'object' ? step.task : step;

        const totalNodes = plan.length;
        const span = totalNodes > 3 ? 180 : 140; // Expand span if there are many nodes
        const startAngle = -90 - (span / 2);
        const stepAngle = totalNodes > 1 ? span / (totalNodes - 1) : 0;
        
        const angleDeg = startAngle + (idx * stepAngle);
        const angleRad = (angleDeg * Math.PI) / 180;
        
        // Push nodes further away if there are many to avoid overlapping labels
        // Use a zigzag pattern for radius if there are many nodes (alternating distances)
        const baseRadius = totalNodes > 3 ? 170 : 150;
        const radius = totalNodes > 3 ? baseRadius + (idx % 2 === 0 ? 0 : 40) : baseRadius;
        
        const x = Math.cos(angleRad) * radius;
        const y = Math.sin(angleRad) * radius;

        // Holographic glass styles
        let glassClass = 'from-base-content/10 to-base-content/5 border-base-content/20 text-base-content/40';
        if (isCompleted) glassClass = 'from-primary/40 to-primary/10 border-primary/50 text-primary shadow-[inset_0_0_10px_oklch(var(--p)/0.2)]';
        if (isActive) glassClass = 'from-secondary/50 to-secondary/20 border-secondary/60 text-secondary shadow-[inset_0_0_15px_oklch(var(--s)/0.4)] animate-pulse scale-110';

        // Calculate line coordinates so they start from the surface of the Node and end at the surface of the Orb
        // Node is at (x,y) relative to Orb(0,0).
        // The SVG center (150,150) represents the Node.
        const distance = radius; 
        const nodeClearance = 16; // Don't draw inside the 32px neuron cube
        const orbClearance = 60; // Don't draw inside the 96px main orb

        // Direction from Node to Orb is (-x, -y)
        const dirX = -x / distance;
        const dirY = -y / distance;

        const startX = 150 + (dirX * nodeClearance);
        const startY = 150 + (dirY * nodeClearance);

        const endX = 150 + (dirX * (distance - orbClearance));
        const endY = 150 + (dirY * (distance - orbClearance));

        return (
          <div 
            key={idx} 
            className="absolute flex flex-col items-center"
            style={{ 
              transform: `translate(${x}px, ${y}px)`,
              transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
              transitionDelay: `${idx * 100}ms`
            }}
          >
            {/* Draw SVG line connecting to center (Orb) */}
            <svg className="absolute w-[300px] h-[300px] pointer-events-none overflow-visible" style={{ top: -150, left: -150 }}>
               <line 
                 x1={startX} y1={startY} 
                 x2={endX} y2={endY} 
                 stroke="currentColor" 
                 className={isCompleted ? 'text-primary opacity-50' : isActive ? 'text-secondary opacity-80' : 'text-base-content opacity-20'}
                 strokeWidth="2"
                 strokeDasharray="4 4"
               />
            </svg>

            {/* The Node (3D Neuron) */}
            <div className="relative w-8 h-8 z-10 perspective-1000">
              <div 
                className="w-full h-full relative" 
                style={{ 
                  transformStyle: 'preserve-3d', 
                  animation: isActive ? 'neuron-spin 4s linear infinite' : 'neuron-spin 10s linear infinite' 
                }}
              >
                {['front', 'back', 'right', 'left', 'top', 'bottom'].map((face) => {
                  let transform = '';
                  // 8 = 2rem = 32px -> half is 16px
                  if (face === 'front') transform = 'translateZ(16px)';
                  if (face === 'back') transform = 'rotateY(180deg) translateZ(16px)';
                  if (face === 'right') transform = 'rotateY(90deg) translateZ(16px)';
                  if (face === 'left') transform = 'rotateY(-90deg) translateZ(16px)';
                  if (face === 'top') transform = 'rotateX(90deg) translateZ(16px)';
                  if (face === 'bottom') transform = 'rotateX(-90deg) translateZ(16px)';

                  return (
                    <div 
                      key={face} 
                      className={`absolute inset-0 m-auto w-full h-full rounded-[4px] border backdrop-blur-sm bg-gradient-to-br flex items-center justify-center transition-all duration-700 ease-in-out ${glassClass}`}
                      style={{ transform }}
                    >
                      {face === 'front' && (
                        <div className="relative w-4 h-4 flex items-center justify-center">
                           <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${isCompleted ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-90'}`}>
                             <FaCheck size={10} />
                           </div>
                           <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
                             <FaSpinner className="animate-spin" size={10} />
                           </div>
                           <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${isPending ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
                             <span className="text-[10px]">{idx + 1}</span>
                           </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Text labels removed as per user request */}
          </div>
        );
      })}
    </div>
  );
};

export default ThoughtNeuralFlow;
