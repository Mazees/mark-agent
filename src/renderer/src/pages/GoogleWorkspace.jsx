import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Files, Mail, Plus, Unplug } from 'lucide-react'
import { webApi } from '../api/web-bridge'
import AddonDetail from './AddonDetail'
import { getAddon } from '../api/addonRegistry'

const features = [
  {
    icon: Files,
    name: 'Google Drive',
    description: 'Cari, baca, dan kelola file yang kamu perlukan.'
  },
  {
    icon: CalendarDays,
    name: 'Google Calendar',
    description: 'Lihat agenda dan buat jadwal melalui percakapan.'
  },
  { icon: Mail, name: 'Gmail', description: 'Cari email, baca pesan, dan bantu kirim balasan.' }
]
export default function GoogleWorkspace() {
  const navigate = useNavigate()
  const [connectionStatus, setConnectionStatus] = useState('checking')
  const [connectionError, setConnectionError] = useState('')
  const [isUninstalling, setIsUninstalling] = useState(false)
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false)
  const uninstallDialogRef = useRef(null)
  const draft = (composerDraft) => navigate('/chat', { state: { composerDraft } })

  const refreshConnectionStatus = useCallback(async () => {
    setConnectionStatus('checking')
    setConnectionError('')
    try {
      const result = await webApi.googleStatus()
      if (!result?.success)
        throw new Error(result?.error || 'Status koneksi Google tidak tersedia.')
      setConnectionStatus(result.isConnected ? 'connected' : 'disconnected')
    } catch (error) {
      setConnectionStatus('error')
      setConnectionError(error.message || 'Gagal memeriksa koneksi Google.')
    }
  }, [])

  useEffect(() => {
    refreshConnectionStatus()
    window.addEventListener('focus', refreshConnectionStatus)
    return () => window.removeEventListener('focus', refreshConnectionStatus)
  }, [refreshConnectionStatus])

  useEffect(() => {
    if (!showUninstallConfirm) return

    const dialog = uninstallDialogRef.current
    if (!dialog) return

    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [showUninstallConfirm])

  const uninstallGoogleWorkspace = async () => {
    setIsUninstalling(true)
    setConnectionError('')
    try {
      const result = await webApi.googleDisconnect()
      if (!result?.success) throw new Error(result?.error || 'Koneksi Google gagal dihapus.')
      setConnectionStatus('disconnected')
      window.dispatchEvent(new Event('mark-addon-status-changed'))
      setShowUninstallConfirm(false)
    } catch (error) {
      setConnectionError(error.message || 'Koneksi Google gagal dihapus.')
    } finally {
      setIsUninstalling(false)
    }
  }

  const actions = [
    {
      label:
        connectionStatus === 'checking'
          ? 'Memeriksa...'
          : connectionStatus === 'error'
            ? 'Coba lagi'
            : connectionStatus === 'connected'
              ? isUninstalling
                ? 'Menghapus...'
                : 'Uninstall'
              : 'Install',
      icon:
        connectionStatus === 'connected'
          ? Unplug
          : connectionStatus === 'checking' || connectionStatus === 'error'
            ? undefined
            : Plus,
      kind:
        connectionStatus === 'connected'
          ? 'danger'
          : connectionStatus === 'disconnected'
            ? 'install'
            : 'secondary',
      disabled: connectionStatus === 'checking' || isUninstalling,
      onClick:
        connectionStatus === 'error'
          ? refreshConnectionStatus
          : connectionStatus === 'connected'
            ? () => {
                setConnectionError('')
                setShowUninstallConfirm(true)
              }
            : () => draft('/setup-google-workspace ')
    }
  ]
  return (
    <AddonDetail
      addon={getAddon('google-workspace')}
      status={connectionStatus}
      actions={actions}
      feedback={
        connectionError && (
          <p role="status" className="text-sm text-error">
            {connectionError}
          </p>
        )
      }
    >
      {showUninstallConfirm && (
        <dialog
          ref={uninstallDialogRef}
          aria-labelledby="uninstall-google-title"
          aria-describedby="uninstall-google-description"
          onClose={() => setShowUninstallConfirm(false)}
          className="modal"
        >
          <div className="modal-box border border-white/10 bg-base-200">
            <h2 id="uninstall-google-title" className="text-lg font-semibold text-white">
              Hapus koneksi Google Workspace?
            </h2>
            <p
              id="uninstall-google-description"
              className="mt-3 text-sm leading-relaxed text-white/65"
            >
              Token login Google yang tersimpan di Mark akan dihapus. Kamu bisa menghubungkan akun
              lagi kapan saja.
            </p>
            {connectionError && (
              <p role="alert" className="mt-3 text-sm text-error">
                {connectionError}
              </p>
            )}
            <div className="modal-action">
              <button
                type="button"
                disabled={isUninstalling}
                onClick={() => setShowUninstallConfirm(false)}
                className="btn rounded-full"
                autoFocus
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isUninstalling}
                onClick={uninstallGoogleWorkspace}
                className="btn rounded-full border-error bg-error text-white hover:bg-error/90"
              >
                {isUninstalling ? 'Menghapus...' : 'Uninstall'}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button aria-label="Tutup konfirmasi" disabled={isUninstalling}>
              Tutup
            </button>
          </form>
        </dialog>
      )}
      <p className="text-sm text-white/65 leading-relaxed">
        Hubungkan Drive, Calendar, dan Gmail agar Mark bisa membantu pekerjaanmu langsung dari chat.
        Install membuka panduan setup OAuth bersama Mark; login dan izin akun tetap kamu tentukan.
      </p>
      <section aria-labelledby="google-services" className="mt-9">
        <h2
          id="google-services"
          className="text-base font-medium text-white/90 pb-3 border-b border-white/10"
        >
          Layanan <span className="text-white/40">3</span>
        </h2>
        <div className="divide-y divide-white/5">
          {features.map(({ icon: Icon, name, description }) => (
            <div key={name} className="flex gap-4 py-5">
              <Icon size={20} className="shrink-0 mt-0.5 text-white/50" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-medium text-white/85">{name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/50">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section aria-labelledby="addon-info" className="mt-7">
        <h2
          id="addon-info"
          className="text-base font-medium text-white/90 pb-3 border-b border-white/10"
        >
          Informasi
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-4 py-5 text-sm">
          <dt className="text-white/40">Kemampuan</dt>
          <dd className="text-white/75">Baca dan tulis</dd>
          <dt className="text-white/40">Pengembang</dt>
          <dd className="text-white/75">Mazees</dd>
          <dt className="text-white/40">Koneksi</dt>
          <dd className="text-white/75">OAuth akun Google</dd>
        </dl>
      </section>
    </AddonDetail>
  )
}
