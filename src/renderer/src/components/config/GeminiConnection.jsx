import providerIcon from '../../assets/providers/gemini.png'
import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE } from '../../api/web-bridge'

const labels = {
  disconnected: 'Belum terhubung',
  waiting_login: 'Menunggu login Google',
  checking_session: 'Memeriksa sesi Google',
  connected: 'Terhubung',
  saved: 'Sesi Google tersimpan',
  expired: 'Perlu login ulang',
  failed: 'Koneksi bermasalah'
}
export default function GeminiConnection() {
  const [state, setState] = useState({ status: 'loading', connected: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(false)
  const pending = useRef(false)
  const sequence = useRef({ value: 0 })
  const request = useCallback(async (action = 'status', method = 'GET') => {
    const id = ++sequence.current.value
    const response = await fetch(`${API_BASE}/api/providers/gemini-web/auth/${action}`, { method })
    const result = await response.json()
    if (!response.ok || !result.success)
      throw new Error(result.error || 'Status koneksi Gemini belum dapat dimuat.')
    if (mounted.current && id === sequence.current.value) setState(result.data)
  }, [])
  useEffect(() => {
    const currentSequence = sequence.current
    mounted.current = true
    request().catch((error) => {
      if (mounted.current) setError(error.message)
    })
    return () => {
      mounted.current = false
      currentSequence.value++
    }
  }, [request])
  useEffect(() => {
    if (!['waiting_login', 'checking_session'].includes(state.status)) return
    const timer = setInterval(
      () =>
        request().catch((error) => {
          if (mounted.current) setError(error.message)
        }),
      2000
    )
    return () => clearInterval(timer)
  }, [state.status, request])
  const act = async (action, method) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await request(action, method)
    } catch (error) {
      if (mounted.current) setError(error.message)
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <div className="space-y-3 rounded-xl border border-white/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={providerIcon}
            alt=""
            aria-hidden="true"
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-lg object-contain"
          />
          <div>
            <h3 className="text-sm font-medium text-white/85">Akun Google</h3>
            <p role="status" aria-live="polite" className="mt-1 text-xs text-white/55">
              {labels[state.status] || 'Memuat koneksi…'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || ['waiting_login', 'checking_session'].includes(state.status)}
            onClick={() => act('connect', 'POST')}
            className="btn btn-sm rounded-full border-white/15 text-xs"
          >
            {busy || ['waiting_login', 'checking_session'].includes(state.status) ? (
              <span aria-hidden="true" className="loading loading-spinner loading-xs" />
            ) : null}
            {state.connected ? 'Hubungkan ulang' : 'Hubungkan akun Google'}
          </button>
          {(state.connected ||
            state.status === 'waiting_login' ||
            state.status === 'checking_session' ||
            state.status === 'expired' ||
            state.status === 'failed') && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act('disconnect', 'DELETE')}
              className="btn btn-ghost btn-sm rounded-full text-xs"
            >
              {['waiting_login', 'checking_session'].includes(state.status)
                ? 'Batalkan'
                : 'Putuskan'}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-white/50">
        Masuk melalui jendela browser yang dibuka Mark. Setelah halaman Gemini dapat digunakan,
        tutup seluruh jendela login tersebut agar Mark memeriksa dan menyimpan sesinya. Anda tidak
        perlu menyalin cookie atau membuat API key. Koneksi akun langsung tersimpan; pilihan model
        diterapkan melalui tombol Simpan.
      </p>
      {state.status === 'waiting_login' && (
        <p className="text-xs leading-relaxed text-white/65">
          Selesaikan login dan verifikasi Google sampai halaman Gemini terbuka, lalu tutup jendela
          tersebut. Selama login, Mark tidak menghubungkan debugger atau mengendalikan halaman.
        </p>
      )}
      {(error || state.error) && (
        <p role="alert" className="text-xs leading-relaxed text-error">
          {error || state.error}
        </p>
      )}
    </div>
  )
}
