import { saveChatTurn } from './db'

function messageText(content) {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content))
    return content
      .filter((part) => part?.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim()
  return typeof content?.text === 'string' ? content.text.trim() : ''
}

export async function saveCompletedTurn(sessionId, sessionTitle, userMessage, aiMessage) {
  const userText = messageText(userMessage.content)
  const aiText = messageText(aiMessage.content)
  if (!userMessage.id || !userText || !aiText) return
  const session = String(sessionId)
  const saved = await saveChatTurn({
    pairId: `turn:${encodeURIComponent(session)}:${encodeURIComponent(userMessage.id)}`,
    sessionId: session,
    sessionTitle: sessionTitle || `Session ${session}`,
    userText,
    aiText,
    combinedText: `[User]: ${userText}\n[Mark]: ${aiText}`,
    timestamp: aiMessage.created_at ?? Date.now()
  })
  if (!saved?.id) throw new Error('Pasangan percakapan belum tersimpan.')
}
