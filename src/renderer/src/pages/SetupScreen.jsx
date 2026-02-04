import { useState } from 'react'

const SetupScreen = ({ onComplete }) => {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  const startSetup = async () => {
    setLoading(true)
    setStatus('Membuka Chrome...')

    try {
      const result = await window.api.initMarkInternet()
      if (result.success) {
        setStatus('Berhasil!')
        setTimeout(() => onComplete(), 1000)
      } else {
        setStatus(result.message || 'Setup gagal')
        setLoading(false)
      }
    } catch (error) {
      setStatus('Terjadi error')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-base-300 via-base-200 to-base-300 flex items-center justify-center p-6">
      <div className="card bg-base-100 shadow-2xl max-w-md w-full overflow-hidden">
        {/* Decorative Header */}
        <div className="bg-linear-to-r from-primary to-secondary h-2"></div>

        <div className="card-body items-center text-center gap-6 p-8">
          {/* Icon */}
          <div className="relative">
            <div className="w-24 h-24 bg-linear-to-br from-primary/20 to-secondary/20 rounded-full flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 text-primary"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </div>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="loading loading-ring loading-lg text-primary"></span>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <h1 className="text-2xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent">
              Persiapan Mark
            </h1>
            <p className="text-base-content/70 mt-2">
              Biar Mark bisa akses info terbaru, kita perlu sinkronisasi sama Google dulu.
            </p>
          </div>

          {/* Status Message */}
          {status && (
            <div
              className={`badge badge-lg gap-2 ${loading ? 'badge-info' : status.includes('Berhasil') ? 'badge-success' : 'badge-error'}`}
            >
              {loading && <span className="loading loading-spinner loading-xs"></span>}
              {status}
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={startSetup}
            disabled={loading}
            className="btn btn-primary btn-wide gap-2 shadow-lg hover:shadow-primary/25 transition-all duration-300"
          >
            {loading ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Lagi Sinkronisasi...
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z"
                    clipRule="evenodd"
                  />
                </svg>
                Hubungkan Internet Mark
              </>
            )}
          </button>

          {/* Hint */}
          <div className="text-xs text-base-content/50 flex items-start gap-2 bg-base-200 p-3 rounded-lg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Jendela Chrome bakal kebuka. Kamu hanya perlu menyelesaikan captcha.</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SetupScreen
