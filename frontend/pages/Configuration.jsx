import { useState, useEffect, useRef } from 'react'
import {
  FaSave,
  FaCheckCircle,
  FaTrash,
  FaTimes,
  FaMoon,
  FaSun,
  FaEye,
  FaEyeSlash,
  FaRobot,
  FaBrain,
  FaTerminal,
  FaVolumeUp,
  FaDatabase,
  FaCog
} from 'react-icons/fa'
import {
  getAllMemory,
  getAllConfig,
  saveConfiguration,
  deleteMemory,
  db,
  getRelationship,
  saveRelationship
} from '../api/db'
import { getExtractor } from '../api/vectorMemory'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useLocation } from 'react-router-dom'
import { useConfirm } from '../hooks/useConfirm'
import { useChat } from '../contexts/ChatContext'

const ConfigCameraPreview = ({ deviceId, enabled }) => {
  const videoRef = useRef(null)

  useEffect(() => {
    if (!enabled) return
    let stream = null
    let isMounted = true
    const startCamera = async () => {
      try {
        const constraints = {
          video: deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : true
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (videoRef.current && isMounted) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch((e) => console.error(e))
        } else {
          stream.getTracks().forEach((t) => t.stop())
        }
      } catch (err) {
        console.error('Preview camera error:', err)
      }
    }
    startCamera()
    return () => {
      isMounted = false
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [deviceId, enabled])

  if (!enabled) return null

  return (
    <div className="mt-4 rounded-xl overflow-hidden border border-white/10 bg-black/50 aspect-video relative flex items-center justify-center shadow-inner">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      <div className="absolute top-2 left-2 flex items-center gap-2 px-2 py-1 bg-black/60 rounded text-xs font-mono text-white backdrop-blur-md">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
        Live Preview
      </div>
    </div>
  )
}

const Configuration = ({ isFirstSetup = false, onSetupComplete = null }) => {
  const [config, setConfig] = useState({
    personality: 'Santai layaknya seorang teman dan suka bercanda.',
    model: 'google/gemma-3-4b',
    temperature: 0,
    context: 10,
    ttsRate: 0,
    ttsPitch: 0,
    groqApiKey: '',
    aiProvider: 'gemini-web',
    geminiWebModel: 'gemini-3.6-flash',
    groqModel: 'llama-3.1-8b-instant',
    tgBotToken: '',
    tgAdminIds: '',
    micDeviceId: 'default',
    awarenessEnabled: true,
    cameraDeviceId: 'default',
    cameraEnabled: true
  })
  const [relationalTraits, setRelationalTraits] = useState(null)
  const [memories, setMemories] = useState([])
  const [audioDevices, setAudioDevices] = useState([])
  const [videoDevices, setVideoDevices] = useState([])
  const [loadingMemory, setLoadingMemory] = useState(true)
  const [playingTest, setPlayingTest] = useState(false)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const { confirm, ModalComponent } = useConfirm()
  const chatContext = useChat()

  const [showGroqKey, setShowGroqKey] = useState(false)
  const [showCustomKey, setShowCustomKey] = useState(false)

  const handleTestVoice = async () => {
    setPlayingTest(true)
    const testText =
      'Halo bro! Gue Mark, asisten pribadi lo. Gimana suara gue sekarang? Udah mantap belum?'
    try {
      const audioBase64 = await window.api.textToSpeech(testText, config.ttsRate, config.ttsPitch)
      if (audioBase64) {
        const audio = new Audio(audioBase64)
        audio.onended = () => setPlayingTest(false)
        await audio.play()
      } else {
        setPlayingTest(false)
      }
    } catch (error) {
      console.error('Gagal test suara:', error)
      setPlayingTest(false)
    }
  }

  useEffect(() => {
    loadConfig()
    loadMemories()

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        navigator.mediaDevices
          .enumerateDevices()
          .then((devices) => {
            const mics = devices.filter((d) => d.kind === 'audioinput')
            const cameras = devices.filter((d) => d.kind === 'videoinput')
            setAudioDevices(mics)
            setVideoDevices(cameras)
          })
          .catch((err) => console.error('Error enumerating devices', err))

        // Stop stream immediately since we just needed permission
        stream.getTracks().forEach((track) => track.stop())
      })
      .catch((err) => console.error('Mic/Cam permission denied', err))
  }, [])

  useEffect(() => {
    if (isFirstSetup) {
      setTimeout(() => {
        const driverObj = driver({
          showProgress: true,
          animate: true,
          nextBtnText: 'Lanjut',
          prevBtnText: 'Kembali',
          doneBtnText: 'Paham!',
          steps: [
            {
              popover: {
                title: 'Halo, Selamat Datang di Mark! 👋',
                description:
                  'Mark adalah asisten AI pribadimu. Sebelum mulai ngobrol, ayo kita kenalan dulu sama pengaturan utamanya biar Mark bisa kerja maksimal buat kamu!',
                side: 'top',
                align: 'center'
              }
            },
            {
              element: '#tour-ai-provider',
              popover: {
                title: '1. Pilih Mesin AI',
                description:
                  'Kamu bisa milih mau pakai AI lokal (gratis & privat pakai LM Studio) atau API Cloud kayak Groq buat respons yang jauh lebih kencang.',
                side: 'bottom',
                align: 'start'
              }
            },
            {
              element: '#tour-embed-provider',
              popover: {
                title: '2. Memori AI',
                description:
                  'Ini otak tempat Mark mengingat semuanya. Pilih Transformers.js kalau mau memori jalan 100% lokal tanpa ribet setup tambahan.',
                side: 'top',
                align: 'start'
              }
            },
            {
              element: '#tour-groq-key',
              popover: {
                title: '3. Wajib: Groq API Key',
                description:
                  'Nah ini penting! Karena fitur ngobrol pakai suara (Speech-to-Text) eksklusif pakai Groq, bagian ini WAJIB kamu isi walaupun pakai AI lokal.',
                side: 'top',
                align: 'start'
              }
            },
            {
              element: '#tour-persona',
              popover: {
                title: '4. Kepribadian Mark',
                description:
                  'Di sini kamu bebas nentuin gaya bicara Mark. Mau dia formal kayak asisten pro, atau santai kayak temen nongkrong? Tulis aja di sini!',
                side: 'top',
                align: 'start'
              }
            },
            {
              element: '#tour-temperature',
              popover: {
                title: '5. Kreativitas AI',
                description:
                  'Temperature nentuin seberapa kreatif Mark. Angka kecil (0-0.3) bikin dia kaku tapi akurat, angka besar (0.7-1.0) bikin dia imajinatif dan luwes.',
                side: 'top',
                align: 'start'
              }
            },
            {
              element: '#tour-context',
              popover: {
                title: '6. Konteks Obrolan',
                description:
                  'Ini batas seberapa jauh Mark bisa mengingat riwayat chat dalam satu sesi. Makin besar angkanya, makin panjang ingatan dia, tapi makin berat juga kerjanya.',
                side: 'top',
                align: 'start'
              }
            },
            {
              element: '#tour-tts',
              popover: {
                title: '7. Pengaturan Suara',
                description:
                  'Atur kecepatan (Rate) dan tinggi-rendahnya nada suara (Pitch) Mark. Kamu bisa klik "Test Suara Mark" buat dengerin hasil racikanmu!',
                side: 'top',
                align: 'start'
              }
            },
            {
              element: '#tour-tg-admin',
              popover: {
                title: '8. Telegram Bot Settings',
                description:
                  'Masukkan Telegram Bot Token dari @BotFather dan Telegram User ID dari @userinfobot agar kamu bisa mengontrol Mark jarak jauh via Telegram.',
                side: 'top',
                align: 'start'
              }
            },
            {
              element: '#tour-save-btn',
              popover: {
                title: 'Simpan & Mulai',
                description:
                  'Kalau udah diisi semua (termasuk API key kalau pakai Cloud), klik di sini buat mulai ngobrol sama Mark!',
                side: 'top',
                align: 'center'
              }
            }
          ]
        })
        driverObj.drive()
      }, 500) // Delay sedikit biar render beres
    }
  }, [isFirstSetup])

  const loadConfig = async () => {
    const data = await getAllConfig()
    if (data.length > 0) {
      setConfig((prev) => ({
        ...prev,
        ...data[0],
        aiProvider: data[0].aiProvider || 'gemini-web',
        geminiWebModel: data[0].geminiWebModel || 'gemini-3.6-flash',
        micDeviceId: data[0].micDeviceId || 'default',
        awarenessEnabled: data[0].awarenessEnabled ?? true
      }))
    }
  }

  const loadMemories = async () => {
    setLoadingMemory(true)
    const data = await getAllMemory()
    setMemories(data)
    setLoadingMemory(false)
  }

  const handleDeleteMemory = async (mem) => {
    const result = await confirm({
      title: 'Hapus Memori?',
      message: `Yakin ingin menghapus memori ini?\n"${mem.summary || mem.memory}"`,
      isError: true,
      confirmText: 'Ya, Hapus'
    })

    if (result.isConfirmed) {
      await deleteMemory({ id: mem.id })
      setMemories((prev) => prev.filter((m) => m.id !== mem.id))
    }
  }

  const handleClearAllChat = async () => {
    const result = await confirm({
      title: 'Hapus Semua Chat?',
      message: 'Semua riwayat sesi chat akan dihapus permanen dan tidak bisa dikembalikan.',
      isError: true,
      confirmText: 'Ya, Hapus Semua'
    })

    if (result.isConfirmed) {
      await db.sessions.clear()
      await db.chatArchive.clear()
    }
  }

  const handleExportChat = async () => {
    const session = await db.sessions.get(1)
    const exportData = session ? session.data : []
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mark-chat-history-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSaveConfiguration = async () => {
    // Validasi API Key
    if (!config.groqApiKey?.trim()) {
      await confirm({
        title: 'API Key Kosong',
        message:
          'Tolong isi Groq API Key terlebih dahulu! API Key ini wajib untuk fitur Voice STT.',
        isError: true,
        hideCancel: true,
        confirmText: 'Tutup'
      })
      return
    }

    if (config.aiProvider === 'custom') {
      const endpoint = config.customEndpoint?.trim() || ''
      if (!endpoint.endsWith('/chat/completions')) {
        alert(
          'Gagal Menyimpan: Custom Endpoint URL tidak valid! URL wajib diakhiri dengan /chat/completions (Contoh: https://api.openai.com/v1/chat/completions).'
        )
        return
      }
    }

    setIsDownloadingModel(true)
    setDownloadProgress(0)

    try {
      let extStats = {}
      await getExtractor((info) => {
        if (info.status === 'initiate') {
          extStats[info.file] = { loaded: 0, total: info.total || 0 }
        } else if (info.status === 'progress') {
          if (extStats[info.file]) {
            extStats[info.file].loaded = info.loaded
            extStats[info.file].total = info.total
          }
          const values = Object.values(extStats)
          const totalBytes = values.reduce((acc, curr) => acc + curr.total, 0)
          const loadedBytes = values.reduce((acc, curr) => acc + curr.loaded, 0)
          if (totalBytes > 0) {
            setDownloadProgress(Math.round((loadedBytes / totalBytes) * 100))
          }
        } else if (info.status === 'done' || info.status === 'ready') {
          setDownloadProgress(100)
        }
      })
    } catch (e) {
      console.error(e)
    }
    setIsDownloadingModel(false)
    await saveConfiguration(config)

    // Update global state without reloading the page
    if (chatContext && chatContext.setConfig) {
      chatContext.setConfig([config])
    }

    if (isFirstSetup && onSetupComplete) {
      onSetupComplete()
    } else {
      // Kembali ke halaman chat
      window.location.href = '#/'
    }
  }

  const groupedMemories = memories.reduce((acc, mem) => {
    const type = mem.type || 'other'
    if (!acc[type]) acc[type] = []
    acc[type].push(mem)
    return acc
  }, {})

  const typeBadgeColor = {
    profile: 'badge-primary',
    preference: 'badge-secondary',
    skill: 'badge-accent',
    project: 'badge-info',
    transaction: 'badge-warning',
    goal: 'badge-success',
    relationship: 'badge-error',
    fact: 'badge-neutral',
    other: 'badge-ghost'
  }

  const handleAiProviderChange = (provider) =>
    setConfig((prev) => ({ ...prev, aiProvider: provider }))
  const handleModelChange = (e) => setConfig((prev) => ({ ...prev, model: e.target.value }))
  const handleGroqApiKeyChange = (e) =>
    setConfig((prev) => ({ ...prev, groqApiKey: e.target.value }))
  const handleCustomEndpointChange = (e) =>
    setConfig((prev) => ({ ...prev, customEndpoint: e.target.value }))
  const handleCustomApiKeyChange = (e) =>
    setConfig((prev) => ({ ...prev, customApiKey: e.target.value }))
  const handleCustomModelChange = (e) =>
    setConfig((prev) => ({ ...prev, customModel: e.target.value }))
  const handleAwarenessEnabledChange = (e) =>
    setConfig((prev) => ({ ...prev, awarenessEnabled: e.target.checked }))
  const handlePersonalityChange = (e) =>
    setConfig((prev) => ({ ...prev, personality: e.target.value }))
  const handleTemperatureChange = (e) =>
    setConfig((prev) => ({ ...prev, temperature: e.target.value }))
  const handleContextChange = (e) => setConfig((prev) => ({ ...prev, context: e.target.value }))
  const handleMicDeviceIdChange = (e) =>
    setConfig((prev) => ({ ...prev, micDeviceId: e.target.value }))
  const handleCameraDeviceIdChange = (e) => {
    console.log(
      '[Config] Camera device changed to:',
      e.target.value,
      '| label:',
      e.target.options[e.target.selectedIndex]?.text
    )
    setConfig((prev) => ({ ...prev, cameraDeviceId: e.target.value }))
  }
  const handleCameraEnabledChange = (e) =>
    setConfig((prev) => ({ ...prev, cameraEnabled: e.target.checked }))
  const handleTtsRateChange = (e) => setConfig((prev) => ({ ...prev, ttsRate: e.target.value }))
  const handleTtsPitchChange = (e) => setConfig((prev) => ({ ...prev, ttsPitch: e.target.value }))

  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)

  const normalizeShortcut = (val) => {
    if (!val) return 'CommandOrControl+Alt+M'
    return val
      .replace(/\bctrl\b/gi, 'CommandOrControl')
      .replace(/\bcontrol\b/gi, 'CommandOrControl')
      .replace(/\bcmd\b/gi, 'CommandOrControl')
      .replace(/\bmeta\b/gi, 'CommandOrControl')
  }

  const handleShortcutKeyChange = (e) => {
    const rawVal = e.target.value
    const normalized = normalizeShortcut(rawVal)
    setConfig((prev) => {
      const updated = { ...prev, shortcutKey: normalized }
      if (window.api && window.api.syncConfig) window.api.syncConfig(updated)
      return updated
    })
  }

  const handleShortcutRecorderKeyDown = (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

    const modifiers = []
    if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')

    let keyName = e.key.toUpperCase()
    if (e.code === 'Space' || keyName === ' ') keyName = 'Space'

    const fullShortcut = [...modifiers, keyName].join('+')

    setConfig((prev) => {
      const updated = { ...prev, shortcutKey: fullShortcut }
      if (window.api && window.api.syncConfig) window.api.syncConfig(updated)
      return updated
    })
    setIsRecordingShortcut(false)
  }
  const handleBack = () => window.history.back()
  const handleToggleGroqKey = () => setShowGroqKey(!showGroqKey)
  const handleToggleCustomKey = () => setShowCustomKey(!showCustomKey)

  const handleTgBotTokenChange = (e) =>
    setConfig((prev) => ({ ...prev, tgBotToken: e.target.value }))
  const handleTgAdminIdsChange = (e) =>
    setConfig((prev) => ({ ...prev, tgAdminIds: e.target.value }))

  return (
    <div
      className="h-screen text-white overflow-hidden relative font-['Poppins',sans-serif] bg-base-300 rounded-xl border border-white/5 shadow-2xl"
    >
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Main Content Area */}
      <div className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl mx-auto px-4 py-8 pb-32 space-y-8">
          {/* Page Header */}
          <div className="flex items-center gap-4">
            {!isFirstSetup && (
              <button
                type="button"
                onClick={handleBack}
                className="btn btn-ghost btn-sm btn-circle shrink-0"
                style={{ WebkitAppRegion: 'no-drag' }}
                title="Kembali"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="1.2em"
                  height="1.2em"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold">
                {isFirstSetup ? 'Selamat Datang di Mark!' : 'Pengaturan Mark'}
              </h1>
              <p className="opacity-50 text-sm mt-1">
                {isFirstSetup
                  ? 'Sebelum mulai ngobrol, atur provider AI dan pengaturan dasar lainnya di bawah ini.'
                  : 'Sesuaikan perilaku Mark dengan preferensimu.'}
              </p>
            </div>
          </div>

          {/* ── AI Engine & Tools ── */}
          <section className="space-y-5">
            <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
              AI Engine & Tools
            </h2>

            {/* AI Provider Selector */}
            <div id="tour-ai-provider" className="space-y-1.5">
              <p className="text-sm font-semibold">AI Provider</p>
              <select
                className="select select-bordered w-full font-medium"
                value={config.aiProvider || 'gemini-web'}
                onChange={(e) => handleAiProviderChange(e.target.value)}
              >
                <option value="gemini-web">Gemini (Gratis)</option>
                <option value="lm-studio">LM Studio (Local Offline)</option>
                <option value="custom">Custom API (OpenAI-Compatible)</option>
              </select>
            </div>

            {config.aiProvider === 'gemini-web' || !config.aiProvider ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Model Gemini</p>
                  <select
                    className="select select-bordered w-full"
                    value={config.geminiWebModel || 'gemini-3.6-flash'}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, geminiWebModel: e.target.value }))
                    }
                  >
                    <option value="gemini-3.6-flash">gemini-3.6-flash (Model Utama Terbaru)</option>
                    <option value="gemini-3.5-flash">gemini-3.5-flash (Stabil & Seimbang)</option>
                    <option value="gemini-3.5-flash-thinking">
                      gemini-3.5-flash-thinking (Penalaran Mendalam)
                    </option>
                    <option value="gemini-3.5-flash-thinking-lite">
                      gemini-3.5-flash-thinking-lite (Penalaran Cepat)
                    </option>
                    <option value="gemini-auto">gemini-auto (Otomatis Server)</option>
                    <option value="gemini-flash-lite">gemini-flash-lite (Super Cepat)</option>
                  </select>
                  <p className="text-xs opacity-50 mt-1">
                    Provider bawaan tanpa API Key. Membutuhkan koneksi internet (tidak mendukung
                    input gambar).
                  </p>
                </div>
              </div>
            ) : config.aiProvider === 'custom' ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Custom Endpoint URL</p>
                  <input
                    type="text"
                    placeholder="Contoh: https://api.openai.com/v1/chat/completions"
                    className={`input input-bordered w-full ${config.customEndpoint && !config.customEndpoint.trim().endsWith('/chat/completions') ? 'input-error' : ''}`}
                    value={config.customEndpoint || ''}
                    onChange={handleCustomEndpointChange}
                  />
                  {config.customEndpoint &&
                  !config.customEndpoint.trim().endsWith('/chat/completions') ? (
                    <p className="text-xs text-error mt-1 font-medium">
                      URL endpoint tidak memenuhi standar format OpenAI-Compatible.
                    </p>
                  ) : (
                    <p className="text-xs opacity-50 mt-1">
                      Pastikan Endpoint mendukung standar format <strong>OpenAI-Compatible</strong>.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Custom Model ID</p>
                  <input
                    type="text"
                    placeholder="Contoh: gpt-4o-mini"
                    className="input input-bordered w-full"
                    value={config.customModel || ''}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, customModel: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Custom API Key</p>
                  <div className="relative w-full">
                    <input
                      type={showCustomKey ? 'text' : 'password'}
                      placeholder="Masukkan API Key (jika diperlukan)"
                      className="input input-bordered w-full pr-10"
                      value={config.customApiKey || ''}
                      onChange={handleCustomApiKeyChange}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
                      onClick={handleToggleCustomKey}
                      title={showCustomKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
                    >
                      {showCustomKey ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                          <line x1="2" x2="22" y1="2" y2="22" />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Model Selector (LM Studio)</p>
                <input
                  type="text"
                  placeholder="Contoh: google/gemma-3-4b"
                  className="input input-bordered w-full"
                  value={config.model || ''}
                  onChange={handleModelChange}
                />
                <p className="text-xs opacity-40">
                  Nama model yang aktif di LM Studio. Pastikan sudah ter-load.
                </p>
              </div>
            )}

            {/* Awareness Engine Toggle */}
            <div className="space-y-1.5 p-2 -mx-2 rounded-lg bg-base-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Awareness Engine</p>
                  <p className="text-xs opacity-50 mt-1">
                    Mengizinkan Mark membaca log sistem/aktivitas dan memulai obrolan secara
                    proaktif di latar belakang.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={config.awarenessEnabled !== false}
                  onChange={handleAwarenessEnabledChange}
                />
              </div>
            </div>

            {/* System Persona */}
            <div id="tour-persona" className="space-y-1.5 p-2 -mx-2 rounded-lg">
              <p className="text-sm font-semibold">Gaya Bicara dan Kepribadian</p>
              <textarea
                className="textarea w-full h-72 leading-relaxed no-scrollbar resize-none"
                placeholder="Deskripsikan kepribadian Mark..."
                value={config.personality}
                onChange={handlePersonalityChange}
              />
            </div>
            <div id="tour-temperature" className="space-y-2 p-2 -mx-2 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Temperature</p>
                <span className="font-mono text-sm text-primary font-bold">
                  {config.temperature}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.temperature}
                className="range range-primary range-xs w-full"
                onChange={handleTemperatureChange}
              />
              <div className="flex justify-between px-2.5 mt-2 text-xs">
                <span>0</span>
                <span>0.2</span>
                <span>0.4</span>
                <span>0.6</span>
                <span>0.8</span>
                <span>1.0</span>
              </div>
            </div>

            {/* Context Window */}
            <div id="tour-context" className="space-y-2 p-2 -mx-2 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Context Window</p>
                <span className="font-mono text-sm text-primary font-bold">{config.context}</span>
              </div>
              <input
                type="range"
                min="2"
                max="22"
                step="2"
                value={config.context}
                className="range range-primary range-xs w-full"
                onChange={handleContextChange}
              />
              <div className="flex justify-between mt-2 text-xs">
                <span>2</span>
                <span>6</span>
                <span>10</span>
                <span>14</span>
                <span>18</span>
                <span>22</span>
              </div>
            </div>

            <div className="divider"></div>

            {/* Window Settings */}
            <div className="space-y-2 p-2 -mx-2 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Tingkat Transparansi Jendela</p>
                <span className="font-mono text-sm text-primary font-bold">
                  {Math.round((config.windowOpacity ?? 0.85) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={config.windowOpacity ?? 0.85}
                className="range range-primary range-xs w-full"
                onChange={(e) => {
                  const val = parseFloat(e.target.value)
                  setConfig((prev) => {
                    const newConfig = { ...prev, windowOpacity: val }
                    if (window.api && window.api.syncConfig) window.api.syncConfig(newConfig)
                    return newConfig
                  })
                }}
              />
              <div className="flex justify-between mt-2 text-xs opacity-50">
                <span>10% (Kaca Bening)</span>
                <span>100% (Solid)</span>
              </div>
            </div>

            <div className="divider"></div>

            {/* Camera Settings */}
            <div className="space-y-6 p-2 -mx-2 rounded-lg">
              <h2 className="text-base font-bold uppercase tracking-wider opacity-70 mb-5 flex items-center gap-2">
                Kamera
              </h2>

              <div className="form-control">
                <label className="label cursor-pointer p-0">
                  <span className="label-text text-sm font-semibold">Aktifkan Kamera AI</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={config.cameraEnabled !== false}
                    onChange={handleCameraEnabledChange}
                  />
                </label>
                <span className="text-xs opacity-50 mt-2 block">
                  Mengizinkan Mark menggunakan kamera (jika diminta) untuk melihat dunia fisik.
                </span>
              </div>

              {config.cameraEnabled !== false && (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Perangkat Kamera</p>
                  <select
                    className="select select-bordered w-full"
                    value={config.cameraDeviceId || 'default'}
                    onChange={handleCameraDeviceIdChange}
                  >
                    <option value="default">Default System Camera</option>
                    {videoDevices.map((cam) => (
                      <option key={cam.deviceId} value={cam.deviceId}>
                        {cam.label || `Camera ${cam.deviceId.substring(0, 5)}...`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {config.cameraEnabled !== false && (
                <ConfigCameraPreview
                  deviceId={config.cameraDeviceId}
                  enabled={config.cameraEnabled !== false}
                />
              )}
            </div>

            {/* ── Global Shortcut Settings ── */}
            <section id="tour-shortcut" className="space-y-5 p-2 -mx-2 rounded-lg">
              <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
                Global Shortcut Key
              </h2>

              <div className="space-y-1.5">
                <div className="flex justify-between items-end">
                  <p className="text-sm font-semibold">Tombol Panggilan Cepat</p>
                  <span className="text-[10px] font-mono opacity-50">Aktif Lintas Aplikasi</span>
                </div>

                <div className="relative w-full">
                  <input
                    type="text"
                    readOnly
                    onFocus={() => setIsRecordingShortcut(true)}
                    onBlur={() => setIsRecordingShortcut(false)}
                    onKeyDown={handleShortcutRecorderKeyDown}
                    value={
                      isRecordingShortcut
                        ? 'Tekan kombinasi tombol di keyboard...'
                        : (config.shortcutKey || 'CommandOrControl+Alt+M').replace(
                            /CommandOrControl|Control/g,
                            'Ctrl'
                          )
                    }
                    className={`input input-bordered w-full font-mono text-sm cursor-pointer select-none ${
                      isRecordingShortcut
                        ? 'input-primary border-2 animate-pulse bg-primary/10 text-primary font-bold'
                        : 'hover:border-primary/60'
                    }`}
                  />
                </div>

                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-xs opacity-60 w-full mb-1">Preset Cepat:</span>
                  {[
                    'CommandOrControl+Alt+M',
                    'CommandOrControl+Shift+Space',
                    'Alt+Space',
                    'CommandOrControl+Space',
                    'F9'
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setConfig((prev) => {
                          const updated = { ...prev, shortcutKey: preset }
                          if (window.api && window.api.syncConfig) window.api.syncConfig(updated)
                          return updated
                        })
                      }}
                      className={`btn btn-xs ${config.shortcutKey === preset ? 'btn-primary' : 'btn-ghost border-base-content/20'} font-mono`}
                    >
                      {preset.replace('CommandOrControl', 'Ctrl')}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] opacity-60 block mt-1">
                  Cukup <b>klik kotak input di atas</b> lalu tekan kombinasi tombol di keyboard kamu
                  (misal: <code>Ctrl+Alt+A</code>, <code>Alt+Space</code>, <code>F9</code>).
                  Shortcut langsung aktif seketika di OS!
                </span>
              </div>
            </section>

            <div className="divider"></div>

            {/* TTS Settings */}
            <div id="tour-tts" className="space-y-6 p-2 -mx-2 rounded-lg">
              <h2 className="text-base font-bold uppercase tracking-wider opacity-70 mb-5">
                Audio & Voice Engine
              </h2>

              {/* STT Engine Info */}
              <div className="space-y-1.5 p-4 rounded-xl bg-base-200/50 border border-base-content/10">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Voice Speech-to-Text (STT)</p>
                  <span className="badge badge-primary badge-sm font-mono font-bold">Edge Native (0 MB RAM)</span>
                </div>
                <p className="text-xs opacity-60">
                  MARK menggunakan <strong>Web Speech API</strong> bawaan Microsoft Edge di Windows. Bekerja secara instan dan bebas lag tanpa memerlukan unduhan model AI lokal atau API key.
                </p>
              </div>

              {/* Microphone Source Selection */}
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Mikrofon (Voice Input)</p>
                <select
                  className="select select-bordered w-full"
                  value={config.micDeviceId || 'default'}
                  onChange={handleMicDeviceIdChange}
                >
                  <option value="default">Default System Microphone</option>
                  {audioDevices.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label || `Microphone ${mic.deviceId.substring(0, 5)}...`}
                    </option>
                  ))}
                </select>
              </div>

              {/* TTS Rate */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">TTS Rate (Kecepatan Suara)</p>
                  <span className="font-mono text-sm text-primary font-bold">
                    {config.ttsRate}%
                  </span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  step="1"
                  value={config.ttsRate}
                  className="range range-primary range-xs w-full"
                  onChange={handleTtsRateChange}
                />
                <div className="flex justify-between mt-2 text-xs">
                  <span>-50%</span>
                  <span>-25%</span>
                  <span>0%</span>
                  <span>25%</span>
                  <span>50%</span>
                </div>
              </div>

              {/* TTS Pitch */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">TTS Pitch (Nada Suara)</p>
                  <span className="font-mono text-sm text-primary font-bold">
                    {config.ttsPitch}hz
                  </span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  step="1"
                  value={config.ttsPitch}
                  className="range range-primary range-xs w-full"
                  onChange={handleTtsPitchChange}
                />
                <div className="flex justify-between mt-2 text-xs">
                  <span>-50hz</span>
                  <span>-25hz</span>
                  <span>0hz</span>
                  <span>25hz</span>
                  <span>50hz</span>
                </div>
              </div>

              {/* Test TTS Button */}
              <div className="pt-2">
                <button
                  className={`btn btn-soft btn-sm gap-2 ${playingTest ? 'btn-disabled' : ''}`}
                  onClick={handleTestVoice}
                  disabled={playingTest}
                >
                  {playingTest ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="1.2em"
                      height="1.2em"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                    </svg>
                  )}
                  Test Suara Mark
                </button>
                <p className="text-[10px] opacity-30 mt-1.5 px-1">
                  *Klik untuk mendengar suara Mark dengan settingan di atas tanpa perlu simpan dulu.
                </p>
              </div>
            </div>
          </section>

          {/* ── Telegram Bot Settings ── */}

          {!isFirstSetup && (
            <>
              <div className="divider"></div>

              {/* ── Memory & Data ── */}
              <section className="space-y-5">
                <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
                  Memory & Data
                </h2>

                {/* Chat History */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Chat History</p>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-soft btn-error btn-sm" onClick={handleClearAllChat}>
                      Hapus Semua Chat
                    </button>
                    <button className="btn btn-soft btn-info btn-sm" onClick={handleExportChat}>
                      Export Chat ke JSON
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          <div className="flex flex-col items-end pt-2">
            {isDownloadingModel && (
              <div className="w-full max-w-xs mb-4">
                <div className="flex justify-between text-xs mb-1">
                  <span>Mengunduh Model Embeddings...</span>
                  <span>{downloadProgress}%</span>
                </div>
                <progress
                  className="progress progress-primary w-full"
                  value={downloadProgress}
                  max="100"
                ></progress>
              </div>
            )}
            <button
              id="tour-save-btn"
              onClick={handleSaveConfiguration}
              disabled={isDownloadingModel}
              className="btn btn-primary px-8"
            >
              {isDownloadingModel
                ? 'Menyimpan...'
                : isFirstSetup
                  ? 'Simpan & Mulai Gunakan Mark'
                  : 'Simpan Pengaturan'}
            </button>
          </div>
        </div>

        <ModalComponent />
      </div>
    </div>
  )
}

export default Configuration
