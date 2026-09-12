import { useState } from 'react'
import { FaCog } from 'react-icons/fa'
import { AlertTriangle } from 'lucide-react'

export const AiEngineSection = ({ config, setConfig }) => {
  const [showCustomKey, setShowCustomKey] = useState(false)
  const [showDeepseekToken, setShowDeepseekToken] = useState(false)

  const handleAiProviderChange = (provider) =>
    setConfig((prev) => ({ ...prev, aiProvider: provider }))

  const handleModelChange = (e) => setConfig((prev) => ({ ...prev, model: e.target.value }))

  const handleCustomEndpointChange = (e) =>
    setConfig((prev) => ({ ...prev, customEndpoint: e.target.value }))

  const handleCustomApiKeyChange = (e) =>
    setConfig((prev) => ({ ...prev, customApiKey: e.target.value }))

  const handleAwarenessEnabledChange = (e) =>
    setConfig((prev) => ({ ...prev, awarenessEnabled: e.target.checked }))

  const handlePersonalityChange = (e) =>
    setConfig((prev) => ({ ...prev, personality: e.target.value }))

  const handleTemperatureChange = (e) =>
    setConfig((prev) => ({ ...prev, temperature: e.target.value }))

  return (
    <section className="space-y-5">
      <h2 className="text-base font-bold uppercase tracking-wider opacity-70">AI Engine & Tools</h2>

      {/* AI Provider Selector */}
      <div id="tour-ai-provider" className="space-y-1.5">
        <p className="text-sm font-semibold">AI Provider</p>
        <select
          className="select select-bordered w-full font-medium"
          value={config.aiProvider || 'gemini-web'}
          onChange={(e) => handleAiProviderChange(e.target.value)}
        >
          <option value="gemini-web">Gemini Web (Gratis)</option>
          <option value="deepseek-web">DeepSeek Web (Gratis)</option>
          <option value="custom">Custom API (OpenAI-Compatible)</option>
          <option value="lm-studio">LM Studio (Local Offline)</option>
        </select>
      </div>

      {config.aiProvider === 'deepseek-web' ? (
        <div className="space-y-4">
          {/* Risk Warning Notice */}
          <div className="p-3 bg-warning/10 border border-warning/30 rounded-xl text-warning text-xs flex items-start gap-2.5 leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
            <div>
              <p className="font-semibold text-warning">Peringatan Risiko:</p>
              <p className="text-white/80 mt-0.5">
                Provider ini menggunakan sesi web/OAuth yang tidak dilisensikan secara resmi untuk
                penggunaan proxy/router pihak ketiga. Akun dapat dibatasi atau diblokir (banned)
                sementara oleh DeepSeek. Gunakan atas risiko sendiri.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <p className="text-sm font-semibold">DeepSeek User Token (Bearer)</p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText()
                    if (text) setConfig((prev) => ({ ...prev, deepseekUserToken: text.trim() }))
                  } catch (_) {}
                }}
                className="text-xs text-primary hover:underline cursor-pointer"
              >
                Paste dari Clipboard
              </button>
            </div>
            <div className="relative w-full">
              <input
                type={showDeepseekToken ? 'text' : 'password'}
                placeholder="eyJhbGciOi..."
                className="input input-bordered w-full font-mono text-xs pr-10"
                value={config.deepseekUserToken || ''}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, deepseekUserToken: e.target.value }))
                }
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 cursor-pointer"
                onClick={() => setShowDeepseekToken(!showDeepseekToken)}
                title={showDeepseekToken ? 'Sembunyikan Token' : 'Tampilkan Token'}
              >
                {showDeepseekToken ? (
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

            {/* Panduan Cara Mendapatkan Token */}
            <div className="p-3 bg-base-200/60 rounded-xl border border-white/5 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-primary">
                <FaCog className="w-3.5 h-3.5" />
                <span>Cara Mendapatkan User Token DeepSeek:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-white/70">
                <li>
                  Buka dan login ke akunmu di{' '}
                  <a
                    href="https://chat.deepseek.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    chat.deepseek.com
                  </a>{' '}
                  di browser.
                </li>
                <li>
                  Tekan tombol keyboard <strong>F12</strong> (atau klik kanan &gt; Inspect) lalu
                  buka tab <strong>Console</strong>.
                </li>
                <li>Copy dan paste baris kode berikut ke dalam Console lalu tekan Enter:</li>
              </ol>
              <div className="flex items-center justify-between bg-black/50 p-2 rounded-lg border border-white/10 font-mono text-[11px] text-success">
                <code className="truncate mr-2">
                  JSON.parse(localStorage.getItem('userToken')).value
                </code>
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      "JSON.parse(localStorage.getItem('userToken')).value"
                    )
                  }
                  className="btn btn-xs btn-ghost text-white/50 hover:text-white shrink-0"
                  title="Salin snippet"
                >
                  Salin Kode
                </button>
              </div>
              <p className="text-[11px] text-white/40">
                Salin nilai token yang muncul (tanpa tanda kutip), lalu tempelkan ke kolom input di
                atas. Token ini otomatis memecahkan challenge anti-bot WASM DeepSeek secara lokal!
              </p>
            </div>
          </div>
        </div>
      ) : config.aiProvider === 'gemini-web' || !config.aiProvider ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Model Gemini</p>
            <select
              className="select select-bordered w-full"
              value={config.geminiWebModel || 'gemini-3.6-flash'}
              onChange={(e) => setConfig((prev) => ({ ...prev, geminiWebModel: e.target.value }))}
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
              Provider bawaan tanpa API Key. Membutuhkan koneksi internet (tidak mendukung input
              gambar).
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
              onChange={(e) => setConfig((prev) => ({ ...prev, customModel: e.target.value }))}
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
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 cursor-pointer"
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
              Mengizinkan Mark membaca log sistem/aktivitas dan memulai obrolan secara proaktif di
              latar belakang.
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

      {/* Temperature Slider */}
      <div id="tour-temperature" className="space-y-2 p-2 -mx-2 rounded-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Temperature</p>
          <span className="font-mono text-sm text-primary font-bold">{config.temperature}</span>
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
    </section>
  )
}
