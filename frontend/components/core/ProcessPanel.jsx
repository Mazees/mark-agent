import React, { useEffect, useState } from 'react';
import DraggableHoloCard from './DraggableHoloCard';

import { FaCheckCircle, FaSearch, FaListUl, FaBolt, FaCheck, FaChevronRight } from 'react-icons/fa';

const ProcessPanel = ({ processes, onDismiss }) => {
  const [renderedProcesses, setRenderedProcesses] = useState([]);
  // Header global membedakan jumlah task yang sedang dieksekusi dari daftar step di dalam card.
  const executingTaskCount = processes.filter(
    (process) => process.type === 'planning' && process.status === 'active'
  ).length;

  // Sync rendered processes with delayed unmount
  useEffect(() => {
    setRenderedProcesses(prev => {
      const currentIds = processes.map(p => p.id);
      
      // Update existing or mark as exiting
      let next = prev.map(rp => {
        const updated = processes.find(p => p.id === rp.id);
        if (updated) return { ...updated, isExiting: false };
        if (!rp.isExiting) return { ...rp, isExiting: true };
        return rp;
      });

      // Add new ones
      processes.forEach(p => {
        if (!prev.find(rp => rp.id === p.id)) {
          next.push({ ...p, isExiting: false });
        }
      });

      return next;
    });
  }, [processes]);

  // Clean up exiting processes after animation
  useEffect(() => {
    const hasExiting = renderedProcesses.some(p => p.isExiting);
    if (hasExiting) {
      const timer = setTimeout(() => {
        setRenderedProcesses(prev => prev.filter(p => !p.isExiting));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [renderedProcesses]);
  // Auto-dismiss logic for 'done' and 'failed' status
  useEffect(() => {
    const timers = [];
    processes.forEach((proc) => {
      if (proc.status === 'done' || proc.status === 'completed' || proc.status === 'failed') {
        const timeout = proc.type === 'planning' ? 1200 : 2500;
        const timer = setTimeout(() => {
          if (onDismiss) onDismiss(proc.id);
        }, timeout);
        timers.push(timer);
      }
    });
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [processes, onDismiss]);

  if (!renderedProcesses || renderedProcesses.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-40">
      {renderedProcesses.map((proc, index) => {
        // Spawn all on the left side
        const cascadeY = index * 40;
        const cascadeX = index * 30;
        
        if (proc.type === 'planning') {
          const { steps, currentStep, reasoning } = proc.data;
          const isDone = proc.status === 'done';
          const isFailed = proc.status === 'failed';
          const isPaused = proc.status === 'paused';
          const executionTitle = executingTaskCount === 1
            ? 'Executing 1 Task'
            : `Executing ${Math.max(executingTaskCount, 1)} Tasks`;
          return (
            <div className="pointer-events-auto" key={proc.id}>
              <DraggableHoloCard
                id={proc.id}
                title={isDone ? <><FaCheckCircle className="inline mr-1" /> Task Completed</> : isFailed ? <><FaBolt className="inline mr-1 text-error" /> Task Failed</> : isPaused ? <><FaBolt className="inline mr-1 text-warning" /> Task Paused</> : <><FaListUl className="inline mr-1" /> {executionTitle}</>}
                defaultPosition={{ x: 40 + cascadeX, y: 80 + cascadeY }}
                onClose={() => onDismiss(proc.id)}
                isVisible={!proc.isExiting}
              >
                <div className="w-[320px] flex flex-col gap-2">
                  {reasoning && (
                    <details className="group">
                      <summary className="text-[10px] cursor-pointer select-none flex items-center gap-1.5 opacity-50 hover:opacity-100 transition-opacity uppercase tracking-wider mb-2">
                        <FaChevronRight className="group-open:rotate-90 transition-transform text-[8px]" />
                        Proses Pemikiran
                      </summary>
                      <div className="text-[11px] opacity-60 border-l border-white/20 pl-2 mb-2 font-mono whitespace-pre-wrap">
                        {reasoning}
                      </div>
                    </details>
                  )}
                  {steps && steps.map((step, idx) => {
                    let prefix = idx + 1 + '.';
                    let opacity = 'opacity-50 text-white';
                    let suffix = '';

                    if (idx < currentStep) {
                      prefix = <FaCheck className="inline" size={10} />;
                      opacity = 'opacity-100 text-success font-bold';
                    } else if (idx === currentStep && !isDone) {
                      opacity = 'opacity-100 text-white animate-pulse';
                      suffix = '...';
                    }

                    return (
                      <div key={idx} className={`flex items-start text-[11px] font-mono transition-all ${opacity}`}>
                        <span className="w-4 inline-block">{prefix}</span>
                        <div className="flex-1">
                          {typeof step === 'object' && step.query ? (
                            <details className="group/step outline-none">
                              <summary className="cursor-pointer select-none flex items-center hover:opacity-80 outline-none list-none [&::-webkit-details-marker]:hidden">
                                <FaChevronRight className="group-open/step:rotate-90 transition-transform text-[8px] mr-1 opacity-50" />
                                {step.task} {suffix}
                              </summary>
                              <div className="mt-1 pl-3 opacity-70 text-[9px] border-l border-white/20 ml-[3px] mb-1 break-words font-sans bg-black/20 p-1.5 rounded">
                                {step.query}
                              </div>
                            </details>
                          ) : (
                            <>
                              {typeof step === 'object' ? step.task : step}
                              {suffix}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </DraggableHoloCard>
            </div>
          );
        }

        if (proc.type === 'plugin-execution') {
          return (
            <div className="pointer-events-auto" key={proc.id}>
              <DraggableHoloCard
                id={proc.id}
                title={<><FaBolt className="inline mr-1" /> Plugin: {proc.data.action}</>}
                defaultPosition={{ x: 40 + cascadeX, y: 80 + cascadeY }}
                onClose={() => onDismiss(proc.id)}
                isVisible={!proc.isExiting}
              >
                <div className="w-[280px] text-xs font-mono text-white/80">
                  <div className="mb-2">Mengeksekusi: <span className="text-success">{proc.data.query || proc.data.action}</span></div>
                  {proc.data.result && (
                    <div className="p-2 bg-info/10 text-info border border-info/20 rounded-md">
                      {proc.data.result}
                    </div>
                  )}
                </div>
              </DraggableHoloCard>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

export default ProcessPanel;
