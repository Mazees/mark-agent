import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { FaGoogle, FaTelegram } from 'react-icons/fa'
import PropTypes from 'prop-types'
import { getAddonStatuses } from '../api/addonStatus'
import { webApi } from '../api/web-bridge'

const addonIcons = { google: FaGoogle, telegram: FaTelegram }

export default function AddonDetail({ addon, children }) {
  const [status, setStatus] = useState('checking')
  const Icon = addonIcons[addon.icon]

  useEffect(() => {
    let active = true
    const refreshStatus = () => {
      getAddonStatuses().then((statuses) => {
        if (active) setStatus(statuses[addon.id] || 'error')
      })
    }
    refreshStatus()
    window.addEventListener('focus', refreshStatus)
    window.addEventListener('mark-addon-status-changed', refreshStatus)
    const unsubscribe =
      addon.id === 'telegram' ? webApi.onTgConnection((nextStatus) => setStatus(nextStatus)) : null
    return () => {
      active = false
      window.removeEventListener('focus', refreshStatus)
      window.removeEventListener('mark-addon-status-changed', refreshStatus)
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [addon.id])

  const statusLabel = {
    checking: 'Memeriksa koneksi',
    connected: 'Terhubung',
    connecting: 'Menghubungkan',
    disconnected: 'Belum terhubung',
    error: 'Status tidak tersedia'
  }[status]

  return (
    <main className="h-screen overflow-y-auto bg-base-300 text-base-content custom-scrollbar">
      <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
        <Link
          to="/addons"
          className="mb-10 inline-flex items-center gap-2 text-sm text-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowLeft size={17} /> Kembali
        </Link>
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10">
              <Icon
                size={34}
                className={addon.icon === 'google' ? 'text-[#4285f4]' : 'text-[#2aabee]'}
                aria-hidden="true"
              />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-white">{addon.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <span className="text-white/45">Oleh {addon.developer}</span>
                <span
                  className={
                    status === 'connected'
                      ? 'text-primary'
                      : status === 'error'
                        ? 'text-error'
                        : 'text-white/45'
                  }
                  role="status"
                >
                  {statusLabel}
                </span>
              </div>
            </div>
          </div>
          {addon.logRoute && (
            <Link
              to={addon.logRoute}
              className="btn btn-ghost self-start rounded-full px-5 sm:self-center"
            >
              Buka log <ExternalLink size={16} />
            </Link>
          )}
        </header>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  )
}

AddonDetail.propTypes = {
  addon: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    developer: PropTypes.string.isRequired,
    icon: PropTypes.oneOf(['google', 'telegram']).isRequired,
    logRoute: PropTypes.string
  }).isRequired,
  children: PropTypes.node.isRequired
}
