import { app, ipcMain, desktopCapturer } from 'electron'
import fs from 'fs'
import path from 'path'
import { fetchAI, cleanAndParse, getGlobalConfig } from '../ai-bridge.js'
import { addMessage, getMessages } from './message-store.js'
import yts from 'yt-search'
import { execFile } from 'child_process'
import ffmpeg from 'ffmpeg-static'
import { getLoadedPlugins, getPluginHandlers } from '../plugins/plugin-loader.js'
import { jidNormalizedUser } from '@whiskeysockets/baileys'

export const uiMessageHistory = []
export const MAX_UI_HISTORY = 50
const contactCache = {}

export const handleIncomingMessage = async (messages, type, sock, botWindow) => {
  if (type !== 'notify') return

  for (const msg of messages) {
    if (!msg.message) continue

    const jid = msg.key.remoteJid
    if (jid === 'status@broadcast') continue // skip story

    addMessage(jid, msg)

    const isGroup = jid.endsWith('@g.us')
    const senderJid = isGroup ? msg.key.participant : jid
    const senderName = msg.pushName || msg.key.participant || jid

    // Simpan pushName ke cache
    if (msg.pushName && senderJid) {
      contactCache[senderJid] = msg.pushName
    }

    if (msg.key.fromMe) continue // jangan balas pesan sendiri

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''

    const quotedText =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
      null

    // Kirim event ke UI monitoring
    const uiMsgPayload = {
      id: msg.key.id,
      sender: senderName,
      text: text || '[Media]',
      quotedText: quotedText,
      isGroup,
      chatTitle: isGroup
        ? (await sock.groupMetadata(jid).catch(() => ({ subject: jid }))).subject
        : senderName,
      time: new Date(msg.messageTimestamp * 1000).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      type: 'incoming'
    }

    uiMessageHistory.push(uiMsgPayload)
    if (uiMessageHistory.length > MAX_UI_HISTORY) uiMessageHistory.shift()

    if (botWindow && !botWindow.isDestroyed()) {
      botWindow.webContents.send('wa:message', uiMsgPayload)
    }

    // Deteksi senderNumber (LID atau PN)
    let senderNumber
    let rawSenderJid = isGroup ? msg.key.participant : msg.key.remoteJid

    if (rawSenderJid && rawSenderJid.includes('@lid')) {
      const phoneNumber = msg.participant || msg.senderPhoneNumber || rawSenderJid
      senderNumber = jidNormalizedUser(phoneNumber).split('@')[0]
    } else {
      senderNumber = jidNormalizedUser(rawSenderJid).split('@')[0]
    }

    // Cek fitur /register atau /registrasi
    const cmd = text.trim().toLowerCase()
    if (cmd === '/register' || cmd === '/registrasi') {
      const reqText = `⏳ Permintaan akses Admin atas nama *${senderName}* telah dikirim ke layar komputer. Mohon tunggu persetujuan Owner.`
      await sock.sendMessage(jid, { text: reqText }, { quoted: msg })

      if (botWindow && !botWindow.isDestroyed()) {
        botWindow.webContents.send('wa:admin-request', {
          id: senderNumber,
          name: senderName,
          jid: jid,
          timestamp: Date.now()
        })

        // Tampilkan Notifikasi Windows Native dari Main Process
        const { Notification } = require('electron')
        if (Notification.isSupported()) {
          const notif = new Notification({
            title: 'Mark WhatsApp',
            body: `Permintaan akses Admin baru dari ${senderName}! Klik untuk menyetujui.`
          })

          notif.on('click', () => {
            if (botWindow) {
              botWindow.show()
              botWindow.webContents.send('route-to-config')
            }
          })

          notif.show()
        }
      }
      continue
    }

    if (cmd.startsWith('/play ') || cmd.startsWith('/lagu ')) {
      const query = text.substring(text.indexOf(' ') + 1).trim()
      if (!query) {
        await sock.sendMessage(jid, { text: 'Judul lagunya apa bos?' }, { quoted: msg })
        continue
      }

      await sock.sendMessage(
        jid,
        { text: `⏳ Sedang mencari dan mendownload lagu "${query}"...` },
        { quoted: msg }
      )

      try {
        const searchResult = await yts(query)
        const video = searchResult.videos[0]

        if (!video) {
          await sock.sendMessage(
            jid,
            { text: `❌ Aduh, lagu "${query}" nggak ketemu di YouTube.` },
            { quoted: msg }
          )
          continue
        }

        const tempPath = path.join(app.getPath('temp'), `wa-audio-${Date.now()}.mp3`)

        await youtubedl(video.url, {
          extractAudio: true,
          audioFormat: 'mp3',
          ffmpegLocation: `"${ffmpeg}"`,
          output: `"${tempPath}"`
        })

        await sock.sendMessage(
          jid,
          {
            audio: { url: tempPath },
            mimetype: 'audio/mpeg',
            ptt: false
          },
          { quoted: msg }
        )

        // Cleanup
        fs.unlink(tempPath, (err) => {
          if (err) console.error('[Baileys] Gagal menghapus file temp lagu:', err)
        })
      } catch (err) {
        console.error('[Baileys] Error download lagu:', err)
        await sock.sendMessage(
          jid,
          { text: `❌ Gagal mendownload lagu. Error: ${err.message}` },
          { quoted: msg }
        )
      }

      continue
    }

    if (!text) continue

    if (isGroup) {
      const myPn = sock.user?.id?.split(':')[0] || sock.authState?.creds?.me?.id?.split(':')[0]
      const myLid = sock.user?.lid?.split(':')[0] || sock.authState?.creds?.me?.lid?.split(':')[0]

      const botJid = myPn ? myPn + '@s.whatsapp.net' : ''
      const botLid = myLid ? myLid + '@lid' : ''

      // 1. Cek apakah pesan ngetag bot menggunakan fitur tag WhatsApp
      const mentionedJidList = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
      const isMentioned =
        mentionedJidList.includes(botJid) || (botLid && mentionedJidList.includes(botLid))

      // 2. Cek apakah ada kata kunci panggilan di dalam teks
      const lowerText = text.toLowerCase()
      const isCalled =
        lowerText.includes('mark') || lowerText.includes('@mark') || lowerText.includes('bot')

      // 3. Cek apakah pesan ini me-reply pesan dari bot
      const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant || null
      const isReplyToBot = quotedParticipant === botJid || (botLid && quotedParticipant === botLid)

      console.log(
        `[GROUP DEBUG] Teks: "${text}" | isMentioned: ${isMentioned} | isCalled: ${isCalled} | isReplyToBot: ${isReplyToBot}`
      )

      if (!isMentioned && !isCalled && !isReplyToBot) continue
    }

    await processMessage(msg, isGroup, senderName, text, jid, sock, botWindow)
  }
}

const processMessage = async (msg, isGroup, senderName, text, jid, sock, botWindow) => {
  if (botWindow && !botWindow.isDestroyed()) {
    botWindow.webContents.send('wa:thinking', { sender: senderName, isGroup, jid })
  }

  try {
    const recentMessages = getMessages(jid, 5)

    let rawSenderJid = isGroup ? msg.key.participant : jid
    let senderNumber = ''

    if (rawSenderJid && rawSenderJid.includes('@lid')) {
      const phoneNumber = msg.participant || msg.senderPhoneNumber || rawSenderJid
      senderNumber = jidNormalizedUser(phoneNumber).split('@')[0]
    } else {
      senderNumber = rawSenderJid
        ? jidNormalizedUser(rawSenderJid).split('@')[0]
        : jid.split('@')[0]
    }

    // Jika senderNumber adalah LID dari bot itu sendiri (ketika admin chat dari Linked Device ke nomor sendiri)
    const myLid = sock.user?.lid?.split(':')[0] || sock.authState?.creds?.me?.lid?.split(':')[0]
    const myPn = sock.user?.id?.split(':')[0] || sock.authState?.creds?.me?.id?.split(':')[0]

    if (myLid && myPn && senderNumber === myLid) {
      senderNumber = myPn // Translasi otomatis LID ke Nomor WA Asli
    }

    const config = getGlobalConfig()
    const adminNumbers = (config.waAdminNumber || '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
    const isAdmin = adminNumbers.includes(senderNumber)

    const adminDisplay = adminNumbers.length > 0 ? adminNumbers.join(', ') : 'Tidak ada admin'

    const chatTitle = isGroup
      ? (await sock.groupMetadata(jid).catch(() => ({ subject: jid }))).subject
      : senderName
    let processedText = text
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
    for (const mJid of mentionedJids) {
      const num = mJid.split('@')[0]
      const cachedName = contactCache[mJid]
      if (cachedName) {
        const regex = new RegExp(`@${num}`, 'g')
        processedText = processedText.replace(regex, `@${cachedName}`)
      }
    }

    const contextMsg = isGroup
      ? `Kamu sedang berada di obrolan Grup WhatsApp bernama "${chatTitle}". Kamu menerima pesan dari salah satu anggota grup bernama "${senderName}" (Nomor WA: ${senderNumber}). Balas pesan tersebut secara santai layaknya teman grup.`
      : `Kamu sedang mengobrol Private di WhatsApp dengan "${senderName}" (Nomor WA: ${senderNumber}). Jawab pesan tersebut secara personal dan santai.`

    const quotedText =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
      null

    const quotedParticipantJid = msg.message?.extendedTextMessage?.contextInfo?.participant || null
    let quotedParticipant = 'seseorang'
    if (quotedParticipantJid) {
      const myPn = sock.user?.id?.split(':')[0] || sock.authState?.creds?.me?.id?.split(':')[0]
      const senderNum = quotedParticipantJid.split('@')[0]
      if (myPn && senderNum === myPn) {
        quotedParticipant = 'dirimu sendiri (Mark)'
      } else {
        const cachedName = contactCache[quotedParticipantJid]
        quotedParticipant = cachedName ? cachedName : `Nomor WA ${senderNum}`
      }
    }

    const quoteContext = quotedText
      ? `\nSebagai konteks tambahan, pesan "${senderName}" adalah balasan untuk pesan milik ${quotedParticipant} yang bunyinya: "${quotedText}". Nyambungkan balasanmu dengan konteks tersebut.`
      : ''

    try {
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 2000) + 1000))
      await sock.readMessages([msg.key])

      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 1000) + 500))
      await sock.sendPresenceUpdate('composing', jid)
    } catch (readErr) {
      console.log('[Baileys] Gagal ngebaca/read/typing pesan:', readErr.message)
    }

    const conversationHistory = []
    for (let i = 0; i < recentMessages.length - 1; i++) {
      const m = recentMessages[i]
      if (m.isFromMe) {
        conversationHistory.push({ role: 'assistant', content: m.text })
      } else {
        conversationHistory.push({
          role: 'user',
          content: isGroup ? `${m.sender}: ${m.text}` : m.text
        })
      }
    }

    const pluginsPrompt =
      isAdmin && getLoadedPlugins().length > 0
        ? `\n3. KEMAMPUAN TOOLS TAMBAHAN (PLUGINS):\nKamu JUGA BISA menggunakan action dari plugin berikut jika sesuai dengan permintaan user:\n${getLoadedPlugins()
            .map(
              (p) =>
                p.actions
                  ?.map(
                    (a) =>
                      `- JIKA ${a.triggerHint || 'dibutuhkan'}, gunakan action "${a.name}". Deskripsi: ${a.description}`
                  )
                  .join('\n') || ''
            )
            .join(
              '\n'
            )}\nCRITICAL RULE UNTUK PLUGINS: Gunakan tools/plugins HANYA BILA diminta secara EKSPLISIT pada PESAN TERAKHIR user. Pesan-pesan sebelumnya HANYA sebagai konteks obrolan masa lalu. Jika pesan TERAKHIR user hanya merespons santai, menanggapi obrolan masa lalu, atau tidak memberikan instruksi baru, WAJIB gunakan action "none"!\n`
        : ''

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
1. MUSIK: Kamu bisa memutar lagu di laptop atau mengirimkan file MP3.
- JIKA ADA YANG MEMINTA LAGU (siapapun itu, contoh: "mark putar lagu", "lagu naruto dong"): gunakan action "music-play" dan isi query dengan judul lagunya. Nanti sistem yang akan otomatis memutar di laptop (jika dia Admin) atau mendownload & mengirim MP3-nya (jika bukan Admin).
- JIKA ADMIN MEMINTA PAUSE/NEXT/PREV (hanya Admin ${adminDisplay}): gunakan action "music-toggle", "music-next", "music-prev". Jika bukan admin yang minta fitur ini, tolak dengan santai.

2. WEB SEARCH: Kamu bisa mencari informasi di internet (Google).
- JIKA DAN HANYA JIKA lawan bicara SECARA EKSPLISIT menyuruhmu mencari di internet/google/web (contoh: "coba cariin di google", "browsing dong", "search di web"): gunakan action "web-search" dan isi query dengan kata kunci pencariannya.
- Jika lawan bicara HANYA bertanya biasa tanpa menyuruh mencari di web: JANGAN gunakan web-search, jawab saja sebisamu secara natural. Gunakan web-search seminimal mungkin!

3. SCREENSHOT LAYAR KOMPUTER: Kamu bisa memfoto/menangkap layar komputer saat ini.
- JIKA ADMIN MEMINTA SCREENSHOT (contoh: "coba fotokan layar", "screenshot dong", "layar laptop sekarang gimana?"): gunakan action "screenshot" (query dikosongkan). Jika bukan admin yang minta fitur ini, tolak dengan santai.${pluginsPrompt}

# FORMAT OUTPUT WAJIB (STRICT JSON):
Kamu WAJIB mengembalikan HANYA JSON murni tanpa markdown, tanpa backtick (\`\`\`), dan tanpa komentar di dalam JSON.

CONTOH 1 (Jika disuruh muter lagu):
{
  "answer": "Oke bos, lagunya diputar!",
  "command": {
    "action": "music-play",
    "query": "judul lagunya"
  }
}

CONTOH 2 (Jika ngobrol biasa tanpa tools):
{
  "answer": "Balasan biasamu di sini",
  "command": {
    "action": "none",
    "query": ""
  }
}`
      },
      ...conversationHistory,
      { role: 'user', content: isGroup ? `${senderName}: ${processedText}` : processedText }
    ]

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

    const rawResponse = await fetchAI(messages, null, false, markSchema)
    const response = cleanAndParse(rawResponse.content)
    let replyText = response?.answer || rawResponse.content

    if (response?.command && response.command.action) {
      const action = response.command.action
      if (action.startsWith('music-')) {
        if (action === 'music-play' && response.command.query) {
          if (isAdmin) {
            replyText = `Merespons perintah musik: Memutar lagu "${response.command.query}" di sistem laptop... 🎵\n\n${replyText}`
            botWindow.webContents.send('execute-music-command-wa', 'play', response.command.query)
          } else {
            const query = response.command.query
            replyText = `${replyText}\n\n_(⏳ MP3 lagunya lagi didownload ya, tunggu bentar...)_`

            // Asynchronous download
            ;(async () => {
              try {
                const searchResult = await yts(query)
                const video = searchResult.videos[0]
                if (!video) {
                  await sock.sendMessage(jid, {
                    text: `❌ Bro, lagu "${query}" nggak nemu nih di YouTube.`
                  })
                  return
                }
                const tempPath = path.join(app.getPath('temp'), `wa-audio-${Date.now()}.mp3`)
                const unpackFfmpeg = ffmpeg.replace('app.asar', 'app.asar.unpacked')
                const unpackYtdl = unpackFfmpeg.replace(
                  /ffmpeg-static[\\/]ffmpeg\.exe/i,
                  'youtube-dl-exec\\bin\\yt-dlp.exe'
                )

                await new Promise((resolve, reject) => {
                  execFile(
                    unpackYtdl,
                    [
                      video.url,
                      '--extract-audio',
                      '--audio-format',
                      'mp3',
                      '--ffmpeg-location',
                      unpackFfmpeg,
                      '--output',
                      tempPath
                    ],
                    (err, stdout, stderr) => {
                      if (err) {
                        err.message += `\n${stderr}`
                        reject(err)
                      } else {
                        resolve()
                      }
                    }
                  )
                })

                await sock.sendMessage(
                  jid,
                  { audio: { url: tempPath }, mimetype: 'audio/mpeg', ptt: false },
                  { quoted: msg }
                )
                fs.unlink(tempPath, () => {})
              } catch (e) {
                console.error('[Baileys] Error download lagu asinkron:', e)
                await sock.sendMessage(jid, {
                  text: `❌ Wah error pas donlot lagunya: ${e.message}`
                })
              }
            })()
          }
        } else if (isAdmin) {
          if (action === 'music-next') {
            botWindow.webContents.send('execute-music-command-wa', 'next')
            replyText = `Sip, lagu dilanjut (next track) di laptop! ⏭️\n\n${replyText}`
          } else if (action === 'music-prev') {
            botWindow.webContents.send('execute-music-command-wa', 'prev')
            replyText = `Oke, balik ke lagu sebelumnya ya! ⏮️\n\n${replyText}`
          } else if (action === 'music-toggle') {
            botWindow.webContents.send('execute-music-command-wa', 'toggle')
            replyText = `Siap bos, lagu di-pause/play! ⏯️\n\n${replyText}`
          }
        } else {
          replyText = `Maaf ya, fitur remote DJ laptop (pause/next/prev) cuma khusus Owner 🙏😅 Kalo mau request mp3, suruh putar/kirim lagunya aja.`
        }
      } else if (action === 'web-search' && response.command.query) {
        replyText = `🔍 _Sedang mencari "${response.command.query}" di web..._\n\n_Tunggu sebentar ya..._`
        await sock.sendMessage(jid, { text: replyText }, { quoted: msg })

        if (botWindow && !botWindow.isDestroyed()) {
          botWindow.webContents.send('wa:request-web-search', {
            id: msg.key.id,
            query: response.command.query
          })
        }

        const searchResult = await new Promise((resolve) => {
          const handler = (event, data) => {
            if (data.id === msg.key.id) {
              ipcMain.removeListener('wa:web-search-result', handler)
              resolve(data.result)
            }
          }
          ipcMain.on('wa:web-search-result', handler)
          setTimeout(() => {
            ipcMain.removeListener('wa:web-search-result', handler)
            resolve(null)
          }, 60000) // 60 detik max timeout untuk deep search
        })

        if (searchResult && searchResult.length > 0) {
          const searchMessages = [
            ...messages,
            { role: 'assistant', content: rawResponse.content },
            {
              role: 'user',
              content: `[SISTEM INTERNAL: HASIL PENCARIAN WEB]\nBerikut adalah data hasil pencarian web untuk "${response.command.query}":\n${JSON.stringify(searchResult)}\n\nTugasmu sekarang: Jawab pertanyaan awalku berdasarkan data di atas secara natural. DILARANG bilang "sedang mencari", karena datanya sudah kuberikan di atas!\n\nPENTING: Di bagian paling bawah jawabanmu, WAJIB sertakan daftar sumber artikel yang relevan (Tulis "*Sumber:*" lalu list judul dan URL-nya). Format output WAJIB JSON: { "answer": "jawaban akhirmu beserta list sumber", "command": { "action": "none", "query": "" } }.`
            }
          ]
          const finalResponseRaw = await fetchAI(searchMessages, null, false, markSchema)
          const finalResponse = cleanAndParse(finalResponseRaw.content)
          replyText = finalResponse?.answer || finalResponseRaw.content
        } else {
          replyText = `Duh sori banget, fitur pencarian web-nya lagi error atau timeout. 🥲 Nggak nemu hasil apa-apa nih.`
        }
      } else if (action === 'screenshot') {
        if (isAdmin) {
          replyText = `📸 _Siap bos, lagi motret layar laptop..._`
          await sock.sendMessage(jid, { text: replyText }, { quoted: msg })

          try {
            const sources = await desktopCapturer.getSources({
              types: ['screen'],
              thumbnailSize: { width: 1920, height: 1080 }
            })
            if (sources.length > 0) {
              let sentCount = 0
              for (const [index, source] of sources.entries()) {
                const imageBuffer = source.thumbnail.toPNG()
                const tempPath = path.join(
                  app.getPath('temp'),
                  `screenshot-${Date.now()}-${index}.png`
                )
                fs.writeFileSync(tempPath, imageBuffer)

                await sock.sendMessage(
                  jid,
                  { image: { url: tempPath }, caption: `Layar ${index + 1} (${source.name})` },
                  { quoted: msg }
                )
                fs.unlink(tempPath, () => {})
                sentCount++
              }

              replyText = `📸 ${sentCount} Screenshot dari semua monitor berhasil dikirim!`
            } else {
              replyText = '❌ Gagal dapet akses layar, coba pastikan layar nyala.'
            }
          } catch (e) {
            console.error('[Baileys] Error taking screenshot:', e)
            replyText = `❌ Wah error pas mau screenshot: ${e.message}`
          }
        } else {
          replyText =
            'Waduh, privasi tingkat tinggi nih! Cuma Bos/Admin yang boleh lihat isi laptop! 🙅‍♂️'
        }
      } else if (action !== 'none') {
        if (isAdmin) {
          const pluginHandlers = getPluginHandlers()
          if (pluginHandlers[action]) {
            try {
              const res = await pluginHandlers[action]({ query: response.command.query })
              console.log(`\n=== PLUGIN RETURN VALUE (${action}) ===`)
              console.log(res)
              console.log(`===================================\n`)

              const resTxt = typeof res === 'string' ? res : JSON.stringify(res)

              if (botWindow && !botWindow.isDestroyed()) {
                botWindow.webContents.send('wa:reply-sent', {
                  id: Date.now(),
                  sender: 'Mark',
                  text: `(Menjalankan plugin ${action}...)`,
                  reply: `✅ Plugin: ${resTxt}`,
                  isGroup,
                  chatTitle,
                  time: new Date().toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit'
                  }),
                  type: 'outgoing'
                })
              }

              const followUpMessages = [
                ...messages,
                { role: 'assistant', content: `[SYSTEM LOG] Memulai eksekusi plugin ${action}...` },
                {
                  role: 'user',
                  content: `[SISTEM INTERNAL: HASIL PLUGIN '${action}']\nBerikut adalah hasil eksekusi plugin:\n${resTxt}\n\nTugasmu sekarang: Berikan jawaban akhir kepada user berdasarkan data di atas. WAJIB balas dalam format JSON murni dengan schema yang sama.`
                }
              ]

              const followUpRaw = await fetchAI(followUpMessages, null, false, markSchema)
              const followUpData = cleanAndParse(followUpRaw.content)
              if (followUpData?.answer) {
                replyText = followUpData.answer
              }
            } catch (e) {
              console.error('[Baileys] Error executing plugin:', e)
              replyText = `❌ Maaf bro, gagal ngejalanin tool tambahan (${action}): ` + e.message
            }
          } else {
            console.log('[Baileys] Perintah tidak dikenali:', action)
          }
        }
      }
    }

    // Jeda tambahan seolah-olah lagi ngetik, tergantung panjang teks balasannya
    // Anggap ngetik 1 karakter butuh 30-50ms
    const typingSpeed = Math.floor(Math.random() * 20) + 30 // 30ms - 50ms per karakter
    const delayNgetik = Math.min(replyText.length * typingSpeed, 6000) // Maksimal tunggu 6 detik biar gak kelamaan
    await new Promise((r) => setTimeout(r, delayNgetik))

    await sock.sendMessage(jid, { text: replyText }, { quoted: msg })
    await sock.sendPresenceUpdate('paused', jid).catch(() => {})

    const uiReplyPayload = {
      id: Date.now(),
      sender: senderName,
      text,
      reply: replyText,
      isGroup,
      chatTitle,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      type: 'outgoing'
    }

    uiMessageHistory.push(uiReplyPayload)
    if (uiMessageHistory.length > MAX_UI_HISTORY) uiMessageHistory.shift()

    if (botWindow && !botWindow.isDestroyed()) {
      botWindow.webContents.send('wa:reply-sent', uiReplyPayload)
    }
  } catch (e) {
    console.error('[Baileys] Error processing message:', e)
    sock?.sendPresenceUpdate('paused', jid).catch(() => {})

    await sock
      ?.sendMessage(jid, { text: `❌ Maaf bro, terjadi kesalahan: ${e.message}` })
      .catch(() => {})
  }
}