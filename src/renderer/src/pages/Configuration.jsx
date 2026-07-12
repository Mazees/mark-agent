import { useState, useEffect } from 'react'
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
import { getAllMemory, getAllConfig, saveConfiguration, deleteMemory, db } from '../api/db'
import { getExtractor } from '../api/vectorMemory'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useLocation } from 'react-router-dom'
import { useConfirm } from '../hooks/useConfirm'
import { useChat } from '../contexts/ChatContext'

const Configuration = ({ isFirstSetup = false, onSetupComplete = null }) => {
  const [config, setConfig] = useState({
    personality: 'Santai layaknya seorang teman dan suka bercanda.',
    model: 'google/gemma-3-4b',
    temperature: 0,
    context: 10,
    ttsRate: 0,
    ttsPitch: 0,
    groqApiKey: '',
    aiProvider: 'lm-studio',
    groqModel: 'llama-3.1-8b-instant',
    waAdminNumber: '',
    micDeviceId: 'default',
    awarenessEnabled: true
  })
  const [memories, setMemories] = useState([])
  const [audioDevices, setAudioDevices] = useState([])
  const [loadingMemory, setLoadingMemory] = useState(true)
  const [playingTest, setPlayingTest] = useState(false)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const { confirm, ModalComponent } = useConfirm()
  const chatContext = useChat()

  const [showGroqKey, setShowGroqKey] = useState(false)
  const [showCerebrasKey, setShowCerebrasKey] = useState(false)
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
      .getUserMedia({ audio: true })
      .then(() => {
        navigator.mediaDevices
          .enumerateDevices()
          .then((devices) => {
            const mics = devices.filter((d) => d.kind === 'audioinput')
            setAudioDevices(mics)
          })
          .catch((err) => console.error('Error enumerating devices', err))
      })
      .catch((err) => console.error('Mic permission denied', err))
  }, [])

  useEffect(() => {
    if (location.state?.highlightAdmin) {
      loadConfig()
      setTimeout(() => {
        const el = document.getElementById('tour-wa-admin')
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 500)
    }
  }, [location.state])

  useEffect(() => {
    if (window.api?.onWaAdminRequest) {
      window.api.onWaAdminRequest((data) => {
        // Langsung munculin ke UI tanpa nunggu reload
        setConfig((prev) => {
          const pending = prev.waPendingAdmins || []
          if (!pending.find((p) => p.id === data.id)) {
            return { ...prev, waPendingAdmins: [...pending, data] }
          }
          return prev
        })
      })
    }
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
              element: '#tour-wa-admin',
              popover: {
                title: '8. WhatsApp Admin (Penting!)',
                description:
                  'Untuk mendaftarkan Admin (agar bisa mengakses fitur khusus tertentu), buka WhatsApp lalu ketik perintah /register ke nomor bot ini. Nanti daftarnya akan muncul di sini untuk disetujui.',
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
        aiProvider: data[0].aiProvider || 'lm-studio',
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
    if (config.aiProvider === 'cerebras' && !config.cerebrasApiKey?.trim()) {
      await confirm({
        title: 'API Key Kosong',
        message: 'Tolong isi Cerebras API Key terlebih dahulu untuk menggunakan provider Cerebras!',
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
      
      // Load vision model if awareness is enabled
      if (config.awarenessEnabled !== false) {
        const { initVisionModel } = await import('../api/vision')
        let visStats = {}
        await initVisionModel((info) => {
          if (info.status === 'initiate') {
            visStats[info.file] = { loaded: 0, total: info.total || 0 }
          } else if (info.status === 'progress') {
            if (visStats[info.file]) {
              visStats[info.file].loaded = info.loaded
              visStats[info.file].total = info.total
            }
            const values = Object.values(visStats)
            const totalBytes = values.reduce((acc, curr) => acc + curr.total, 0)
            const loadedBytes = values.reduce((acc, curr) => acc + curr.loaded, 0)
            if (totalBytes > 0) {
              setDownloadProgress(Math.round((loadedBytes / totalBytes) * 100))
            }
          } else if (info.status === 'done' || info.status === 'ready') {
            setDownloadProgress(100)
          }
        })
      }
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

  return (
    <div className="h-screen bg-[var(--base-300)] text-white overflow-hidden relative font-['Poppins',sans-serif]">
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
                onClick={() => window.history.back()}
                className="btn btn-ghost btn-sm btn-circle"
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
            <div id="tour-ai-provider" className="space-y-1.5 p-2 -mx-2 rounded-lg">
              <p className="text-sm font-semibold">AI Provider</p>
              <div className="flex gap-4">
                <label className="label cursor-pointer justify-start gap-2">
                  <input
                    type="radio"
                    name="aiProvider"
                    className="radio radio-primary radio-sm"
                    value="lm-studio"
                    checked={config.aiProvider === 'lm-studio' || !config.aiProvider}
                    onChange={() => setConfig((prev) => ({ ...prev, aiProvider: 'lm-studio' }))}
                  />
                  <span className="label-text">LM Studio (Local)</span>
                </label>
                <label className="label cursor-pointer justify-start gap-2">
                  <input
                    type="radio"
                    name="aiProvider"
                    className="radio radio-primary radio-sm"
                    value="groq"
                    checked={config.aiProvider === 'groq'}
                    onChange={() => setConfig((prev) => ({ ...prev, aiProvider: 'groq' }))}
                  />
                  <span className="label-text">Groq API</span>
                </label>
                <label className="label cursor-pointer justify-start gap-2">
                  <input
                    type="radio"
                    name="aiProvider"
                    className="radio radio-primary radio-sm"
                    value="cerebras"
                    checked={config.aiProvider === 'cerebras'}
                    onChange={() => setConfig((prev) => ({ ...prev, aiProvider: 'cerebras' }))}
                  />
                  <span className="label-text">Cerebras API</span>
                </label>
                <label className="label cursor-pointer justify-start gap-2">
                  <input
                    type="radio"
                    name="aiProvider"
                    className="radio radio-primary radio-sm"
                    value="custom"
                    checked={config.aiProvider === 'custom'}
                    onChange={() => setConfig((prev) => ({ ...prev, aiProvider: 'custom' }))}
                  />
                  <span className="label-text">Custom API</span>
                </label>
              </div>
            </div>

            {config.aiProvider === 'lm-studio' || !config.aiProvider ? (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Model Selector (LM Studio)</p>
                <input
                  type="text"
                  placeholder="Contoh: google/gemma-3-4b"
                  className="input input-bordered w-full"
                  value={config.model || ''}
                  onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
                />
                <p className="text-xs opacity-40">
                  Nama model yang aktif di LM Studio. Pastikan sudah ter-load.
                </p>
              </div>
            ) : config.aiProvider === 'groq' ? (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Groq Model</p>
                <input
                  type="text"
                  placeholder="Contoh: llama-3.1-8b-instant"
                  className="input input-bordered w-full"
                  value={config.groqModel || 'llama-3.1-8b-instant'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, groqModel: e.target.value }))}
                />
                <p className="text-xs opacity-40">
                  Model Groq yang ingin digunakan. (Pastikan API Key Groq di bawah diisi).
                </p>
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
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, customEndpoint: e.target.value }))
                    }
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
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, customApiKey: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
                      onClick={() => setShowCustomKey(!showCustomKey)}
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
                <p className="text-sm font-semibold">Cerebras Model</p>
                <input
                  type="text"
                  placeholder="Contoh: llama3.1-8b"
                  className="input input-bordered w-full"
                  value={config.cerebrasModel || 'llama3.1-8b'}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, cerebrasModel: e.target.value }))
                  }
                />
                <p className="text-xs opacity-40">
                  Model Cerebras yang ingin digunakan. (Pastikan API Key Cerebras di bawah diisi).
                </p>
              </div>
            )}

            {/* Secondary Model Toggle */}
            {config.aiProvider === 'groq' && (
              <div className="space-y-1.5 pt-2">
                <label className="label cursor-pointer justify-start gap-2 max-w-fit">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary"
                    checked={config.useSecondaryModel || false}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, useSecondaryModel: e.target.checked }))
                    }
                  />
                  <span className="label-text text-sm">
                    Gunakan Model Ringan untuk Tugas Latar Belakang (Lebih Cepat)
                  </span>
                </label>

                {config.useSecondaryModel && (
                  <div className="pl-6 pt-1 mb-4 border-l-2 border-white/10 ml-2">
                    <p className="text-xs opacity-40 leading-relaxed">
                      Semua tugas belakang layar (action, parsing, merangkum) akan otomatis
                      dialihkan ke model <b>openai/gpt-oss-20b</b> via Groq API.
                    </p>
                  </div>
                )}
              </div>
            )}



            {/* Groq API Key (Always visible for STT) */}
            <div id="tour-groq-key" className="space-y-1.5 p-2 -mx-2 rounded-lg">
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold">
                  Groq API Key {config.aiProvider !== 'groq' && '(Khusus untuk fitur Voice/STT)'}
                </p>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-xs btn-outline btn-primary"
                >
                  Ambil API Key
                </a>
              </div>
              <div className="relative w-full">
                <input
                  type={showGroqKey ? 'text' : 'password'}
                  placeholder="Contoh: gsk_xxxxxxxxxxxxxxxxx"
                  className="input input-bordered w-full pr-10"
                  value={config.groqApiKey || ''}
                  onChange={(e) => setConfig((prev) => ({ ...prev, groqApiKey: e.target.value }))}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
                  onClick={() => setShowGroqKey(!showGroqKey)}
                  title={showGroqKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
                >
                  {showGroqKey ? (
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
              {config.aiProvider !== 'groq' && (
                <p className="text-xs opacity-40">
                  Karena kamu memakai{' '}
                  {config.aiProvider === 'lm-studio'
                    ? 'LM Studio'
                    : config.aiProvider === 'custom'
                      ? 'Custom API'
                      : 'Cerebras'}
                  , API Key Groq ini hanya akan dipakai saat kamu ngobrol via suara
                  (Speech-to-Text).
                </p>
              )}
            </div>

            {/* Cerebras API Key */}
            {config.aiProvider === 'cerebras' && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-semibold">Cerebras API Key</p>
                  <a
                    href="https://cloud.cerebras.ai/platform/org_5y4rkhf62v2mvwyvd6kwm9yx/get-started?onboarding=true"
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-xs btn-outline btn-primary"
                  >
                    Ambil API Key
                  </a>
                </div>
                <div className="relative w-full">
                  <input
                    type={showCerebrasKey ? 'text' : 'password'}
                    placeholder="Contoh: c-xxxxxxxxxxxxxxxxx"
                    className="input input-bordered w-full pr-10"
                    value={config.cerebrasApiKey || ''}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, cerebrasApiKey: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
                    onClick={() => setShowCerebrasKey(!showCerebrasKey)}
                    title={showCerebrasKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
                  >
                    {showCerebrasKey ? (
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
            )}

            {/* Awareness Engine Toggle */}
            <div className="space-y-1.5 p-2 -mx-2 rounded-lg bg-base-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Awareness Engine</p>
                  <p className="text-xs opacity-50 mt-1">Mengizinkan Mark membaca log sistem/aktivitas dan memulai obrolan secara proaktif di latar belakang.</p>
                </div>
                <input 
                  type="checkbox" 
                  className="toggle toggle-primary" 
                  checked={config.awarenessEnabled !== false}
                  onChange={(e) => setConfig((prev) => ({ ...prev, awarenessEnabled: e.target.checked }))}
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
                onChange={(e) => setConfig((prev) => ({ ...prev, personality: e.target.value }))}
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
                onChange={(e) => setConfig((prev) => ({ ...prev, temperature: e.target.value }))}
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
                onChange={(e) => setConfig((prev) => ({ ...prev, context: e.target.value }))}
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

            {/* TTS Settings */}
            <div id="tour-tts" className="space-y-6 p-2 -mx-2 rounded-lg">
              <h2 className="text-base font-bold uppercase tracking-wider opacity-70 mb-5">
                Audio & Voice Engine
              </h2>

              {/* Microphone Source Selection */}
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Mikrofon (Voice Input)</p>
                <select
                  className="select select-bordered w-full"
                  value={config.micDeviceId || 'default'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, micDeviceId: e.target.value }))}
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
                  onChange={(e) => setConfig((prev) => ({ ...prev, ttsRate: e.target.value }))}
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
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, ttsPitch: parseInt(e.target.value) }))
                  }
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

          <div className="divider"></div>

          {/* ── WhatsApp Settings ── */}
          <section id="tour-wa-admin" className="space-y-5 p-2 -mx-2 rounded-lg">
            <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
              WhatsApp Bot Settings
            </h2>

            {/* Pending Admin Requests */}
            {config.waPendingAdmins && config.waPendingAdmins.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-warning">Permintaan Akses Admin Baru</p>
                <div className="space-y-2">
                  {config.waPendingAdmins.map((admin, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-base-200 p-3 rounded-lg border border-warning/30"
                    >
                      <div>
                        <p className="font-bold text-sm">{admin.name}</p>
                        <p className="text-xs opacity-50">{admin.id}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-xs btn-success text-white"
                          onClick={async () => {
                            const currentAdmins = config.waAdminNumber
                              ? config.waAdminNumber.split(',').map((n) => n.trim())
                              : []
                            if (!currentAdmins.includes(admin.id)) {
                              currentAdmins.push(admin.id)
                            }
                            const newPending = config.waPendingAdmins.filter(
                              (p) => p.id !== admin.id
                            )
                            const newApproved = [...(config.waApprovedAdmins || []), admin]

                            const newConfig = {
                              ...config,
                              waAdminNumber: currentAdmins.join(', '),
                              waPendingAdmins: newPending,
                              waApprovedAdmins: newApproved
                            }

                            setConfig(newConfig)

                            // Simpan langsung ke DB biar gak usah nunggu tombol Save utama
                            const { saveConfiguration } = await import('../api/db')
                            await saveConfiguration(newConfig)
                            if (window.api && window.api.syncConfig) {
                              window.api.syncConfig(newConfig)
                            }

                            // Notify WA
                            if (window.api && window.api.sendWaMessage) {
                              window.api.sendWaMessage(
                                admin.jid,
                                `🎉 Selamat *${admin.name}*! Akses Admin kamu telah disetujui. Sekarang kamu bisa memiliki akses pada fitur khusus tertentu.`
                              )
                            }
                          }}
                        >
                          Setujui
                        </button>
                        <button
                          className="btn btn-xs btn-error text-white"
                          onClick={async () => {
                            const newPending = config.waPendingAdmins.filter(
                              (p) => p.id !== admin.id
                            )
                            const newConfig = { ...config, waPendingAdmins: newPending }

                            setConfig(newConfig)

                            // Simpan langsung ke DB
                            const { saveConfiguration } = await import('../api/db')
                            await saveConfiguration(newConfig)

                            if (window.api && window.api.sendWaMessage) {
                              window.api.sendWaMessage(
                                admin.jid,
                                `Maaf *${admin.name}*, permintaan akses Admin kamu ditolak oleh Owner.`
                              )
                            }
                          }}
                        >
                          Tolak
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 mt-4">
              <p className="text-sm font-semibold">Daftar Admin Aktif</p>
              {(!config.waAdminNumber || config.waAdminNumber.trim() === '') &&
              (!config.waApprovedAdmins || config.waApprovedAdmins.length === 0) ? (
                <div className="text-xs opacity-50 italic">
                  Belum ada admin yang terdaftar. Ketik /register di WA.
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Tampilkan data dari waApprovedAdmins (yang ada nama kontaknya) */}
                  {(config.waApprovedAdmins || []).map((admin, idx) => (
                    <div
                      key={`appr-${idx}`}
                      className="flex items-center justify-between bg-base-200 p-3 rounded-lg border border-success/30"
                    >
                      <div>
                        <p className="font-bold text-sm text-success">{admin.name}</p>
                        <p className="text-xs opacity-50">{admin.id}</p>
                      </div>
                      <button
                        onClick={async () => {
                          const currentAdmins = config.waAdminNumber
                            ? config.waAdminNumber
                                .split(',')
                                .map((n) => n.trim())
                                .filter(Boolean)
                            : []
                          const newAdmins = currentAdmins.filter((a) => a !== admin.id)
                          const newApproved = (config.waApprovedAdmins || []).filter(
                            (a) => a.id !== admin.id
                          )

                          const newConfig = {
                            ...config,
                            waAdminNumber: newAdmins.join(', '),
                            waApprovedAdmins: newApproved
                          }
                          setConfig(newConfig)

                          const { saveConfiguration } = await import('../api/db')
                          await saveConfiguration(newConfig)
                          if (window.api && window.api.syncConfig) {
                            window.api.syncConfig(newConfig)
                          }

                          if (window.api && window.api.sendWaMessage && admin.jid) {
                            window.api.sendWaMessage(
                              admin.jid,
                              `⚠️ *Pemberitahuan:* Akses Admin kamu telah dicabut oleh Owner.`
                            )
                          }
                        }}
                        className="btn btn-xs btn-error text-white"
                      >
                        Hapus
                      </button>
                    </div>
                  ))}

                  {/* Tampilkan data legacy dari waAdminNumber yang gak ada di waApprovedAdmins */}
                  {config.waAdminNumber &&
                    config.waAdminNumber.split(',').map((id, idx) => {
                      const cleanId = id.trim()
                      if (!cleanId) return null
                      const isAlreadyShown = (config.waApprovedAdmins || []).find(
                        (a) => a.id === cleanId
                      )
                      if (isAlreadyShown) return null

                      return (
                        <div
                          key={`leg-${idx}`}
                          className="flex items-center justify-between bg-base-200 p-3 rounded-lg border border-success/30"
                        >
                          <div>
                            <p className="font-bold text-sm text-success">Admin (Manual)</p>
                            <p className="text-xs opacity-50">{cleanId}</p>
                          </div>
                          <button
                            onClick={async () => {
                              const currentAdmins = config.waAdminNumber
                                .split(',')
                                .map((n) => n.trim())
                                .filter(Boolean)
                              const newAdmins = currentAdmins.filter((a) => a !== cleanId)

                              const newConfig = { ...config, waAdminNumber: newAdmins.join(', ') }
                              setConfig(newConfig)

                              const { saveConfiguration } = await import('../api/db')
                              await saveConfiguration(newConfig)
                              if (window.api && window.api.syncConfig) {
                                window.api.syncConfig(newConfig)
                              }

                              if (window.api && window.api.sendWaMessage) {
                                const guessedJid =
                                  cleanId.length > 14
                                    ? `${cleanId}@lid`
                                    : `${cleanId}@s.whatsapp.net`
                                window.api.sendWaMessage(
                                  guessedJid,
                                  `⚠️ *Pemberitahuan:* Akses Admin kamu telah dicabut oleh Owner. Kamu tidak bisa lagi mengakses fitur khusus tertentu.`
                                )
                              }
                            }}
                            className="btn btn-xs btn-error text-white"
                          >
                            Hapus
                          </button>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </section>

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
