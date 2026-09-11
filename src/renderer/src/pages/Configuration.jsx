import { useState, useEffect } from 'react'
import {
  getAllConfig,
  saveConfiguration
} from '../api/db'
import { getExtractor } from '../api/vectorMemory'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useConfirm } from '../hooks/useConfirm'
import { useChat } from '../contexts/ChatContext'
import {
  AiEngineSection,
  CameraSection,
  VisualSection,
  ShortcutSection,
  VoiceSection
} from '../components/config'

const Configuration = ({ isFirstSetup = false, onSetupComplete = null }) => {
  const [config, setConfig] = useState({
    personality: 'Santai layaknya seorang teman dan suka bercanda.',
    model: 'local-model',
    customModel: 'default-model',
    temperature: 0,
    context: 10,
    ttsRate: 0,
    ttsPitch: 0,
    aiProvider: 'gemini-web',
    geminiWebModel: 'gemini-3.6-flash',
    deepseekWebModel: 'deepseek-chat',
    deepseekUserToken: '',
    wakeWordEnabled: true,
    customWakeWords: '',
    speechLanguage: 'id-ID',
    tgBotToken: '',
    tgAdminIds: '',
    awarenessEnabled: true,
    cameraDeviceId: 'default',
    cameraEnabled: true,
    bgOverlayOpacity: 65
  })
  const [videoDevices, setVideoDevices] = useState([])
  const [playingTest, setPlayingTest] = useState(false)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const { ModalComponent } = useConfirm()
  const chatContext = useChat()

  const handleTestVoice = async () => {
    setPlayingTest(true)
    const testText =
      'Halo bro! Gue Mark, asisten pribadi lo. Gimana suara gue sekarang? Udah mantap belum?'
    try {
      const audioSrc = await window.api.textToSpeech(testText, config.ttsRate, config.ttsPitch)
      if (audioSrc) {
        const audio = new Audio(audioSrc)
        audio.onended = () => setPlayingTest(false)
        audio.onerror = () => setPlayingTest(false)
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

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        navigator.mediaDevices
          .enumerateDevices()
          .then((devices) => {
            const cameras = devices.filter((d) => d.kind === 'videoinput')
            setVideoDevices(cameras)
          })
          .catch((err) => console.error('Error enumerating devices', err))

        // Stop stream immediately since we just needed permission
        stream.getTracks().forEach((track) => track.stop())
      })
      .catch((err) => console.error('Cam permission denied', err))
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
                  'Kamu bisa milih mau pakai Gemini Gratis tanpa API Key, AI lokal (LM Studio), atau Custom API OpenAI-Compatible.',
                side: 'bottom',
                align: 'start'
              }
            },
            {
              element: '#tour-embed-provider',
              popover: {
                title: '2. Memori AI',
                description:
                  'Ini otak tempat Mark mengingat semuanya. Berjalan 100% lokal dengan vector embeddings tanpa setup tambahan.',
                side: 'top',
                align: 'start'
              }
            },
            {
              element: '#tour-wakeword',
              popover: {
                title: '3. Wake Word & Voice',
                description:
                  'Mark mendukung deteksi suara "Hey Mark / Mark" otomatis via Web Speech API bawaan Microsoft Edge / Chrome.',
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
      }, 500)
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
        deepseekWebModel: data[0].deepseekWebModel || 'deepseek-chat',
        deepseekUserToken: data[0].deepseekUserToken || '',
        micDeviceId: data[0].micDeviceId || 'default',
        awarenessEnabled: data[0].awarenessEnabled ?? true,
        bgOverlayOpacity: data[0].bgOverlayOpacity !== undefined ? Number(data[0].bgOverlayOpacity) : 65
      }))
    }
  }

  const handleSaveConfiguration = async () => {
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
      window.location.href = '#/'
    }
  }

  const handleBack = () => window.history.back()

  return (
    <div className="h-screen text-white overflow-hidden relative font-['Poppins',sans-serif] bg-base-300 rounded-xl border border-white/5 shadow-2xl">
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

          {/* 1. AI Engine & Tools */}
          <AiEngineSection config={config} setConfig={setConfig} />

          <div className="divider"></div>

          {/* 2. Camera Settings */}
          <CameraSection config={config} setConfig={setConfig} videoDevices={videoDevices} />

          <div className="divider"></div>

          {/* 3. Visual & Background Cosmos */}
          <VisualSection config={config} setConfig={setConfig} />

          <div className="divider"></div>

          {/* 4. Global Shortcut Settings */}
          <ShortcutSection config={config} setConfig={setConfig} />

          <div className="divider"></div>

          {/* 5. Voice & Wake Word Settings */}
          <VoiceSection
            config={config}
            setConfig={setConfig}
            playingTest={playingTest}
            handleTestVoice={handleTestVoice}
          />

          {/* 6. Save Bar */}
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
              className="btn btn-primary px-8 cursor-pointer"
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
