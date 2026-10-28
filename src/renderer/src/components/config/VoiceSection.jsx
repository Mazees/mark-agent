import { ConfigField, ConfigToggle } from './ConfigFields'
import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { configProps, controlClass } from './configStyles'
import { useChat } from '../../contexts/ChatContext'

const wakeMessages = {
  starting: 'Menghubungkan pengenalan suara…',
  listening: 'Siap mendengarkan panggilan.',
  paused: 'Dijeda sementara saat mikrofon digunakan atau Mark berbicara.',
  disabled: 'Panggilan suara dinonaktifkan.',
  unavailable: 'Status tersedia setelah pengaturan awal selesai.',
  unsupported: 'Browser ini tidak mendukung pengenalan suara.',
  'not-allowed': 'Izin mikrofon ditolak. Izinkan mikrofon untuk Mark di browser.',
  'service-not-allowed': 'Layanan pengenalan suara diblokir oleh browser.',
  'audio-capture': 'Mikrofon tidak tersedia. Periksa perangkat dan izin mikrofon Windows.',
  network: 'Layanan pengenalan suara tidak dapat terhubung. Periksa koneksi internet.',
  error: 'Pengenalan suara belum dapat dimulai.'
}

export const VoiceSection = ({ config, setConfig }) => {
  const { wakeStatus } = useChat()
  const [error, setError] = useState('')
  const [opening, setOpening] = useState(false)
  const update = (key, value) => setConfig((previous) => ({ ...previous, [key]: value }))
  const openSoundSettings = async () => {
    setOpening(true)
    setError('')
    try {
      if (!window.api?.executeNativeTool) throw new Error()
      let result
      try {
        result = await window.api.executeNativeTool('open', 'ms-settings:sound')
      } catch {
        result = await window.api.executeNativeTool('run-powershell', 'start ms-settings:sound')
      }
      if (result?.success === false || result?.error) throw new Error()
    } catch {
      setError(
        'Pengaturan suara belum dapat dibuka. Buka Pengaturan Windows > Sistem > Suara untuk memilih mikrofon utama.'
      )
    } finally {
      setOpening(false)
    }
  }
  return (
    <div id="tour-tts" className="space-y-7">
      <div id="tour-wakeword">
        <ConfigToggle
          id="wake-enabled"
          label="Panggilan suara"
          description="Panggil Mark dengan suara saat aplikasi terbuka."
          checked={config.wakeWordEnabled !== false}
          onChange={(event) => update('wakeWordEnabled', event.target.checked)}
        />
        <div className="mb-5 mt-4 text-xs leading-relaxed text-white/60" role="status">
          {wakeMessages[wakeStatus] || wakeMessages.error}
          {!['starting', 'listening', 'paused', 'disabled', 'unavailable'].includes(wakeStatus) && (
            <button
              type="button"
              className="ml-2 text-primary underline underline-offset-2"
              onClick={() => window.dispatchEvent(new Event('mark:wake-retry'))}
            >
              Coba lagi
            </button>
          )}
        </div>
        <ConfigField
          id="wake-words"
          label="Kata panggilan tambahan"
          hint={
            'Panggilan bawaan: “Hey Mark”, “Halo Mark”, dan “Mark”. Pisahkan panggilan tambahan dengan koma.'
          }
        >
          <input
            id="wake-words"
            aria-describedby="wake-words-hint"
            className={`input ${controlClass}`}
            value={config.customWakeWords || ''}
            onChange={(event) => update('customWakeWords', event.target.value)}
            placeholder="Misalnya: Jarvis, Komputer"
          />
        </ConfigField>
      </div>
      <ConfigField
        id="speech-language"
        label="Bahasa input suara"
        hint="Pengenalan suara menggunakan layanan browser dan dapat mengirim audio melalui internet."
      >
        <select
          id="speech-language"
          aria-describedby="speech-language-hint"
          className={`select ${controlClass}`}
          value={config.speechLanguage || 'id-ID'}
          onChange={(event) => update('speechLanguage', event.target.value)}
        >
          <option value="id-ID">Bahasa Indonesia</option>
          <option value="en-US">English (United States)</option>
          <option value="jv-ID">Bahasa Jawa</option>
          <option value="su-ID">Bahasa Sunda</option>
        </select>
      </ConfigField>
      <div className="border-t border-white/10 pt-6">
        <h3 className="text-sm font-medium text-white/85">Mikrofon</h3>
        <p className="mt-2 text-xs leading-relaxed text-white/50">
          Mark mengikuti mikrofon utama Windows. Untuk menggunakan headset atau mikrofon USB, pilih
          perangkat tersebut di pengaturan suara Windows.
        </p>
        <button
          type="button"
          disabled={opening}
          onClick={openSoundSettings}
          className="btn btn-ghost mt-4 rounded-full border-white/15 text-sm"
        >
          <ExternalLink size={15} />
          {opening ? 'Membuka…' : 'Buka pengaturan suara'}
        </button>
        {error && (
          <p role="alert" className="mt-3 text-xs leading-relaxed text-error">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
VoiceSection.propTypes = configProps
