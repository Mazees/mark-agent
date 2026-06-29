import { getPlan, getTaskAction, getTaskSummary, getPlanConclusion } from './ai/planning'
import { getAnswer } from './ai/chat'
import { getRelevantMemory } from './vectorMemory'
import { getAllMemory } from './db'

export const runWhatsappAgent = async (userInput, isAdmin, senderName, jid, isGroup, msgId, chatSessionHistory = []) => {
  try {
    const plugins = await window.api.getPlugins()
    console.log('=== DEBUG: LOADED PLUGINS ===', plugins)

    // 1. Dapatkan Context / Memory (simulasi)
    const memoryList = await getAllMemory()
    const memory = await getRelevantMemory(userInput, memoryList)

    // 2. Buat Planning
    const contextMsg = (isGroup ? `Kamu di grup WA. Pengirim: ${senderName}.` : `Kamu di chat pribadi dengan ${senderName}.`) + `\n\nFITUR KHUSUS WA: Kamu punya tambahan action "screenshot" (tanpa parameter query) untuk mengambil tangkapan layar monitor PC/laptop jika user memintanya. Gunakan action "screenshot" dan BUKAN "system-command" jika user meminta screenshot.`
    const planResult = await getPlan(userInput, true, null, chatSessionHistory, memory, contextMsg)
    const planArray = planResult?.plan || []

    // Optimisasi Jalur Cepat (Direct Answer)
    // Jika plan kosong (tidak butuh tools) DAN AI memutuskan untuk langsung membalas santai tanpa save memori,
    // langsung return balasan tanpa harus hit API getAnswer kedua kalinya!
    if (planArray.length === 0 && planResult?.direct_answer) {
      let executedTools = []
      let finalCommand = { action: 'none', query: '' }

      // Jika menggunakan Fast Bypass untuk 1 tool
      if (planResult.command && planResult.command.action && planResult.command.action !== 'none') {
        const cmdAction = planResult.command.action
        const qry = planResult.command.query || ''
        finalCommand = planResult.command

        // Eksekusi khusus WA (mirip dengan block eksekusi utama)
        if (cmdAction === 'screenshot') {
          if (isAdmin) {
            window.api.sendWaMessage(jid, "📸 _Siap bos, lagi motret layar laptop..._")
            window.api.waTakeScreenshot(jid, msgId)
            executedTools.push(cmdAction)
          }
        } else if (cmdAction.startsWith('music-')) {
          if (cmdAction === 'music-play' && qry) {
            if (isAdmin) {
              window.api.waPlayMusicUi('play', qry)
            } else {
              window.api.sendWaMessage(jid, "_(⏳ MP3 lagunya lagi didownload ya, tunggu bentar...)_")
              window.api.waDownloadMusic(jid, msgId, qry)
            }
          } else if (isAdmin) {
            const c = cmdAction.replace('music-', '')
            window.api.waPlayMusicUi(c, qry)
          }
          executedTools.push(qry ? `${cmdAction} ("${qry}")` : cmdAction)
        } else if (cmdAction === 'search' || cmdAction === 'yt-summary' || cmdAction === 'yt-search') {
          if (cmdAction === 'search') {
            window.api.waRequestWebSearch({ id: Date.now(), query: qry })
            executedTools.push(`${cmdAction} ("${qry}")`)
          }
        } else if (isAdmin) {
          try {
            await window.api.executePlugin(cmdAction, qry)
            executedTools.push(qry ? `${cmdAction} ("${qry}")` : cmdAction)
          } catch (e) {
            console.error("WA Plugin Execution Error (Fast Bypass):", e)
          }
        }
      }

      return {
        answer: planResult.direct_answer,
        command: finalCommand,
        toolsUsed: executedTools
      }
    }

    // 3. Eksekusi Plan (jika ada)
    const executionResults = []

    for (let i = 0; i < planArray.length; i++) {
      const step = planArray[i]
      let queryToExecute = step.query

      // Dynamic task
      if (step.is_dynamic && i > 0) {
        queryToExecute = await getTaskAction(
          step.task,
          [{ role: 'user', content: userInput }],
          executionResults[i - 1]?.result || ''
        )
      }

      // Execute based on Action
      let stepResult = ''
      
      // Kirim progress update ke WA via IPC (opsional)
      // window.api.sendWaProgress({ jid, message: `⏳ ${step.task}...` })

      if (step.action === 'search') {
        // Panggil web search via hidden webview (menggunakan jembatan Global AI Search yang sudah ada di App.jsx)
        // Karena ini berjalan async dan butuh sinkronisasi, lebih baik menggunakan IPC request ke Main dan Main meneruskan ke Webview
        stepResult = await new Promise((resolve) => {
           window.api.waRequestWebSearch({ id: Date.now() + i, query: queryToExecute })
           const handler = (data) => {
             resolve(JSON.stringify(data.result)) // asumsikan data result ditarik lewat ipc
           }
           // Simplifikasi sementara: Asumsikan Main memproses dan mengembalikan hasil (nanti diimplementasikan)
           // Untuk saat ini kita pakai dummy resolve timeout agar tidak hang jika belum ada IPC nya
           setTimeout(() => resolve(`Hasil pencarian: ${queryToExecute}`), 2000)
        })
      } else if (step.action === 'summary') {
        stepResult = await getTaskSummary(
          step.task,
          [{ role: 'user', content: userInput }],
          executionResults[i - 1]?.result || ''
        )
      } else if (step.action !== 'none') {
        if (step.action === 'screenshot') {
          if (isAdmin) {
            window.api.sendWaMessage(jid, "📸 _Siap bos, lagi motret layar laptop..._")
            window.api.waTakeScreenshot(jid, msgId)
            stepResult = `Aksi screenshot dijalankan dan akan dikirim ke WA.`
          } else {
            stepResult = `Aksi screenshot ditolak karena privasi (bukan admin).`
          }
        } else if (step.action.startsWith('music-')) {
          if (step.action === 'music-play' && queryToExecute) {
            if (isAdmin) {
              window.api.waPlayMusicUi('play', queryToExecute)
              stepResult = `Lagu "${queryToExecute}" diputar di UI laptop.`
            } else {
              window.api.sendWaMessage(jid, "_(⏳ MP3 lagunya lagi didownload ya, tunggu bentar...)_")
              window.api.waDownloadMusic(jid, msgId, queryToExecute)
              stepResult = `Lagu "${queryToExecute}" sedang didownload sebagai MP3.`
            }
          } else if (isAdmin) {
            const cmd = step.action.replace('music-', '')
            window.api.waPlayMusicUi(cmd, queryToExecute)
            stepResult = `Perintah kontrol musik "${cmd}" dikirim.`
          } else {
            stepResult = `Perintah musik "${step.action}" ditolak karena bukan admin.`
          }
        } else {
          // Plugin eksekusi via IPC
          try {
            const res = await window.api.executePlugin(step.action, queryToExecute)
            stepResult = res.success ? `Plugin dijalankan: ${JSON.stringify(res.data)}` : `Gagal eksekusi plugin: ${res.error}`
          } catch (err) {
            stepResult = `Error eksekusi plugin: ${err.message}`
          }
        }
      }

      executionResults.push({ task: step.task, result: stepResult })
    }

    // 4. Generate Final Answer
    let chatSession = []
    
    if (planArray.length === 0) {
      chatSession = [...chatSessionHistory, { role: 'user', content: userInput }]
    } else {
      const synthesisData = executionResults.map((r, idx) => `[Task ${idx + 1}: ${r.task}]\nResult: ${r.result}`).join('\n\n')
      chatSession = [
        ...chatSessionHistory,
        { role: 'user', content: userInput },
        { role: 'assistant', content: `[SYSTEM LOG] Menjalankan perintah dan berikut hasilnya:\n${synthesisData}` },
        { role: 'user', content: "Berdasarkan hasil di atas, tolong berikan balasan akhirnya ke saya." }
      ]
    }
    
    // Panggil getAnswer dari chat.js
    let finalAnswerObj = null
    try {
      finalAnswerObj = await getAnswer(userInput, [], chatSession, false, false, false, contextMsg)
    } catch (e) {
      if (planArray.length > 0) {
        const executedNames = planArray.map(p => p.action).join(', ')
        finalAnswerObj = {
          answer: `✅ Siap! Perintah (${executedNames}) udah gue eksekusi ya.\n_(Btw ini balasan otomatis karena server AI utama lagi delay/sibuk)_`,
          command: null
        }
      } else {
        throw e
      }
    }
    // Handle memory updates from getAnswer
    if (finalAnswerObj?.memory) {
      const { insertMemory, updateMemory, deleteMemory } = await import('./db')
      const actions = { insert: insertMemory, update: updateMemory, delete: deleteMemory }
      if (actions[finalAnswerObj.memory.action]) {
        try {
          const memoryData = { ...finalAnswerObj.memory }
          memoryData.memory = memoryData.memory.trim().replace(/^[\\"]+|[\\"]+$/g, '').replace(/\\n/g, '\n')
          await actions[finalAnswerObj.memory.action](memoryData)
        } catch (e) {
          console.error("WA Memory Save Error:", e)
        }
      }
    }

    // Handle single-action commands from getAnswer (when plan array is empty)
    if (finalAnswerObj?.command && finalAnswerObj.command.action !== 'none') {
      const cmdAction = finalAnswerObj.command.action
      const qry = finalAnswerObj.command.query

      if (cmdAction === 'screenshot') {
        if (isAdmin) {
          window.api.sendWaMessage(jid, "📸 _Siap bos, lagi motret layar laptop..._")
          window.api.waTakeScreenshot(jid, msgId)
        }
      } else if (cmdAction.startsWith('music-')) {
        if (cmdAction === 'music-play' && qry) {
          if (isAdmin) {
            window.api.waPlayMusicUi('play', qry)
          } else {
            window.api.sendWaMessage(jid, "_(⏳ MP3 lagunya lagi didownload ya, tunggu bentar...)_")
            window.api.waDownloadMusic(jid, msgId, qry)
          }
        } else if (isAdmin) {
          const c = cmdAction.replace('music-', '')
          window.api.waPlayMusicUi(c, qry)
        }
      } else if (cmdAction === 'search' || cmdAction === 'yt-summary' || cmdAction === 'yt-search') {
        // Asynchronous tasks requiring feedback are better handled by Planner.
        // However, if getAnswer outputs this, we can optionally trigger them.
        if (cmdAction === 'search') {
          window.api.waRequestWebSearch({ id: Date.now(), query: qry })
        }
      } else if (isAdmin) {
        // Execute plugin
        try {
          await window.api.executePlugin(cmdAction, qry)
        } catch (e) {
          console.error("WA Plugin Execution Error:", e)
        }
      }
    }
    
    const executedTools = planArray
      .filter(p => p.action !== 'none')
      .map(p => p.query ? `${p.action} ("${p.query}")` : p.action)

    if (finalAnswerObj?.command && finalAnswerObj.command.action !== 'none') {
      const c = finalAnswerObj.command
      executedTools.push(c.query ? `${c.action} ("${c.query}")` : c.action)
    }

    return {
      answer: finalAnswerObj?.answer || "Selesai diproses.",
      toolsUsed: executedTools
    }

  } catch (err) {
    console.error('WA Autonomous Error:', err.stack || err)
    return { answer: 'Terjadi kesalahan saat memproses rencana: ' + err.message + '\n\nStack: ' + (err.stack || 'No stack trace') }
  }
}
