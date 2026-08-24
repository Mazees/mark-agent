import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaArrowLeft,
  FaGoogle,
  FaKey,
  FaSave,
  FaCheckCircle,
  FaExclamationTriangle
} from 'react-icons/fa'
import { getAllConfig, saveConfiguration } from '../api/db'

const GoogleWorkspace = () => {
  const navigate = useNavigate()
  const [config, setConfig] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)

  useEffect(() => {
    loadConfig()
    checkConnectionStatus()
  }, [])

  const checkConnectionStatus = async () => {
    if (window.api && window.api.googleStatus) {
      const res = await window.api.googleStatus()
      setIsConnected(res.isConnected)
    }
  }

  const handleConnect = async () => {
    if (!config.googleClientId || !config.googleClientSecret) {
      showToast('Client ID & Secret harus diisi dan disimpan dulu!')
      return
    }
    setIsConnecting(true)
    try {
      const res = await window.api.googleConnect(config.googleClientId, config.googleClientSecret)
      if (res.success) {
        showToast('Berhasil terhubung ke Google Workspace!')
        setIsConnected(true)
      } else {
        showToast(`Gagal: ${res.error}`)
      }
    } catch (e) {
      showToast('Gagal memproses login.')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await window.api.googleDisconnect()
      setIsConnected(false)
      showToast('Terputus dari Google Workspace.')
    } catch (e) {
      showToast('Gagal memutuskan koneksi.')
    }
  }

  const loadConfig = async () => {
    try {
      const data = await getAllConfig()
      if (data && data.length > 0) {
        setConfig(data[0])
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await saveConfiguration(config)

      // Notify main process if needed
      if (window.api && window.api.syncConfig) {
        window.api.syncConfig(config)
      }

      showToast('Kredensial Google Workspace berhasil disimpan!')
    } catch (error) {
      console.error('Failed to save config:', error)
      showToast('Gagal menyimpan kredensial.')
    } finally {
      setIsSaving(false)
    }
  }

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-base-300 text-base-content flex items-center justify-center">
        <span className="loading loading-spinner text-primary w-12 h-12"></span>
      </div>
    )
  }

  return (
    <div className="h-screen bg-base-300 text-base-content overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Main Content Area */}
      <div className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto px-4 py-8 pb-32 space-y-8">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="btn btn-ghost btn-sm btn-circle shrink-0"
                style={{ WebkitAppRegion: 'no-drag' }}
                title="Kembali"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="1.2em"
                  height="1.2em"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold">Google Workspace</h1>
                <p className="opacity-50 text-sm mt-1">
                  Integrasi Drive, Calendar, dan Gmail ke Mark AI.
                </p>
              </div>
            </div>
          </div>
          {/* Info Card */}
          <div className="card bg-base-100 border border-info/30 shadow-xl shadow-info/10">
            <div className="card-body">
              <h2 className="card-title text-info mb-2 flex items-center gap-2">
                <FaExclamationTriangle /> Panduan Singkat
              </h2>
              <p className="text-sm opacity-80 mb-4">
                Untuk menghubungkan Mark dengan Google Workspace milikmu, kamu harus membuat **OAuth
                Client ID** bertipe Desktop App di Google Cloud Console.
              </p>
              <ol className="list-decimal list-inside text-sm space-y-2 opacity-80 bg-base-200 p-4 rounded-xl font-mono">
                <li>
                  Buka{' '}
                  <a
                    href="https://console.cloud.google.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    console.cloud.google.com
                  </a>
                </li>
                <li>
                  Buat Project Baru & Aktifkan: <strong>Drive API, Gmail API, Calendar API</strong>
                </li>
                <li>
                  Buat <strong>OAuth Consent Screen</strong> (External, masukkan emailmu di Test
                  Users)
                </li>
                <li>
                  Buat Credentials baru: <strong>OAuth client ID</strong> &gt;{' '}
                  <strong>Desktop App</strong>
                </li>
                <li>Copy Client ID & Client Secret ke form di bawah ini.</li>
              </ol>
            </div>
          </div>

          {/* Form Card */}
          <div className="card bg-base-100 border border-white/5 shadow-2xl">
            <div className="card-body space-y-6">
              <h2 className="card-title text-xl border-b border-white/10 pb-4 flex items-center gap-2">
                <FaKey className="text-warning" /> API Credentials
              </h2>

              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text font-bold text-sm">Google Client ID</span>
                </label>
                <input
                  type="text"
                  placeholder="Misal: 123456789-abcdefghijkl.apps.googleusercontent.com"
                  className="input input-bordered w-full font-mono text-sm focus:border-primary"
                  value={config.googleClientId || ''}
                  onChange={(e) => setConfig({ ...config, googleClientId: e.target.value })}
                />
              </div>

              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text font-bold text-sm">Google Client Secret</span>
                </label>
                <input
                  type="password"
                  placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="input input-bordered w-full font-mono text-sm focus:border-primary"
                  value={config.googleClientSecret || ''}
                  onChange={(e) => setConfig({ ...config, googleClientSecret: e.target.value })}
                />
              </div>

              <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mt-4 flex gap-3 items-start">
                <FaExclamationTriangle className="text-warning mt-1 shrink-0" />
                <div>
                  <h3 className="font-bold text-warning text-sm">Peringatan Keamanan</h3>
                  <p className="text-xs opacity-70 mt-1">
                    Kredensial ini disimpan secara lokal dan aman di databasemu. Jangan pernah
                    membagikan Client Secret ke orang lain. Mark hanya akan menggunakan kredensial
                    ini untuk meminta akses ke akun Google-mu secara resmi.
                  </p>
                </div>
              </div>

              {/* Connection Status & Buttons */}
              <div className="border-t border-white/10 pt-6 mt-2 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm">Status Koneksi</h3>
                    <p className="text-xs opacity-70">
                      {isConnected
                        ? 'Mark terhubung dan memiliki akses ke Google Workspace.'
                        : 'Mark belum diberikan akses masuk ke Google Workspace.'}
                    </p>
                  </div>
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-bold ${isConnected ? 'bg-success/20 text-success' : 'bg-base-300 text-white/50'}`}
                  >
                    {isConnected ? 'TERHUBUNG' : 'TERPUTUS'}
                  </div>
                </div>

                {isConnected ? (
                  <button onClick={handleDisconnect} className="btn btn-error btn-outline w-full">
                    Putuskan Koneksi Google
                  </button>
                ) : (
                  <button
                    onClick={handleConnect}
                    disabled={isConnecting || !config.googleClientId || !config.googleClientSecret}
                    className="btn btn-info w-full"
                  >
                    {isConnecting ? (
                      <span className="loading loading-spinner"></span>
                    ) : (
                      <FaGoogle />
                    )}
                    Login & Beri Akses
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Save Button */}
        <div className="fixed bottom-0 left-0 w-full bg-base-300/80 backdrop-blur border-t border-white/10 p-4 z-50">
          <div className="max-w-5xl mx-auto flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving || !config.googleClientId || !config.googleClientSecret}
              className="btn btn-primary min-w-[200px]"
            >
              {isSaving ? (
                <span className="loading loading-spinner"></span>
              ) : (
                <>
                  <FaSave /> Simpan Kredensial
                </>
              )}
            </button>
          </div>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="toast toast-top toast-center z-[100]">
            <div className="alert alert-success shadow-lg">
              <FaCheckCircle className="text-xl" />
              <span>{toastMessage}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GoogleWorkspace
