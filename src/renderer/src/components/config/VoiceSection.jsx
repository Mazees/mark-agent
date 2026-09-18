export const VoiceSection = ({ config, setConfig }) => {
  const handleCustomWakeWordsChange = (e) =>
    setConfig((prev) => ({ ...prev, customWakeWords: e.target.value }))

  const handleSpeechLanguageChange = (e) =>
    setConfig((prev) => ({ ...prev, speechLanguage: e.target.value }))

  const openSoundSettings = async () => {
    if (window.api && window.api.osOpen) {
      try {
        await window.api.osOpen('ms-settings:sound')
      } catch (_) {
        if (window.api.executeNativeTool) {
          await window.api.executeNativeTool('run-powershell', 'start ms-settings:sound')
        }
      }
    } else if (window.api && window.api.executeNativeTool) {
      await window.api.executeNativeTool('run-powershell', 'start ms-settings:sound')
    }
  }

  return (
    <div id="tour-tts" className="space-y-6 p-2 -mx-2 rounded-lg">
      <h2 className="text-base font-bold uppercase tracking-wider opacity-70 mb-5">
        Audio & Voice Engine
      </h2>

      {/* Custom Wake Words Input */}
      <div id="tour-wakeword" className="space-y-2">
        <div className="flex justify-between items-end">
          <p className="text-sm font-semibold">Kata Pemicu Kustom (Custom Wake Words)</p>
          <span className="text-[10px] opacity-50">Fitur Bawaan Aktif</span>
        </div>
        <input
          type="text"
          placeholder="Contoh: Jarvis, Komputer, Bro"
          className="input input-bordered w-full"
          value={config.customWakeWords || ''}
          onChange={handleCustomWakeWordsChange}
        />
        <p className="text-xs opacity-50">
          Pola bawaan seperti <strong>"Hey Mark"</strong>, <strong>"Halo Mark"</strong>, dan{' '}
          <strong>"Mark"</strong> sudah aktif otomatis di latar belakang. Masukkan kata atau
          nama panggilan tambahan di atas (pisahkan dengan koma).
        </p>
      </div>

      {/* Speech Recognition Language */}
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">Bahasa Input Suara</p>
        <select
          className="select select-bordered w-full"
          value={config.speechLanguage || 'id-ID'}
          onChange={handleSpeechLanguageChange}
        >
          <option value="id-ID">Bahasa Indonesia (id-ID)</option>
          <option value="en-US">English - United States (en-US)</option>
          <option value="jv-ID">Bahasa Jawa (jv-ID)</option>
          <option value="su-ID">Bahasa Sunda (su-ID)</option>
        </select>
        <p className="text-xs opacity-40">
          Pilih bahasa utama yang kamu gunakan saat berbicara dengan Mark.
        </p>
      </div>

      {/* Microphone Information & OS Shortcut */}
      <div className="space-y-2.5 p-3.5 bg-base-200/50 rounded-xl border border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
            <p className="text-sm font-semibold">Perangkat Mikrofon</p>
          </div>
          <button
            type="button"
            onClick={openSoundSettings}
            className="btn btn-xs btn-primary gap-1.5 shadow-sm"
            title="Buka Pengaturan Suara Windows untuk memilih Mikrofon Utama"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span>Ganti Mikrofon di Windows</span>
          </button>
        </div>

        <p className="font-medium text-xs text-white/90">
          Mark otomatis menggunakan{' '}
          <strong>mikrofon utama (default) laptop atau PC kamu</strong>.
        </p>
        <p className="text-xs opacity-50">
          Kalau kamu punya mikrofon eksternal (seperti headset atau mic USB) dan ingin
          menggunakannya, klik tombol <em>"Ganti Mikrofon di Windows"</em> di atas lalu
          pilih mikrofon tersebut sebagai perangkat utama.
        </p>
      </div>
    </div>
  )
}
