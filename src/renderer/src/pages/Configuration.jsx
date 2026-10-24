import { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { ArrowLeft, Check, HelpCircle, Save } from 'lucide-react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import '../components/config/configuration.css'
import { API_BASE } from '../api/web-bridge'
import { useChat } from '../contexts/ChatContext'
import {
  AiEngineSection,
  CameraSection,
  ShortcutSection,
  VoiceSection,
  PermissionsSection
} from '../components/config'

const defaults = {
  personality: 'Santai layaknya seorang teman dan suka bercanda.',
  model: 'local-model',
  customModel: 'default-model',
  temperature: 0,
  ttsRate: 10,
  ttsPitch: 55,
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
  superEffortEnabled: false,
  bgOverlayOpacity: 65
}
const sections = {
  ai: {
    label: 'AI',
    title: 'Provider dan model',
    description:
      'Tentukan layanan AI yang digunakan Mark. Pengaturan model mengikuti provider yang Anda pilih.'
  },
  behavior: {
    label: 'Perilaku',
    title: 'Cara Mark berinteraksi',
    description: 'Sesuaikan gaya bicara, variasi jawaban, dan cara Mark membantu Anda.'
  },
  voice: {
    label: 'Suara',
    title: 'Input suara',
    description: 'Atur bahasa dan kata panggilan untuk berbicara dengan Mark melalui mikrofon.'
  },
  camera: {
    label: 'Kamera',
    title: 'Akses kamera',
    description: 'Pilih kamera yang digunakan Mark dan periksa tampilannya sebelum digunakan.'
  },
  shortcut: {
    label: 'Pintasan',
    title: 'Panggilan cepat',
    description: 'Tentukan kombinasi tombol untuk memanggil Mark tanpa membuka halaman utama.'
  },
  permissions: {
    label: 'Izin akses',
    title: 'Izin tersimpan',
    description:
      'Kelola folder, berkas, dan perintah yang sudah Anda izinkan tanpa konfirmasi berulang.'
  }
}

export default function Configuration({ isFirstSetup = false, onSetupComplete = null }) {
  const [config, setDraft] = useState(defaults)
  const [baseline, setBaseline] = useState(defaults)
  const [active, setActive] = useState('ai')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const mounted = useRef(false)
  const loadController = useRef(null)
  const savingRef = useRef(false)
  const tour = useRef(null)
  const chatContext = useChat()
  const dirty = JSON.stringify(config) !== JSON.stringify(baseline)
  const section = sections[active]
  const setConfig = (update) => {
    setNotice(null)
    setDraft(update)
  }

  const loadConfig = useCallback(async () => {
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch(`${API_BASE}/api/config`, { signal: controller.signal })
      if (!response.ok) throw new Error()
      const result = await response.json()
      if (result.success === false) throw new Error()
      const data = result.data ?? {}
      const value = {
        ...defaults,
        ...data,
        aiProvider: data.aiProvider || defaults.aiProvider,
        geminiWebModel: data.geminiWebModel || defaults.geminiWebModel
      }
      if (!mounted.current || controller.signal.aborted) return
      setConfig(value)
      setBaseline(value)
    } catch {
      if (mounted.current && !controller.signal.aborted)
        setLoadError('Pengaturan belum dapat dimuat.')
    } finally {
      if (mounted.current && !controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    loadConfig()
    return () => {
      mounted.current = false
      loadController.current?.abort()
      tour.current?.destroy()
    }
  }, [loadConfig])

  const showGuide = () => {
    tour.current?.destroy()
    tour.current = driver({
      showProgress: true,
      nextBtnText: 'Lanjut',
      prevBtnText: 'Kembali',
      doneBtnText: 'Selesai',
      steps: [
        {
          element: '#configuration-nav',
          popover: {
            title: 'Pengaturan menurut kebutuhan',
            description:
              'Pilih bagian untuk mengatur AI, perilaku, suara, kamera, pintasan, atau izin akses. Perubahan tetap tersimpan dalam formulir saat Anda berpindah bagian.'
          }
        },
        {
          element: '#configuration-content',
          popover: {
            title: 'Atur sebelum mulai',
            description:
              'Mulai dengan memilih provider AI. Jika menggunakan API sendiri, masukkan endpoint, ID model, dan API key yang diperlukan.'
          }
        },
        {
          element: '#tour-save-btn',
          popover: {
            title: 'Simpan perubahan',
            description:
              'Semua perubahan diterapkan setelah Anda menekan tombol Simpan. Anda juga dapat membatalkan perubahan yang belum disimpan.'
          }
        }
      ]
    })
    tour.current.drive()
  }

  const handleSave = async () => {
    if (savingRef.current || loading || loadError) return
    if (config.aiProvider === 'custom') {
      const endpoint = config.customEndpoint?.trim() || ''
      let valid = endpoint.endsWith('/chat/completions')
      try {
        valid = valid && ['http:', 'https:'].includes(new URL(endpoint).protocol)
      } catch {
        valid = false
      }
      if (!valid) {
        setActive('ai')
        setNotice({
          error: true,
          text: 'Gunakan URL endpoint HTTP atau HTTPS yang diakhiri dengan /chat/completions.'
        })
        requestAnimationFrame(() => document.getElementById('custom-endpoint')?.focus())
        return
      }
    }
    savingRef.current = true
    setSaving(true)
    setNotice(null)
    try {
      const changes = isFirstSetup
        ? { ...config }
        : Object.fromEntries(
            Object.entries(config).filter(
              ([key, value]) => JSON.stringify(value) !== JSON.stringify(baseline[key])
            )
          )
      if (changes.customEndpoint) changes.customEndpoint = changes.customEndpoint.trim()
      const response = await fetch(`${API_BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes)
      })
      if (!response.ok) throw new Error()
      const result = await response.json()
      if (result.success === false) throw new Error()
      const saved = { ...config, ...result.data }
      window.dispatchEvent(new CustomEvent('config-updated', { detail: saved }))
      chatContext.setConfig?.([saved])
      if (!mounted.current) return
      setConfig(saved)
      setBaseline(saved)
      setNotice({ text: 'Pengaturan tersimpan.' })
      if (isFirstSetup) onSetupComplete?.()
    } catch {
      if (mounted.current)
        setNotice({
          error: true,
          text: 'Pengaturan belum tersimpan. Periksa koneksi ke Mark, lalu coba lagi.'
        })
    } finally {
      savingRef.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return (
    <main className="flex h-screen flex-col bg-base-300 text-base-content">
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto w-full max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
          {!isFirstSetup && (
            <button
              type="button"
              onClick={() => window.history.back()}
              className="mb-10 inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white"
            >
              <ArrowLeft size={17} />
              Kembali
            </button>
          )}
          <header className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <h1 className="text-2xl font-semibold text-white">
                {isFirstSetup ? 'Selamat datang di Mark' : 'Pengaturan Mark'}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50">
                {isFirstSetup
                  ? 'Pilih provider AI untuk mulai menggunakan Mark. Pengaturan lainnya dapat disesuaikan nanti.'
                  : 'Sesuaikan AI, perangkat, dan cara Mark berinteraksi dengan Anda.'}
              </p>
            </div>
            <button
              type="button"
              disabled={loading || Boolean(loadError)}
              onClick={showGuide}
              className="btn btn-ghost btn-sm gap-2 rounded-full text-white/60"
            >
              <HelpCircle size={16} />
              Panduan
            </button>
          </header>
          <nav
            id="configuration-nav"
            aria-label="Bagian pengaturan"
            className="mt-8 flex flex-wrap gap-2 border-b border-white/10 pb-5"
          >
            {Object.entries(sections).map(([id, item]) => (
              <button
                key={id}
                type="button"
                aria-current={active === id ? 'page' : undefined}
                aria-controls="configuration-content"
                onClick={() => setActive(id)}
                className={`rounded-full px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${active === id ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          {loading ? (
            <div
              role="status"
              className="flex min-h-64 items-center justify-center gap-3 text-sm text-white/50"
            >
              <span className="loading loading-spinner loading-sm" />
              Memuat pengaturan…
            </div>
          ) : loadError ? (
            <div role="alert" className="py-10">
              <p className="text-sm text-error">
                Pengaturan belum dapat dimuat. Periksa koneksi ke Mark.
              </p>
              <button
                type="button"
                onClick={loadConfig}
                className="btn btn-ghost mt-4 rounded-full border-white/15"
              >
                Coba lagi
              </button>
            </div>
          ) : (
            <section
              id="configuration-content"
              aria-labelledby="configuration-section-title"
              className="grid gap-7 py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12"
            >
              <div>
                <h2
                  id="configuration-section-title"
                  className="text-base font-medium text-white/90"
                >
                  {section.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-white/50">{section.description}</p>
              </div>
              <fieldset disabled={saving} className="min-w-0 space-y-6 disabled:opacity-60">
                {(active === 'ai' || active === 'behavior') && (
                  <AiEngineSection
                    key={active}
                    section={active}
                    config={config}
                    setConfig={setConfig}
                  />
                )}
                {active === 'voice' && <VoiceSection config={config} setConfig={setConfig} />}
                {active === 'camera' && <CameraSection config={config} setConfig={setConfig} />}
                {active === 'shortcut' && <ShortcutSection config={config} setConfig={setConfig} />}
                {active === 'permissions' && (
                  <PermissionsSection config={config} setConfig={setConfig} />
                )}
              </fieldset>
            </section>
          )}
        </div>
      </div>
      <footer className="shrink-0 border-t border-white/10 bg-base-300">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <p
            role={notice?.error ? 'alert' : 'status'}
            aria-live="polite"
            className={`flex min-w-0 items-center gap-2 text-xs leading-relaxed ${notice?.error ? 'text-error' : 'text-white/50'}`}
          >
            {notice && !notice.error && <Check size={15} className="shrink-0 text-primary" />}
            {saving
              ? 'Menyimpan pengaturan…'
              : notice?.text ||
                (dirty
                  ? 'Ada perubahan yang belum disimpan.'
                  : 'Perubahan diterapkan setelah disimpan.')}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {dirty && (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setConfig(baseline)
                  setNotice(null)
                }}
                className="btn btn-ghost rounded-full text-sm text-white/60"
              >
                Batalkan
              </button>
            )}
            <button
              id="tour-save-btn"
              type="button"
              onClick={handleSave}
              disabled={loading || saving || Boolean(loadError) || (!dirty && !isFirstSetup)}
              className="btn rounded-full border-white bg-white px-5 text-sm text-neutral-900 hover:bg-white/90"
            >
              {saving ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Save size={16} />
              )}
              {isFirstSetup ? 'Simpan dan mulai' : 'Simpan perubahan'}
            </button>
          </div>
        </div>
      </footer>
    </main>
  )
}
Configuration.propTypes = { isFirstSetup: PropTypes.bool, onSetupComplete: PropTypes.func }
