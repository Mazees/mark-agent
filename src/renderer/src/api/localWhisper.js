/**
 * Local Whisper STT Adapter
 * Untuk WebUI, transkripsi didukung langsung via Web Speech API atau Groq Whisper STT.
 */

export const loadWhisper = async (onProgress) => {
  if (onProgress) onProgress({ status: 'ready' })
  return true
}

export const transcribeAudioLocal = async (audioBlob) => {
  try {
    const { transcribeAudio } = await import('./groq')
    return await transcribeAudio(audioBlob)
  } catch (err) {
    console.warn('[LocalWhisper] Fallback transcribe:', err.message)
    return ''
  }
}
