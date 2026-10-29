import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ExternalLink, Puzzle } from 'lucide-react'
import { FaGoogle, FaTelegram, FaChrome } from 'react-icons/fa'
import PropTypes from 'prop-types'
import { getAddonStatuses, addonStatusLabels } from '../api/addonStatus'
import { webApi } from '../api/web-bridge'

const addonIcons = { google: FaGoogle, telegram: FaTelegram, chrome: FaChrome, plugin: Puzzle }

export default function AddonDetail({
  addon,
  children,
  status: suppliedStatus,
  actions = [],
  feedback,
  backTo = '/addons'
}) {
  const [liveStatus, setStatus] = useState('checking')
  const navigate = useNavigate()
  const status = suppliedStatus ?? liveStatus
  const Icon = addonIcons[addon.icon]

  useEffect(() => {
    if (suppliedStatus !== undefined) return
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
      addon.id === 'telegram'
        ? webApi.onTgConnection((nextStatus) => setStatus(nextStatus))
        : addon.id === 'chrome-bridge'
          ? webApi.onChromeBridgeStatus((next) => setStatus(next.status))
          : null
    return () => {
      active = false
      window.removeEventListener('focus', refreshStatus)
      window.removeEventListener('mark-addon-status-changed', refreshStatus)
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [addon.id, suppliedStatus])

  const statusLabel = addonStatusLabels[status] || addonStatusLabels.error

  return (
    <main className="h-screen overflow-y-auto bg-base-300 text-base-content custom-scrollbar">
      <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
        <Link
          to={backTo}
          className="mb-10 inline-flex items-center gap-2 text-sm text-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowLeft size={17} /> Kembali
        </Link>
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10">
              {addon.iconData ? <img src={addon.iconData} alt="" className="h-10 w-10 object-contain" /> : <Icon
                size={34}
                className={
                  addon.icon === 'google'
                    ? 'text-[#4285f4]'
                    : addon.icon === 'chrome' || addon.icon === 'plugin'
                      ? 'text-primary'
                      : 'text-[#2aabee]'
                }
                aria-hidden="true"
              />}
            </span>
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-semibold text-white">{addon.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                {addon.developer && <span className="text-white/45">Oleh {addon.developer}</span>}
                <span
                  className={
                    status === 'connected' || status === 'active'
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
        <div className="mt-8 space-y-8">
          {actions.length > 0 && (
            <div
              className="flex flex-wrap items-start justify-end gap-3 sm:items-center"
              aria-label="Kelola add-on"
            >
              {actions.map(
                ({
                  key,
                  label,
                  icon: ActionIcon,
                  kind = 'secondary',
                  disabled,
                  onClick,
                  type = 'button',
                  form
                }) => (
                  <button
                    key={key || label}
                    type={type}
                    form={form}
                    disabled={disabled}
                    onClick={onClick}
                    className={`btn self-start rounded-full px-5 sm:self-center ${kind === 'install' ? 'border-white bg-white text-neutral-900 hover:bg-white/90' : kind === 'danger' ? 'border-error/40 bg-transparent text-error hover:bg-error/10' : kind === 'ghost' ? 'btn-ghost' : ''}`}
                  >
                    {ActionIcon && <ActionIcon size={17} aria-hidden="true" />}
                    {label}
                  </button>
                )
              )}
            </div>
          )}
          {feedback}
          {addon.examples?.length > 0 && (
            <section
              aria-label="Contoh penggunaan"
              className="rounded-2xl border border-white/5 bg-gradient-to-br from-emerald-950/70 via-base-200 to-teal-950/50 px-4 py-7 sm:px-10 sm:py-9"
            >
              <div className="mx-auto max-w-xl space-y-3">
                {addon.examples.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => navigate('/chat', { state: { composerDraft: text } })}
                    className="flex w-full items-center gap-4 rounded-2xl bg-base-300/90 px-4 py-4 text-left text-sm leading-relaxed text-white/85 hover:bg-base-300"
                  >
                    <span className="flex-1">{text}</span>
                    <ArrowRight size={17} className="shrink-0 text-white/60" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          )}
          <div className="space-y-8" data-addon-content>
            {children}
          </div>
        </div>
      </div>
    </main>
  )
}

AddonDetail.propTypes = {
  addon: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    developer: PropTypes.string,
    icon: PropTypes.oneOf(['google', 'telegram', 'chrome', 'plugin']).isRequired,
    iconData: PropTypes.string,
    logRoute: PropTypes.string,
    examples: PropTypes.arrayOf(PropTypes.string)
  }).isRequired,
  children: PropTypes.node.isRequired,
  status: PropTypes.string,
  feedback: PropTypes.node,
  backTo: PropTypes.string,
  actions: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string,
      label: PropTypes.string.isRequired,
      icon: PropTypes.elementType,
      kind: PropTypes.oneOf(['install', 'danger', 'ghost', 'secondary']),
      disabled: PropTypes.bool,
      onClick: PropTypes.func,
      type: PropTypes.oneOf(['button', 'submit']),
      form: PropTypes.string
    })
  )
}
