import { ConfigField, ConfigToggle } from './ConfigFields'
import GeminiConnection from './GeminiConnection'
import DeepSeekConnection from './DeepSeekConnection'
import { useState } from 'react'
import PropTypes from 'prop-types'
import { Eye, EyeOff } from 'lucide-react'
import { configProps, controlClass } from './configStyles'
import { DEFAULT_GEMINI_WEB_MODEL, GEMINI_WEB_MODELS } from '../../../../shared/gemini-models.js'

const geminiModels = Object.entries(GEMINI_WEB_MODELS)

export const AiEngineSection = ({ config, setConfig, section = 'ai' }) => {
  const [visible, setVisible] = useState(false)
  const update = (key, value) => setConfig((previous) => ({ ...previous, [key]: value }))
  const provider = config.aiProvider || 'gemini-web'
  const tokenField = 'customApiKey'
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
        <>
          <ConfigField
            id="gemini-model"
            label="Model Gemini"
            hint="Gemini Web menggunakan sesi gemini.google.com, tanpa API key. Input gambar belum didukung. Gemini 3.8 Flash dan Gemini 4 Argon memerlukan akun Google yang memiliki akses ke model tersebut. Menghubungkan akun saja tidak membuka akses model. Jika Google mengembalikan model berbeda, Mark menghentikan request dan menampilkan nama modelnya."
          >
            <select
              id="gemini-model"
              aria-describedby="gemini-model-hint"
              className={`select ${controlClass}`}
              value={config.geminiWebModel || DEFAULT_GEMINI_WEB_MODEL}
              onChange={(event) => update('geminiWebModel', event.target.value)}
            >
              {geminiModels.map(([model, data]) => (
                <option key={model} value={model}>
                  {data.label}
                </option>
              ))}
            </select>
          </ConfigField>
          <GeminiConnection />
        </>
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
      {provider === 'custom' && (
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
      {provider === 'deepseek-web' && <DeepSeekConnection />}
    </div>
  )
}
AiEngineSection.propTypes = { ...configProps, section: PropTypes.oneOf(['ai', 'behavior']) }
