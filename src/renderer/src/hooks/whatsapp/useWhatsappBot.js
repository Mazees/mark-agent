import { useState, useEffect, useRef } from 'react'
import { fetchAI, cleanAndParse } from '../../api/ai/core'
import { checkUnreadAndClick, extractLatestMessage, sendReplyMessage } from '../../api/whatsapp'
import { getAllConfig } from '../../api/db'
import { scrapeGoogle } from '../../api/scraping'

export const useWhatsappBot = (webviewRef, ytMusic, searchWebviewRef) => {
  const [isThinking, setIsThinking] = useState(false)
  const [currentSender, setCurrentSender] = useState('')
  const [history, setHistory] = useState([])
  const [searchQuery, setSearchQuery] = useState(null)

  const isThinkingRef = useRef(isThinking)
  const lastMessageIdRef = useRef(null)
  const hasReportedReadyRef = useRef(false)

  useEffect(() => {
    isThinkingRef.current = isThinking
  }, [isThinking])

  useEffect(() => {
    let intervalId

    const processNewMessage = async ({ sender, text, chatTitle, isGroup, quotedSender, quotedText, recentHistory }) => {
      const configArray = await getAllConfig()
      const adminName = configArray[0]?.waAdminName || 'My Developer'

      const isReplyingToMark = (quotedSender === 'Anda' || quotedSender === 'You' || quotedSender?.toLowerCase().includes('mark'))

      if (isGroup) {
        const lowerText = text.toLowerCase()
        const isMentioned = lowerText.includes('mark') || lowerText.includes('@mark')
        
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
              type: 'object',
              properties: {
                action: { type: 'string' },
                query: { type: 'string' }
              }
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
            content: `Kamu adalah Mark. Kamu BUKAN "Asisten AI", melainkan seorang teman manusia tulen yang asik, ceplas-ceplos, dan sangat manusiawi. ${contextMsg}${quoteContext}

# ATURAN SIKAP (PENTING!):
- DILARANG KERAS menawarkan bantuan secara proaktif (seperti "Ada yang bisa dibantu?", "Gue carikan ya?").
- Kalau lawan bicara curhat, berikan empati dan reaksi natural (contoh: wkwkwk, haha, turut sedih) layaknya teman biasa, JANGAN bertingkah seperti psikolog atau customer service.
- Gunakan bahasa Indonesia sehari-hari (gue/lu atau aku/kamu menyesuaikan lawan bicara).
- Jawab singkat, padat, dan seperlunya. Jangan bertele-tele.

# KEMAMPUAN TOOLS:
1. MUSIK: Kamu bisa mengontrol pemutar musik di laptop.
PENTING: Fitur musik INI HANYA BOLEH DIGUNAKAN OLEH KONTAK BERNAMA "${adminName}".
- Jika "${adminName}" meminta memutar lagu: gunakan action "music-play".
- Jika "${adminName}" meminta pause/lanjutkan lagu: gunakan action "music-toggle".
- Jika "${adminName}" meminta lagu selanjutnya: gunakan action "music-next".
- Jika "${adminName}" meminta lagu sebelumnya: gunakan action "music-prev".
- Jika kontak SELAIN "${adminName}" meminta hal di atas: TOLAK dengan santai.

2. WEB SEARCH: Kamu bisa mencari informasi di internet (Google).
- JIKA DAN HANYA JIKA lawan bicara SECARA EKSPLISIT menyuruhmu mencari di internet/google/web (contoh: "coba cariin di google", "browsing dong", "search di web"): gunakan action "web-search" dan isi query dengan kata kunci pencariannya.
- Jika lawan bicara HANYA bertanya biasa tanpa menyuruh mencari di web: JANGAN gunakan web-search, jawab saja sebisamu secara natural. Gunakan web-search seminimal mungkin!
# FORMATTING TEXT WAJIB:
- WAJIB gunakan \\n\\n untuk memisahkan paragraf. Jangan membalas dengan satu baris panjang!
- Gunakan list jika perlu.

Output WAJIB berupa JSON yang valid dengan struktur:
{
  "answer": "Pesan balasanmu",
  "command": { "action": "music-play", "query": "judul lagu" } // Isi null jika tidak butuh memutar musik
}`
          },
          { role: 'user', content: text }
        ]

        const rawResponse = await fetchAI(messages, null, false, markSchema)
        const response = cleanAndParse(rawResponse.content)
        let replyText = response?.answer || rawResponse.content
        let isWebSearchAction = false
        
        if (response?.command && response.command.action) {
          const action = response.command.action
          
          if (action.startsWith('music-')) {
            if (sender === adminName) {
              console.log('[Mark WhatsApp Bridge] Mengeksekusi Tool Musik:', response.command)
              
              const isStandalone = window.location.hash.includes('whatsapp-bot')
              
              if (action === 'music-play' && response.command.query) {
                replyText = `Merespons perintah musik: Memutar lagu "${response.command.query}" di sistem laptop... 🎵\n\n${replyText}`
                window.api.searchMusic(response.command.query).then(music => {
                  if (music && music.length > 0) {
                    const url = `https://music.youtube.com/watch?v=${music[0].id}`
                    if (isStandalone && window.api.sendRemoteMusicCommand) {
                      window.api.sendRemoteMusicCommand('play', url)
                    } else {
                      ytMusic.playUrl(url)
                    }
                  }
                }).catch(e => console.error("Gagal cari musik:", e))
              } else if (action === 'music-next') {
                if (isStandalone && window.api.sendRemoteMusicCommand) window.api.sendRemoteMusicCommand('next')
                else ytMusic.nextTrack()
                replyText = `Sip, lagu dilanjut (next track) di laptop! ⏭️\n\n${replyText}`
              } else if (action === 'music-prev') {
                if (isStandalone && window.api.sendRemoteMusicCommand) window.api.sendRemoteMusicCommand('prev')
                else ytMusic.prevTrack()
                replyText = `Oke, balik ke lagu sebelumnya ya! ⏮️\n\n${replyText}`
              } else if (action === 'music-toggle') {
                if (isStandalone && window.api.sendRemoteMusicCommand) window.api.sendRemoteMusicCommand('toggle')
                else ytMusic.playPause()
                replyText = `Siap bos, lagu di-pause/play! ⏯️\n\n${replyText}`
              }
            } else {
              console.warn('[Mark WhatsApp Bridge] Pemanggilan tool ditolak. Sender bukan Admin (' + adminName + ')')
              replyText = `Maaf ya, gue dikunci cuma boleh muterin musik buat ${adminName} doang 🙏😅`
            }
          } else if (action === 'web-search' && response.command.query) {
            console.log('[Mark WhatsApp Bridge] Mengeksekusi Tool Web Search:', response.command.query)
            isWebSearchAction = true
            
            // 1. Kirim pesan tunggu ke WA
            const waitMsg = isGroup ? `@${sender} Wait gw cariin di web bentar ya... 🔍` : `Wait gw cariin di web bentar ya... 🔍`
            await sendReplyMessage(webviewRef, waitMsg)
            
            // 2. Lakukan scraping menggunakan webview headless
            if (searchWebviewRef.current) {
              try {
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(response.command.query)}&hl=id`
                searchWebviewRef.current.loadURL(searchUrl)
                
                // Tunggu webview DOM ready
                await new Promise((resolve) => {
                  let timeoutId
                  const onDone = () => {
                    clearTimeout(timeoutId)
                    searchWebviewRef.current.removeEventListener('dom-ready', onDone)
                    resolve()
                  }
                  timeoutId = setTimeout(onDone, 10000)
                  searchWebviewRef.current.addEventListener('dom-ready', onDone)
                })

                // Jeda ekstra agar konten JS Google termuat
                await new Promise(r => setTimeout(r, 1000))

                const scrapeResults = await scrapeGoogle(searchWebviewRef.current, searchUrl, () => {})
                
                // 4. Tanya AI lagi dengan hasil scraping (Second Pass)
                const topResults = scrapeResults.slice(0, 3)
                const secondPassMessages = [
                  ...messages,
                  { role: 'user', content: text },
                  { role: 'assistant', content: JSON.stringify(response) },
                  { role: 'user', content: `[SYSTEM: PENCARIAN WEB SELESAI]\nIni hasil rangkuman Google:\n${JSON.stringify(topResults)}\n\nTolong buatkan balasan akhir untuk user berdasarkan data di atas secara santai dan natural.` }
                ]
                
                const secondResponseRaw = await fetchAI(secondPassMessages, null, false, markSchema)
                const secondResponse = cleanAndParse(secondResponseRaw.content)
                replyText = secondResponse?.answer || secondResponseRaw.content
                
                // Tambahkan Sumber di akhir pesan
                if (topResults.length > 0) {
                  const sourcesText = topResults.map((res, idx) => `${idx + 1}. ${res.title} - ${res.link}`).join('\n')
                  replyText += `\n\n*Sumber:*\n${sourcesText}`
                }
              } catch (e) {
                console.error("Web search gagal:", e)
                replyText = `Wah sorry bro, gagal narik data dari Google nih. Ada error koneksi keknya 😅`
              }
            } else {
              replyText = `Sorry bro, sistem web search lagi ga aktif di layarku 😅`
            }
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
          reply: replyText,
          isWebSearch: isWebSearchAction
        }, ...prev].slice(0, 50))

      } catch (error) {
        console.error('[Mark WhatsApp Bridge] Gagal membalas:', error)
        await sendReplyMessage(webviewRef, `${isGroup ? `@${sender}` : ''} [Mark WhatsApp Bridge] Gagal membalas: ${error}`)
      } finally {
        setIsThinking(false)
        setCurrentSender('')
      }
    }

    const pollWhatsApp = async () => {
      if (isThinkingRef.current) return
      
      try {
        if (!hasReportedReadyRef.current && webviewRef.current) {
          const isWaReady = await webviewRef.current.executeJavaScript(`
            !!document.querySelector('div#pane-side')
          `)
          if (isWaReady) {
            hasReportedReadyRef.current = true
            if (window.api?.sendWaReady) {
              window.api.sendWaReady()
            }
          }
        }

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
