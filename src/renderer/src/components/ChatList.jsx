/* eslint-disable react/prop-types */
import { memo, useState } from 'react'
import { Copy, Check, Bot, User, ChevronRight } from 'lucide-react'
import { FaTelegramPlane } from 'react-icons/fa'
import {
  MessageBubble,
  ThinkingBubble,
  DurableTaskBubble,
  MemoryFooterBubble,
  PluginExecutionBubble,
  YoutubeSummaryBubble,
  YoutubeSearchBubble,
  FollowUp,
  Elicitation,
  ElicitationsGroup
} from './Chat'
import { parseUserContent, parseAiContent, parseSubagentReport } from '../utils/chatContentParser'

const ChatList = ({
  id = null,
  role = 'user',
  content = '',
  reasoning = null,
  isThinking = false,
  isCompacting = false,
  compactProgress = '',
  isLastCompacted = false,
  lastCompactedMessageId = null,
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
  taskId = null,
  taskTitle = '',
  taskObjective = '',
  taskStatus = null,
  artifactRoot = null,
  isPlanConclusion = false,
  pluginExecution = null,
  timestamp = '',
  source = null,
  sender = null,
  onStop = null,
  activeLiveTools = null,
  activeThinkingContent = null
}) => {
  const [isCopied, setIsCopied] = useState(false)
  const resolvedCurrentStep = currentStep !== undefined ? currentStep : plan ? plan.length : 0

  if (isCompacting) {
    return (
      <div className="flex items-center justify-center my-4 opacity-75 select-none animate-fade-in">
        <div className="border-t border-dashed border-white/20 flex-grow" />
        <div className="flex items-center gap-2 px-3 font-mono text-[11px] uppercase tracking-wider text-white/70">
          <span>{compactProgress || 'Merangkum Pesan'}</span>
          <span className="loading loading-spinner loading-xs text-primary" />
        </div>
        <div className="border-t border-dashed border-white/20 flex-grow" />
      </div>
    )
  }

  const handleCopy = () => {
    if (!content) return
    let textToCopy = ''
    if (typeof content === 'string') {
      textToCopy = content
    } else if (Array.isArray(content)) {
      textToCopy = content
        .filter((c) => c && (c.type === 'text' || typeof c === 'string'))
        .map((c) => (typeof c === 'string' ? c : c.text))
        .join('\n')
    } else {
      textToCopy = JSON.stringify(content, null, 2)
    }
    if (!textToCopy) return
    navigator.clipboard.writeText(textToCopy)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const isUser = role === 'user'
  const isTelegram = source === 'telegram'
  const isSubagent = source === 'subagent'

  // Bersihkan teks instruksi sistem skill jika pesan berasal dari user
  const { displayUserContent, extractedSkillTag } = isUser
    ? parseUserContent(content)
    : { displayUserContent: content, extractedSkillTag: null }

  // Ekstraksi tag-tag aksi Gemini Web bawaan (<FollowUp>, <ElicitationsGroup>, dll.)
  const { cleanAiContent, followUpChips, elicitationGroup } = !isUser
    ? parseAiContent(content)
    : { cleanAiContent: content, followUpChips: [], elicitationGroup: null }

  const handleChipClick = (queryText) => {
    if (!queryText) return
    window.dispatchEvent(new CustomEvent('trigger-quick-prompt', { detail: { prompt: queryText } }))
  }

  if (isPlanSteps && plan && plan.length > 0) {
    return (
      <div className="w-full my-4 group animate-[response-fade-in_0.2s_ease-out_forwards]">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2 px-1 text-[11px] font-semibold opacity-75">
          <Bot className="w-4 h-4 text-primary" />
          <span className="text-white/90">Mark</span>
          <span className="badge badge-xs bg-primary/10 text-primary border border-primary/20 font-mono text-[9px] py-0.5 px-1.5 font-semibold">
            Task Workflow
          </span>
          {timestamp && <span className="text-[10px] opacity-50 font-normal">{timestamp}</span>}
        </div>

        {/* Flat Task Container */}
        <div className="w-full p-4 rounded-2xl bg-base-200/80 border border-white/10 shadow-sm backdrop-blur-md">
          <DurableTaskBubble
            plan={plan}
            resolvedCurrentStep={resolvedCurrentStep}
            reasoning={reasoning}
            taskId={taskId}
            taskTitle={taskTitle}
            taskObjective={taskObjective}
            taskStatus={taskStatus}
            artifactRoot={artifactRoot}
            onStop={onStop}
            activeLiveTools={activeLiveTools}
            activeThinkingContent={activeThinkingContent}
          />
        </div>
      </div>
    )
  }

  // Jika pesan berasal dari laporan subagent, render dalam kontainer flat collapsible
  if (isSubagent) {
    const { cleanReportContent, artifactInfo } = parseSubagentReport(content)

    return (
      <div className="w-full my-4 group animate-[response-fade-in_0.2s_ease-out_forwards]">
        {/* Header (Nama Sub-Agent & Badge) */}
        <div className="flex items-center gap-2 mb-2 px-1 text-[11px] font-semibold opacity-75">
          <Bot className="w-4 h-4 text-white/70" />
          <span className="text-white font-medium">{sender || 'Sub-Agent'}</span>
          {timestamp && <span className="text-[10px] opacity-50 font-normal">{timestamp}</span>}
        </div>

        {/* Flat Collapsible Container */}
        <div className="w-full rounded-2xl bg-base-200/80 border border-white/10 shadow-sm backdrop-blur-md overflow-hidden">
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

  const showCompactedDivider =
    isLastCompacted ||
    (lastCompactedMessageId &&
      (String(id) === String(lastCompactedMessageId) ||
        String(timestamp) === String(lastCompactedMessageId)))

  return (
    <>
      {isUser ? (
        <div className="max-w-[85%] md:max-w-3xl ml-auto mb-3 flex flex-col items-end group animate-[response-fade-in_0.2s_ease-out_forwards]">
          {/* Header */}
          <div className="text-[11px] font-semibold opacity-75 mb-1.5 flex items-center gap-2 px-1 text-white/70">
            <User className="w-3.5 h-3.5 text-white/50" />
            <span>{isTelegram ? sender || 'Telegram Admin' : 'You'}</span>
            {isTelegram && (
              <span className="badge badge-xs bg-[#229ED9]/15 text-[#229ED9] border-[#229ED9]/30 gap-1 font-mono text-[9px] py-0.5 px-1.5 flex items-center font-normal">
                <FaTelegramPlane className="w-2.5 h-2.5" /> Telegram
              </span>
            )}
            {extractedSkillTag && (
              <span className="badge badge-xs bg-black/40 text-primary border border-primary/40 font-mono text-[9px] py-0.5 px-1.5 font-semibold">
                Skill: /{extractedSkillTag}
              </span>
            )}
            {timestamp && <span className="text-[10px] opacity-50 font-normal">{timestamp}</span>}
          </div>

          {/* User Bubble Card */}
          <div
            className={`rounded-2xl rounded-tr-sm shadow-md transition-all duration-200 break-words overflow-hidden px-5 py-3.5 border ${
              isTelegram
                ? 'bg-gradient-to-br from-[#229ED9]/30 to-[#0088cc]/30 text-white border-[#229ED9]/40 backdrop-blur-md'
                : 'bg-base-200/90 text-base-content border-white/10 backdrop-blur-md'
            }`}
          >
            <MessageBubble
              isUser={true}
              content={displayUserContent}
              reasoning={reasoning}
              sources={sources}
              executedTools={executedTools}
              isPlanConclusion={isPlanConclusion}
            />
          </div>

          <MemoryFooterBubble
            isMemorySaved={isMemorySaved}
            isMemoryUpdated={isMemoryUpdated}
            isMemoryDeleted={isMemoryDeleted}
          />
        </div>
      ) : (
        <div className="w-full my-3 py-1 group animate-[response-fade-in_0.2s_ease-out_forwards]">
          {/* Header & Actions */}
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <div className="flex items-center gap-2 text-xs font-medium text-white/70">
              <Bot className="w-4 h-4 text-primary" />
              <span className="font-semibold text-white/90">Mark</span>
              {isTelegram && (
                <span className="badge badge-xs bg-[#229ED9]/15 text-[#229ED9] border-[#229ED9]/30 gap-1 font-mono text-[9px] py-0.5 px-1.5 flex items-center font-normal">
                  <FaTelegramPlane className="w-2.5 h-2.5" /> Telegram Reply
                </span>
              )}
              {timestamp && <span className="text-[10px] opacity-50 font-normal">{timestamp}</span>}
            </div>

            {/* Action: Copy Button on hover */}
            {content && !isThinking && !isSummarizing && !isSearchingMusic && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                <button
                  onClick={handleCopy}
                  className="btn btn-ghost btn-xs text-white/50 hover:text-white p-1 h-auto min-h-0 flex items-center gap-1 rounded cursor-pointer"
                  title="Salin teks pesan"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-success" />
                      <span className="text-[10px] text-success font-medium">Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span className="text-[10px]">Salin</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Document Content Flow */}
          <div className="w-full text-base-content leading-relaxed">
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
              <div className="flex flex-col gap-3">
                {isYoutubeSummary && <YoutubeSummaryBubble youtubeLink={youtubeLink} />}
                {isYoutubeSearch && (
                  <YoutubeSearchBubble queryYoutube={queryYoutube} youtubeLink={youtubeLink} />
                )}
                {pluginExecution && <PluginExecutionBubble pluginExecution={pluginExecution} />}
                <MessageBubble
                  isUser={false}
                  content={cleanAiContent}
                  reasoning={reasoning}
                  sources={sources}
                  executedTools={executedTools}
                  isPlanConclusion={isPlanConclusion}
                  isThinking={isThinking}
                />

                {/* Opsi Klarifikasi (ElicitationsGroup dari Gemini) */}
                {elicitationGroup && elicitationGroup.options?.length > 0 && (
                  <ElicitationsGroup message={elicitationGroup.message}>
                    {elicitationGroup.options.map((opt, idx) => (
                      <Elicitation
                        key={idx}
                        label={opt.label}
                        query={opt.query}
                        onClick={handleChipClick}
                      />
                    ))}
                  </ElicitationsGroup>
                )}

                {/* Rekomendasi Pertanyaan / Aksi Lanjutan (FollowUp / Suggestion dari Gemini) */}
                {followUpChips && followUpChips.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-col gap-1.5 animate-fade-in">
                    <span className="text-[10px] font-medium text-slate-400">
                      Rekomendasi Pertanyaan:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {followUpChips.map((chip, idx) => (
                        <FollowUp
                          key={idx}
                          label={chip.label}
                          query={chip.query}
                          onClick={handleChipClick}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <MemoryFooterBubble
            isMemorySaved={isMemorySaved}
            isMemoryUpdated={isMemoryUpdated}
            isMemoryDeleted={isMemoryDeleted}
          />
        </div>
      )}
      {showCompactedDivider && (
        <div className="flex items-center justify-center my-4 opacity-50 select-none">
          <div className="border-t border-dashed border-white/20 flex-grow" />
          <span className="px-3 font-mono text-[11px] uppercase tracking-wider text-white/60">
            Message Compacted
          </span>
          <div className="border-t border-dashed border-white/20 flex-grow" />
        </div>
      )}
    </>
  )
}

export default memo(ChatList)
