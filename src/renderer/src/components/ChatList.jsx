import React, { memo, useState } from 'react'
import { Copy, Check, Bot, User, Sparkles, ChevronRight } from 'lucide-react'
import { FaTelegramPlane } from 'react-icons/fa'
import {
  MessageBubble,
  ThinkingBubble,
  PlanningBubble,
  MemoryFooterBubble,
  PluginExecutionBubble,
  YoutubeSummaryBubble,
  YoutubeSearchBubble
} from './Chat'

const ChatList = ({
  role = 'user',
  content = '',
  reasoning = null,
  isThinking = false,
  isMemorySaved = false,
  isMemoryUpdated = false,
  isMemoryDeleted = false,
  isSummarizing = false,
  isYoutubeSummary = false,
  isYoutubeSearch = false,
  queryYoutube = '',
  youtubeLink = '',
  isSearchingMusic = false,
  sources = [],
  executedTools = [],
  isPlanSteps = false,
  plan = [],
  currentStep,
  isPlanConclusion = false,
  pluginExecution = null,
  mood = 'neutral',
  timestamp = '',
  source = null,
  sender = null
}) => {
  const resolvedCurrentStep = currentStep !== undefined ? currentStep : plan ? plan.length : 0
  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = () => {
    if (!content) return
    navigator.clipboard.writeText(content)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const isUser = role === 'user'
  const isTelegram = source === 'telegram'
  const isSubagent = source === 'subagent'

  // Bersihkan teks instruksi sistem skill jika pesan berasal dari user
  let displayUserContent = content
  let extractedSkillTag = null

  if (isUser && typeof content === 'string') {
    if (content.includes('=== SYSTEM INSTRUCTION: SKILL DIAKTIFKAN ===')) {
      const parts = content.split('=== SYSTEM INSTRUCTION: SKILL DIAKTIFKAN ===')
      const promptPart = (parts[0] || '').trim()

      const skillTagMatch = content.match(/---\s*SKILL\s+(?:BAWAAN|EXTERNAL):\s*([a-zA-Z0-9_-]+)\s*---/i)
      if (skillTagMatch) {
        extractedSkillTag = skillTagMatch[1].toLowerCase()
      }

      displayUserContent = promptPart || (extractedSkillTag ? `/${extractedSkillTag}` : 'Jalankan Skill')
    }
  }

  if (isPlanSteps && plan && plan.length > 0) {
    return (
      <PlanningBubble plan={plan} resolvedCurrentStep={resolvedCurrentStep} reasoning={reasoning} />
    )
  }

  // Jika pesan berasal dari laporan subagent, render dalam struktur chat-start yang senada dengan bubble chat
  if (isSubagent) {
    let cleanReportContent = typeof content === 'string' ? content : JSON.stringify(content)
    let artifactInfo = null
    const artifactMatch = cleanReportContent.match(/\nArtefak:\s*(.+)$/m)
    if (artifactMatch) {
      artifactInfo = artifactMatch[1].trim()
      cleanReportContent = cleanReportContent.replace(/\nArtefak:\s*(.+)$/m, '').trim()
    }
    const reportPrefixMatch = cleanReportContent.match(
      /^\[SUB-AGENT REPORT RECEIVED\]:\s*Sub-agent\s*(@\w+)\s*telah menyelesaikan tugasnya dan melaporkan hasil berikut:\s*/i
    )
    if (reportPrefixMatch) {
      cleanReportContent = cleanReportContent.substring(reportPrefixMatch[0].length).trim()
      if (cleanReportContent.startsWith('"') && cleanReportContent.endsWith('"')) {
        cleanReportContent = cleanReportContent.slice(1, -1).trim()
      }
    }

    return (
      <div className="chat chat-start mb-4 group animate-[response-fade-in_0.2s_ease-out_forwards]">
        {/* Avatar Sub-Agent */}
        <div className="chat-image avatar">
          <div className="w-8 h-8 rounded-full flex items-center justify-center border border-white bg-white/10 text-white shadow-md">
            <Bot className="w-4 h-4" />
          </div>
        </div>

        {/* Header (Nama Sub-Agent & Badge) */}
        <div className="chat-header text-[11px] font-semibold opacity-75 mb-1 flex items-center gap-2 px-1">
          <span className="text-white font-medium">{sender || 'Sub-Agent'}</span>
          {timestamp && <span className="text-[10px] opacity-50 font-normal">{timestamp}</span>}
        </div>

        {/* Bubble Container: Collapsible Dropdown senada dengan bubble chat AI */}
        <div className="chat-bubble max-w-[85%] md:max-w-[78%] p-0 shadow-lg transition-all duration-200 overflow-hidden bg-base-200/90 text-base-content border border-white/10 rounded-2xl rounded-tl-sm backdrop-blur-md">
          <details className="group/subreport">
            <summary className="list-none flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors select-none">
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <span className="text-xs font-semibold text-white/90 truncate">
                  Lihat Rangkuman Laporan Dari Sub Agents
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-white/50 transition-transform duration-200 group-open/subreport:rotate-90 shrink-0" />
            </summary>

            <div className="p-4 border-t border-white/10 text-sm leading-relaxed custom-markdown bg-black/20">
              <MessageBubble
                isUser={false}
                content={cleanReportContent}
                reasoning={reasoning}
                sources={sources}
                executedTools={executedTools}
              />

              {artifactInfo && (
                <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-emerald-400 font-mono">
                  <span className="font-semibold text-slate-400 uppercase text-[10px]">
                    Artefak:
                  </span>
                  <span className="bg-black/40 px-2 py-1 rounded border border-white/10 truncate max-w-md">
                    {artifactInfo}
                  </span>
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`chat ${isUser ? 'chat-end' : 'chat-start'} mb-4 group animate-[response-fade-in_0.2s_ease-out_forwards]`}
    >
      {/* Avatar */}
      <div className="chat-image avatar">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center border shadow-md ${
            isTelegram && isUser
              ? 'bg-[#229ED9]/20 border-[#229ED9]/50 text-[#229ED9]'
              : isUser
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'bg-base-300 border-white/10 text-white'
          }`}
        >
          {isTelegram && isUser ? (
            <FaTelegramPlane className="w-4 h-4" />
          ) : isUser ? (
            <User className="w-4 h-4" />
          ) : (
            <Bot className="w-4 h-4 text-primary" />
          )}
        </div>
      </div>

      {/* Header (Sender Name & Time) */}
      <div className="chat-header text-[11px] font-semibold opacity-75 mb-1 flex items-center gap-2 px-1">
        <span>{isUser ? (isTelegram ? sender || 'Telegram Admin' : 'You') : 'Mark'}</span>
        {isTelegram && (
          <span className="badge badge-xs bg-[#229ED9]/15 text-[#229ED9] border-[#229ED9]/30 gap-1 font-mono text-[9px] py-0.5 px-1.5 flex items-center font-normal">
            <FaTelegramPlane className="w-2.5 h-2.5" /> {isUser ? 'Telegram' : 'Telegram Reply'}
          </span>
        )}
        {extractedSkillTag && (
          <span className="badge badge-xs bg-black/40 text-emerald-300 border border-emerald-400/40 font-mono text-[9px] py-0.5 px-1.5 font-semibold">
            Skill: /{extractedSkillTag}
          </span>
        )}
        {timestamp && <span className="text-[10px] opacity-50 font-normal">{timestamp}</span>}
      </div>

      {/* Bubble Container */}
      <div
        className={`chat-bubble max-w-[85%] md:max-w-[78%] shadow-lg transition-all duration-200 break-words overflow-hidden ${
          isUser
            ? isTelegram
              ? 'bg-gradient-to-br from-[#229ED9] to-[#0088cc] text-white font-medium rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-md shadow-[#229ED9]/20 border border-[#229ED9]/40'
              : 'bg-primary text-primary-content font-medium rounded-2xl rounded-tr-sm px-4 py-2.5'
            : isTelegram
              ? 'bg-base-200/90 text-base-content border border-[#229ED9]/30 rounded-2xl rounded-tl-sm p-4 backdrop-blur-md border-l-4 border-l-[#229ED9]'
              : 'bg-base-200/90 text-base-content border border-white/10 rounded-2xl rounded-tl-sm p-4 backdrop-blur-md'
        }`}
      >
        {(isThinking && !content) || isSummarizing || isSearchingMusic ? (
          <ThinkingBubble
            isThinking={isThinking}
            isSummarizing={isSummarizing}
            isSearchingMusic={isSearchingMusic}
            content={content}
            youtubeLink={youtubeLink}
            reasoning={reasoning}
            executedTools={executedTools}
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {isYoutubeSummary && <YoutubeSummaryBubble youtubeLink={youtubeLink} />}
            {isYoutubeSearch && (
              <YoutubeSearchBubble queryYoutube={queryYoutube} youtubeLink={youtubeLink} />
            )}
            {pluginExecution && <PluginExecutionBubble pluginExecution={pluginExecution} />}
            <MessageBubble
              isUser={isUser}
              content={isUser ? displayUserContent : content}
              reasoning={reasoning}
              sources={sources}
              executedTools={executedTools}
              isPlanConclusion={isPlanConclusion}
            />
          </div>
        )}
      </div>

      {/* Footer / Copy Button */}
      {content && !isUser && !isThinking && !isSummarizing && !isSearchingMusic && (
        <div className="chat-footer opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 mt-1 px-1">
          <button
            onClick={handleCopy}
            className="btn btn-ghost btn-xs text-white/50 hover:text-white p-1 h-auto min-h-0 flex items-center gap-1 rounded"
            title="Salin teks pesan"
          >
            {isCopied ? (
              <>
                <Check className="w-3 h-3 text-success" />
                <span className="text-[10px] text-success font-medium">Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span className="text-[10px]">Salin</span>
              </>
            )}
          </button>
        </div>
      )}

      <MemoryFooterBubble
        isMemorySaved={isMemorySaved}
        isMemoryUpdated={isMemoryUpdated}
        isMemoryDeleted={isMemoryDeleted}
      />
    </div>
  )
}

export default memo(ChatList)
