import React from 'react'
import { FaCheck, FaChevronRight } from 'react-icons/fa'

export const PluginExecutionBubble = ({ pluginExecution }) => {
  if (!pluginExecution) return null
  
  return (
    <div className="chat-bubble bg-transparent text-white p-0 shadow-none flex flex-col gap-1 mb-2">
      <details className="group">
        <summary className="text-xs cursor-pointer select-none flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
          <FaChevronRight className="group-open:rotate-90 transition-transform text-[11px]" />
          <span className="truncate max-w-[250px]">
            Tool dieksekusi: {pluginExecution.action}
          </span>
        </summary>
        <div className="pl-4 pt-1 flex flex-col gap-1 border-l border-white/20 ml-1.5 mt-1.5 mb-2">
          <div className="flex items-start text-[11px] font-mono transition-opacity text-white">
            <span className="opacity-100 text-success mr-1 font-bold inline-block w-3 text-center flex items-center justify-center">
              <FaCheck size={10} />
            </span>
            <div className="flex-1 w-full overflow-hidden">
              <div>
                Mengeksekusi {pluginExecution.action}
                {pluginExecution.query && (
                  <span className="opacity-50 ml-1 italic">: {pluginExecution.query}</span>
                )}
              </div>
              {pluginExecution.result && (
                <div className="mt-1.5 mb-1 opacity-80 text-[10px] text-info bg-info/10 p-2 rounded-md border border-info/20 whitespace-pre-wrap font-sans leading-relaxed break-words">
                  {pluginExecution.result}
                </div>
              )}
            </div>
          </div>
        </div>
      </details>
    </div>
  )
}

export default PluginExecutionBubble;