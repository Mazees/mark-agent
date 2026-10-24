import { useCallback, useEffect, useState } from 'react'
import { Save, Unplug } from 'lucide-react'
import { getAllConfig, saveConfiguration } from '../api/db'
import { webApi } from '../api/web-bridge'

export default function TelegramAddonDetail() {
  const [status, setStatus] = useState('checking')
  const [token, setToken] = useState('')
  const [adminIds, setAdminIds] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const refreshStatus = useCallback(async () => {
    const result = await webApi.tgGetStatus()
    if (!result?.success || !result.status) {
      setStatus('error')
      setError(result?.error || 'Status koneksi Telegram tidak tersedia.')
      return
    }
    setStatus(result.status)
  }, [])

  useEffect(() => {
    let active = true
    getAllConfig()
      .then((configs) => {
        if (!active) return
        setToken(configs[0]?.tgBotToken || '')
        setAdminIds(configs[0]?.tgAdminIds || '')
      })
      .catch(() => {
        if (active) setError('Pengaturan Telegram gagal dimuat.')
      })
    refreshStatus()
    const unsubscribe = webApi.onTgConnection((nextStatus) => setStatus(nextStatus))
    return () => {
      active = false
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [refreshStatus])

  const saveAndConnect = async (event) => {
    event.preventDefault()
    const cleanToken = token.trim()
    if (!cleanToken) {
      setError('Masukkan Telegram Bot Token terlebih dahulu.')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      const configs = await getAllConfig()
      const nextConfig = {
        ...(configs[0] || {}),
        tgBotToken: cleanToken,
        tgAdminIds: adminIds.trim()
      }
      await saveConfiguration(nextConfig)
      await webApi.syncConfig(nextConfig)
      const result = await webApi.tgStart(cleanToken)
      if (!result?.success) throw new Error(result?.error || 'Bot Telegram gagal dihubungkan.')
      await refreshStatus()
      window.dispatchEvent(new Event('mark-addon-status-changed'))
    } catch (connectionError) {
      setError(connectionError.message || 'Pengaturan Telegram gagal disimpan.')
    } finally {
      setIsSaving(false)
    }
  }

  const disconnect = async () => {
    setIsSaving(true)
    setError('')
    try {
      const result = await webApi.tgStop()
      if (!result?.success) throw new Error(result?.error || 'Bot Telegram gagal diputus.')
      await refreshStatus()
      window.dispatchEvent(new Event('mark-addon-status-changed'))
    } catch (connectionError) {
      setError(connectionError.message || 'Bot Telegram gagal diputus.')
    } finally {
      setIsSaving(false)
    }
  }

  const connected = status === 'connected'

  return (
    <section className="rounded-xl border border-white/10 bg-base-200/70 p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h2 className="text-base font-medium text-white">Status koneksi</h2>
          <p className="mt-1 text-sm text-white/50">
            {status === 'checking'
              ? 'Memeriksa koneksi bot.'
              : status === 'error'
                ? 'Status koneksi tidak tersedia.'
                : connected
                  ? 'Bot Telegram terhubung ke Mark.'
                  : status === 'connecting'
                    ? 'Bot sedang menghubungkan diri.'
                    : 'Bot Telegram belum terhubung.'}
          </p>
        </div>
        <span
          className={`text-sm ${connected ? 'text-primary' : status === 'error' ? 'text-error' : 'text-white/50'}`}
        >
          {status === 'checking'
            ? 'Memeriksa'
            : status === 'error'
              ? 'Tidak tersedia'
              : status === 'connecting'
                ? 'Menghubungkan'
                : connected
                  ? 'Terhubung'
                  : 'Terputus'}
        </span>
      </div>

      <form onSubmit={saveAndConnect} className="space-y-5 pt-5">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white/80">Telegram Bot Token</span>
          <input
            type="password"
            autoComplete="new-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Token dari @BotFather"
            className="input input-bordered w-full font-mono text-sm"
          />
          <span className="mt-2 block text-xs leading-relaxed text-white/45">
            Token disimpan di konfigurasi lokal Mark dan tidak ditampilkan ke AI.
          </span>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white/80">
            Username admin Telegram
          </span>
          <input
            type="text"
            value={adminIds}
            onChange={(event) => setAdminIds(event.target.value)}
            placeholder="@username1, @username2"
            className="input input-bordered w-full text-sm"
          />
          <span className="mt-2 block text-xs leading-relaxed text-white/45">
            Pisahkan beberapa username dengan koma. Hanya admin terdaftar yang dapat mengontrol Mark
            lewat bot.
          </span>
        </label>
        <p className="text-xs leading-relaxed text-white/45">
          Kirim /start ke bot setidaknya sekali agar Mark dapat membalas dan mengirim notifikasi ke
          akunmu.
        </p>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={isSaving || status === 'connecting'}
            className="btn btn-primary rounded-full px-5"
          >
            <Save size={16} />{' '}
            {isSaving
              ? 'Menyimpan...'
              : connected
                ? 'Simpan & hubungkan ulang'
                : 'Simpan & hubungkan'}
          </button>
          {connected && (
            <button
              type="button"
              onClick={disconnect}
              disabled={isSaving}
              className="btn btn-outline rounded-full border-error/40 text-error hover:bg-error/10"
            >
              <Unplug size={16} /> Putuskan koneksi
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
