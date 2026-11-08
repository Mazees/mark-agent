import { useEffect, useState } from 'react'
import { useChat } from '../contexts/ChatContext'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useApproval } from '../contexts/ApprovalContext'
import { useMemoryGroomer } from '../hooks/useMemoryGroomer'
import Avatar from '../components/core/Avatar'
import ChatStudio from './ChatStudio'
import { isMainSession } from '@shared/workspaces.js'

export default function MarkHome({ isHome = true }) {
  const {
    chatData,
    runningSessionIds = [],
    isLoading,
    isRecording,
    isProcessing,
    recordingSessionId,
    audioIntensity,
    orbStatus,
    isBooting
  } = useChat()
  const { activeApproval } = useApproval()
  const { isPlaying, currentTrack } = useYoutubeMusic()
  const [speaking, setSpeaking] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  useMemoryGroomer(false)
  useEffect(() => {
    const update = () =>
      setSpeaking(
        Boolean(window.isMarkSpeaking) && isMainSession(window.markSpeakingSessionId || '1')
      )
    window.addEventListener('mark-intensity', update)
    return () => window.removeEventListener('mark-intensity', update)
  }, [])
  const mainRunning = runningSessionIds.some(isMainSession) || isLoading
  const recording = isRecording && isMainSession(recordingSessionId)
  const processing = isProcessing && isMainSession(recordingSessionId)
  const pending = activeApproval?.meta?.sessionId || activeApproval?.meta?.owner?.codingSessionId
  const awaiting = pending && isMainSession(pending)
  const last = chatData.at(-1)
  const mood = chatData.findLast((message) => message.mood)?.mood || 'neutral'
  const activeTools = last?.executedTools || []
  const action = [...activeTools].reverse().find((step) => step.status === 'running')
  const status = recording
    ? 'listening'
    : speaking
      ? 'speaking'
      : processing
        ? 'processing'
        : mainRunning
          ? 'thinking'
          : isPlaying
            ? 'music_groove'
            : orbStatus === 'nudge'
              ? 'nudge'
              : 'idle'
  const label = isBooting
    ? 'Membangunkan Mark…'
    : awaiting
    ? 'Menunggu bantuan'
    : recording
      ? 'Mendengarkan'
      : speaking
        ? 'Berbicara'
        : processing
          ? 'Memproses suara'
          : action
            ? action.reason || 'Menjalankan tindakan'
            : mainRunning
              ? 'Menyiapkan jawaban'
              : ''
  return (
    <div className={`mark-personal-home ${workspaceOpen && !isBooting ? 'mark-personal-workspace' : ''}`} aria-busy={isBooting}>
      <aside className="mark-personal-avatar" aria-label="Avatar Mark">
        <div className="mark-avatar-stage">
          <Avatar
            className={isBooting ? 'mark-avatar-waking' : ''}
            status={status}
            intensity={recording || speaking ? audioIntensity : 0}
            mood={mood}
            receiveAudio={recording || speaking}
            isActive={isHome}
            onInteract={(type, detail = {}) =>
              window.dispatchEvent(
                new CustomEvent('mark-tactile-interaction', { detail: { type, ...detail } })
              )
            }
          />
        </div>
        {label && (
          <p className="mark-personal-status" role="status">
            <span aria-hidden="true" />
            {label}
          </p>
        )}
        {isPlaying && currentTrack && <p className="mark-personal-music">{currentTrack.title}</p>}
      </aside>
      <div className="mark-personal-conversation" inert={isBooting}>
        <ChatStudio personal isOpen={isHome} onWorkspaceVisibilityChange={setWorkspaceOpen} />
      </div>
    </div>
  )
}
