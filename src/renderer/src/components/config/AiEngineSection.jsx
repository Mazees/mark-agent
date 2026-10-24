import { ConfigField, ConfigToggle } from './ConfigFields'
import { useState } from 'react'
import PropTypes from 'prop-types'
import { Eye, EyeOff } from 'lucide-react'
import { configProps, controlClass } from './configStyles'

const geminiModels = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-thinking',
  'gemini-3.5-flash-thinking-lite',
  'gemini-auto',
  'gemini-flash-lite'
]

export const AiEngineSection = ({ config, setConfig, section = 'ai' }) => {
  const [visible, setVisible] = useState(false)
  const [clipboardNotice, setClipboardNotice] = useState('')
  const update = (key, value) => setConfig((previous) => ({ ...previous, [key]: value }))
  const provider = config.aiProvider || 'gemini-web'
  const tokenField = provider === 'deepseek-web' ? 'deepseekUserToken' : 'customApiKey'
  const invalidEndpoint = Boolean(
    config.customEndpoint && !config.customEndpoint.trim().endsWith('/chat/completions')
  )

  if (section === 'behavior')
    return (
      <div className="space-y-8">
        <div id="tour-persona">
          <ConfigField
            id="personality"
            label="Gaya bicara dan kepribadian"
            hint="Jelaskan cara Anda ingin Mark menjawab, termasuk bahasa dan tingkat formalitasnya."
          >
            <textarea
              id="personality"
              aria-describedby="personality-hint"
              className={`textarea min-h-36 resize-y leading-relaxed ${controlClass}`}
              value={config.personality || ''}
              onChange={(event) => update('personality', event.target.value)}
            />
          </ConfigField>
        </div>
        <div id="tour-temperature">
          <ConfigField
            id="temperature"
            label="Kreativitas jawaban"
            hint="Nilai rendah membuat jawaban lebih konsisten. Nilai tinggi memberi lebih banyak variasi."
          >
            <div className="flex items-center gap-5 py-2">
              <input
                id="temperature"
                aria-describedby="temperature-hint"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.temperature ?? 0}
                className="range range-primary range-xs flex-1"
                onChange={(event) => update('temperature', Number(event.target.value))}
              />
              <output
                htmlFor="temperature"
                className="w-8 text-right text-sm tabular-nums text-white/75"
              >
                {Number(config.temperature || 0).toFixed(1)}
              </output>
            </div>
          </ConfigField>
        </div>
        <div className="border-t border-white/10 pt-6">
          <ConfigToggle
            id="awareness"
            label="Awareness Engine"
            description="Izinkan Mark membaca aktivitas sistem dan memulai percakapan berdasarkan aktivitas Anda."
            checked={config.awarenessEnabled !== false}
            onChange={(event) => update('awarenessEnabled', event.target.checked)}
          />
          <ConfigToggle
            id="super-effort"
            label="Super Effort"
            description="Minta Mark melanjutkan pekerjaan hingga selesai dan memeriksa hasilnya melalui tool yang tersedia."
            checked={Boolean(config.superEffortEnabled)}
            onChange={(event) => update('superEffortEnabled', event.target.checked)}
          />
        </div>
      </div>
    )

  return (
    <div className="space-y-6">
      <div id="tour-ai-provider">
        <ConfigField
          id="ai-provider"
          label="Provider AI"
          hint="Pilih layanan yang digunakan Mark untuk menjawab dan menjalankan tugas."
        >
          <select
            id="ai-provider"
            aria-describedby="ai-provider-hint"
            className={`select ${controlClass}`}
            value={provider}
            onChange={(event) => {
              update('aiProvider', event.target.value)
              setVisible(false)
              setClipboardNotice('')
            }}
          >
            <option value="gemini-web">Gemini Web</option>
            <option value="deepseek-web">DeepSeek Web</option>
            <option value="custom">Custom API (OpenAI-compatible)</option>
            <option value="lm-studio">LM Studio (lokal)</option>
          </select>
        </ConfigField>
      </div>
      {provider === 'gemini-web' && (
        <ConfigField
          id="gemini-model"
          label="Model Gemini"
          hint="Tidak memerlukan API key. Koneksi internet diperlukan; input gambar belum didukung oleh provider ini."
        >
          <select
            id="gemini-model"
            aria-describedby="gemini-model-hint"
            className={`select ${controlClass}`}
            value={config.geminiWebModel || geminiModels[0]}
            onChange={(event) => update('geminiWebModel', event.target.value)}
          >
            {geminiModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </ConfigField>
      )}
      {provider === 'lm-studio' && (
        <ConfigField
          id="local-model"
          label="Model di LM Studio"
          hint="Gunakan nama model yang sudah dimuat di server lokal LM Studio."
        >
          <input
            id="local-model"
            aria-describedby="local-model-hint"
            className={`input ${controlClass}`}
            value={config.model || ''}
            onChange={(event) => update('model', event.target.value)}
            placeholder="Nama model lokal"
          />
        </ConfigField>
      )}
      {provider === 'custom' && (
        <>
          <ConfigField
            id="custom-endpoint"
            label="URL endpoint"
            hint={
              invalidEndpoint
                ? 'URL harus diakhiri dengan /chat/completions.'
                : 'Gunakan endpoint yang mendukung format OpenAI-compatible, diakhiri dengan /chat/completions.'
            }
          >
            <input
              id="custom-endpoint"
              type="url"
              aria-invalid={invalidEndpoint}
              aria-describedby="custom-endpoint-hint"
              className={`input ${controlClass} ${invalidEndpoint ? 'border-error' : ''}`}
              value={config.customEndpoint || ''}
              onChange={(event) => update('customEndpoint', event.target.value)}
              placeholder="http://localhost:1234/v1/chat/completions"
              spellCheck={false}
            />
          </ConfigField>
          <ConfigField id="custom-model" label="ID model">
            <input
              id="custom-model"
              className={`input ${controlClass}`}
              value={config.customModel || ''}
              onChange={(event) => update('customModel', event.target.value)}
            />
          </ConfigField>
        </>
      )}
      {(provider === 'custom' || provider === 'deepseek-web') && (
        <ConfigField
          id="provider-secret"
          label={provider === 'custom' ? 'API key' : 'User token DeepSeek'}
          hint={
            provider === 'custom'
              ? 'Isi jika layanan Anda memerlukan API key.'
              : 'Token digunakan untuk mengakses sesi akun DeepSeek Anda.'
          }
        >
          <div className="relative">
            <input
              id="provider-secret"
              aria-describedby="provider-secret-hint"
              type={visible ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              className={`input pr-12 ${controlClass}`}
              value={config[tokenField] || ''}
              onChange={(event) => update(tokenField, event.target.value)}
            />
            <button
              type="button"
              aria-label={visible ? 'Sembunyikan kredensial' : 'Tampilkan kredensial'}
              aria-pressed={visible}
              onClick={() => setVisible((value) => !value)}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
            >
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </ConfigField>
      )}
      {provider === 'deepseek-web' && (
        <>
          <p className="border-l-2 border-warning/60 pl-4 text-xs leading-relaxed text-white/60">
            Integrasi ini menggunakan sesi web, bukan API resmi DeepSeek. Penggunaannya dapat
            menyebabkan pembatasan akun.
          </p>
          <details className="rounded-xl border border-white/10 p-4 text-xs text-white/65">
            <summary className="cursor-pointer text-sm text-white/80">
              Cara mendapatkan user token
            </summary>
            <ol className="mt-4 list-decimal space-y-3 pl-5 leading-relaxed">
              <li>
                Masuk ke{' '}
                <a
                  className="underline underline-offset-4"
                  href="https://chat.deepseek.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  chat.deepseek.com
                </a>{' '}
                melalui browser.
              </li>
              <li>Tekan F12, buka tab Console, lalu jalankan kode berikut.</li>
            </ol>
            <code className="my-4 block overflow-x-auto rounded-lg bg-white/5 p-3">
              {"JSON.parse(localStorage.getItem('userToken')).value"}
            </code>
            <p>Salin token yang muncul, lalu tempelkan pada kolom di atas.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-ghost btn-sm rounded-full border-white/15"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      "JSON.parse(localStorage.getItem('userToken')).value"
                    )
                    setClipboardNotice('Kode disalin.')
                  } catch {
                    setClipboardNotice('Kode belum dapat disalin. Silakan salin secara manual.')
                  }
                }}
              >
                Salin kode
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm rounded-full border-white/15"
                onClick={async () => {
                  try {
                    update('deepseekUserToken', (await navigator.clipboard.readText()).trim())
                    setClipboardNotice('Token ditempelkan.')
                  } catch {
                    setClipboardNotice(
                      'Clipboard belum dapat dibaca. Silakan tempelkan token secara manual.'
                    )
                  }
                }}
              >
                Tempel token
              </button>
            </div>
            <p role="status" className="mt-3">
              {clipboardNotice}
            </p>
          </details>
        </>
      )}
    </div>
  )
}
AiEngineSection.propTypes = { ...configProps, section: PropTypes.oneOf(['ai', 'behavior']) }
