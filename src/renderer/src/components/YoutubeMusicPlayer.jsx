import { useEffect } from 'react'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'

export const YoutubeMusicPlayer = () => {
  const { musicUrl, isPlayerOpen, setIsPlayerOpen, togglePlayer, webviewRef } = useYoutubeMusic()

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleDomReady = () => {
      // 1. Suntik CSS buat ngilangin visual iklan & promo premium
      webview.insertCSS(`
        /* Sembunyikan iklan video/audio player */
        .ad-showing, .ad-interrupting, .ytp-ad-overlay-container, .ytp-ad-message-container {
          display: none !important;
        }
        
        /* Sembunyikan banner "Upgrade to Premium" & Mealbar Promo */
        ytmusic-guide-entry-renderer[icon='yt-sys-icons:premium'],
        ytmusic-pivot-bar-item-renderer[tab-id='SPunlimited'],
        .ytmusic-mealbar-promo-renderer,
        ytmusic-ad-slot-renderer,
        #premium-out-of-app-upsell {
          display: none !important;
        }

        /* Sembunyikan popup promosi & overlay backdrop */
        ytmusic-popup-container, iron-overlay-backdrop, ytmusic-upsell-dialog-renderer {
          display: none !important;
        }
      `)

      // 2. Logic "Ad-Blaster" (Auto-Mute & 16x Speed)
      webview.executeJavaScript(`
        (function() {
          let isAdMuted = false;

          setInterval(() => {
            const video = document.querySelector('video');
            const adContainer = document.querySelector('.ad-showing, .ad-interrupting');
            const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');

            // --- JIKA ADA IKLAN ---
            if (adContainer && video) {
              console.log('Mark mendeteksi iklan. Mengaktifkan Ad-Blaster...');
              
              // A. Mute suara iklan biar gak berisik
              if (!video.muted) {
                video.muted = true;
                isAdMuted = true;
              }

              // B. Paksa kecepatan 16x (Iklan 30 detik jadi ~2 detik)
              video.playbackRate = 16;

              // C. Paksa loncat ke akhir video iklan
              if (isFinite(video.duration)) {
                video.currentTime = video.duration - 0.1;
              }

              // D. Klik tombol skip kalau tiba-tiba muncul
              if (skipBtn) skipBtn.click();
            } 
            
            // --- JIKA IKLAN SELESAI ---
            else if (video) {
              // Balikin suara & kecepatan normal
              if (isAdMuted) {
                video.muted = false;
                isAdMuted = false;
              }
              if (video.playbackRate !== 1) {
                video.playbackRate = 1;
              }
            }

            // Anti-pause "Are you still watching?"
            const confirmBtn = document.querySelector('ytmusic-you-there-renderer button, .ytmusic-you-there-renderer button');
            if (confirmBtn) confirmBtn.click();

          }, 500); // Cek setiap setengah detik
        })();
      `)
    }

    webview.addEventListener('dom-ready', handleDomReady)
    return () => webview.removeEventListener('dom-ready', handleDomReady)
  }, [])

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
      {/* Player Panel */}
      <div
        className={`
          transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom-right
          ${
            isPlayerOpen
              ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 scale-75 translate-y-4 pointer-events-none'
          }
        `}
      >
        <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-white/10 bg-base-300">
          {/* Header bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-base-200/80 backdrop-blur-sm border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
              <span className="text-xs font-medium text-white/60 select-none">YouTube Music</span>
            </div>
            <button
              onClick={() => setIsPlayerOpen(false)}
              className="btn btn-ghost btn-xs btn-circle text-white/40 hover:text-white/80"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>

          {/* Webview */}
          <webview
            ref={webviewRef}
            src={musicUrl}
            style={{ zoom: '0.65', width: '420px', height: '560px' }}
            className="no-scrollbar"
            allowpopups="false"
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
          />
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={togglePlayer}
        className={`
          group relative w-14 h-14 rounded-full flex items-center justify-center pointer-events-auto
          shadow-lg shadow-black/30 border border-white/10
          transition-all duration-300 ease-out
          hover:scale-110 hover:shadow-xl hover:shadow-red-500/20
          active:scale-95
          ${
            isPlayerOpen
              ? 'bg-red-600 hover:bg-red-700 rotate-0'
              : 'bg-linear-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700'
          }
        `}
        title={isPlayerOpen ? 'Tutup Player' : 'Buka YouTube Music'}
      >
        {/* Pulse ring saat tertutup */}
        {!isPlayerOpen && (
          <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping pointer-events-none" />
        )}

        {isPlayerOpen ? (
          // Icon X (close)
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-300"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        ) : (
          // Icon Music Note
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="white"
            className="transition-transform duration-300 group-hover:scale-110"
          >
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        )}
      </button>
    </div>
  )
}
