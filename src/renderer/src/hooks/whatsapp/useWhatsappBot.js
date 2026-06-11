import { useState, useEffect, useRef } from 'react'
import { fetchAI, cleanAndParse } from '../../api/ai/core'
import { checkUnreadAndClick, extractLatestMessage, sendReplyMessage } from '../../api/whatsapp'

export const useWhatsappBot = (webviewRef, ytMusic) => {
  const [isThinking, setIsThinking] = useState(false)
  const [currentSender, setCurrentSender] = useState('')
  const [history, setHistory] = useState([])

  const isThinkingRef = useRef(isThinking)
  const lastMessageIdRef = useRef(null)

  useEffect(() => {
    isThinkingRef.current = isThinking
  }, [isThinking])

  useEffect(() => {
    let intervalId

    const processNewMessage = async ({ sender, text, chatTitle, isGroup, quotedSender, quotedText, recentHistory }) => {
      const isReplyingToMark = (quotedSender === 'Anda' || quotedSender === 'You' || quotedSender?.toLowerCase().includes('mark'))

      if (isGroup) {
        const lowerText = text.toLowerCase()
        const isMentioned = lowerText.includes('@mark') || lowerText.includes('mark,') || lowerText.includes('halo mark')
        
        if (!isMentioned && !isReplyingToMark) {
          console.log('[Mark WhatsApp Bridge] Abaikan pesan grup karena Mark tidak di-tag atau di-reply.')
          return
        }
      }

      setIsThinking(true)
      setCurrentSender(isGroup ? `${sender} di ${chatTitle}` : sender)

      try {
        console.log('[Mark WhatsApp Bridge] Memproses pesan:', isGroup ? `[Grup ${chatTitle}]` : '[Private]', sender, '->', text)
        
        const markSchema = {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            command: {
              type: ['object', 'null'],
              properties: { action: { type: 'string' }, query: { type: 'string' } },
              required: ['action', 'query'],
              additionalProperties: true
            }
          },
          required: ['answer', 'command'],
          additionalProperties: true
        }

        let historyContext = ''
        if (recentHistory && recentHistory.length > 0) {
          historyContext = '\n\n=== RIWAYAT 4 CHAT TERAKHIR ===\n' + 
            recentHistory.map(h => `${h.sender}: ${h.text}`).join('\n') + 
            '\n==============================\n'
        }

        const contextMsg = isGroup 
          ? `Kamu sedang berada di obrolan Grup WhatsApp bernama "${chatTitle}". Kamu menerima pesan dari salah satu anggota grup bernama "${sender}". Balas pesan tersebut secara santai layaknya teman grup.${historyContext}`
          : `Kamu sedang mengobrol Private di WhatsApp dengan "${sender}". Jawab pesan tersebut secara personal dan santai.${historyContext}`

        const quoteContext = quotedText ? `\nSebagai konteks tambahan, pesan "${sender}" adalah balasan untuk pesan ini: "${quotedText}". Nyambungkan balasanmu dengan konteks tersebut.` : ''

        const messages = [
          {
            role: 'system',
            content: `Kamu adalah Mark, asisten AI pribadi yang cerdas namun asik. ${contextMsg}${quoteContext}
            
# KEMAMPUAN TOOLS:
Jika user meminta untuk MEMUTAR LAGU (contoh: "putar lagu X", "nyalain lagu", "setel musik"), WAJIB sertakan object command dengan action "music-play" dan query berisi nama lagu/artis.
Jika user minta skip/next lagu, gunakan action "music-next".
Jika user minta pause/stop/play lagu, gunakan action "music-toggle".

# FORMATTING TEXT WAJIB:
- JANGAN membalas dengan satu paragraf panjang yang menyatu!
- WAJIB gunakan \\n\\n untuk memisahkan paragraf.
- Gunakan list/poin jika menjelaskan beberapa hal.

Output WAJIB berupa JSON yang valid dengan struktur:
{
  "answer": "Pesan balasanmu (Gunakan \\n untuk enter/baris baru agar teks rapi dan tidak sebaris. Jangan pakai markdown rumit)",
  "command": { "action": "music-play", "query": "judul lagu" } // atau null jika tidak butuh tool
}`
          },
          { role: 'user', content: text }
        ]

        const rawResponse = await fetchAI(messages, null, false, markSchema)
        const response = cleanAndParse(rawResponse.content)
        let replyText = response?.answer || rawResponse.content
        
        if (response?.command && response.command.action) {
          console.log('[Mark WhatsApp Bridge] Mengeksekusi Tool:', response.command)
          const action = response.command.action
          if (action === 'music-play' && response.command.query) {
            replyText = `Merespons perintah musik: Memutar lagu "${response.command.query}" di sistem laptop... 🎵\n\n${replyText}`
            window.api.searchMusic(response.command.query).then(music => {
              if (music && music.length > 0) ytMusic.playUrl(`https://music.youtube.com/watch?v=${music[0].id}`)
            }).catch(e => console.error("Gagal cari musik:", e))
          } else if (action === 'music-next') {
            ytMusic.nextTrack()
            replyText = `Sip, lagu dilanjut (next track) di laptop! ⏭️\n\n${replyText}`
          } else if (action === 'music-toggle') {
            ytMusic.playPause()
            replyText = `Siap bos, lagu di-pause/play! ⏯️\n\n${replyText}`
          }
        }

        if (isGroup) replyText = `@${sender} ${replyText}`

        console.log('[Mark WhatsApp Bridge] Balasan AI:', replyText)
        
        const success = await sendReplyMessage(webviewRef, replyText)
        if (!success) console.warn('[Mark WhatsApp Bridge] Gagal inject teks ke Webview!')
        
        setHistory(prev => [{
          id: Date.now(),
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          to: isGroup ? `${chatTitle} (${sender})` : sender,
          msg: text,
          reply: replyText
        }, ...prev].slice(0, 50))

      } catch (error) {
        console.error('[Mark WhatsApp Bridge] Gagal membalas:', error)
      } finally {
        setIsThinking(false)
        setCurrentSender('')
      }
    }

    const pollWhatsApp = async () => {
      if (isThinkingRef.current) return
      
      try {
        await checkUnreadAndClick(webviewRef)
        const messageData = await extractLatestMessage(webviewRef)
        
        if (messageData) {
          if (messageData.id !== lastMessageIdRef.current) {
            const isFirstLoad = (lastMessageIdRef.current === null)
            lastMessageIdRef.current = messageData.id

            if (isFirstLoad) {
              console.log('[Mark WhatsApp Bridge] Chat dibuka, mengabaikan teks lama.')
              return
            }
            if (messageData.isOutgoing) {
              console.log('[Mark WhatsApp Bridge] Mengabaikan pesan keluar.')
              return
            }
            
            await processNewMessage(messageData)
          }
        }
      } catch (err) {
        // Abaikan DOM error
      }
    }

    intervalId = setInterval(pollWhatsApp, 2500)

    const handleConsoleMessage = (e) => {
      if (!e.message.includes('The PerformanceObserver does not support buffered flag')) {
        console.log(`[Webview WA] ${e.message}`)
      }
    }

    const webview = webviewRef.current
    if (webview) webview.addEventListener('console-message', handleConsoleMessage)

    return () => {
      clearInterval(intervalId)
      if (webviewRef.current) webviewRef.current.removeEventListener('console-message', handleConsoleMessage)
    }
  }, [])

  return {
    isThinking,
    currentSender,
    history,
    setHistory
  }
}
