import React, { useRef } from 'react'
import { FaWhatsapp, FaHistory, FaRobot, FaPaperPlane } from 'react-icons/fa'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useWhatsappBot } from '../hooks/whatsapp/useWhatsappBot'
import Drawer from '../components/Drawer'

export default function WhatsappBot() {
  const ytMusic = useYoutubeMusic()
  const webviewRef = useRef(null)
  
  const {
    isThinking,
    currentSender,
    history
  } = useWhatsappBot(webviewRef, ytMusic)

  return (
    <div className="flex flex-col h-full w-full bg-base-100 overflow-hidden relative">
        {/* Header */}
        <div className="bg-base-100 p-4 shadow-sm z-10 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FaWhatsapp className="text-success" />
              WhatsApp AI Agent
            </h1>
            <p className="text-sm text-base-content/60 mt-1">
              Mark akan membaca dan membalas pesan secara otomatis.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {isThinking && (
              <div className="flex items-center gap-2 text-primary animate-pulse">
                <span className="loading loading-dots loading-sm"></span>
                <span className="text-sm font-medium">Membalas {currentSender}...</span>
              </div>
            )}
            <div className="badge badge-success gap-2 p-3 font-medium shadow-sm">
              <span className="w-2 h-2 rounded-full bg-base-100 animate-pulse"></span>
              Bot Aktif
            </div>
          </div>
        </div>

        {/* Main Content Split: Webview & History */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* WhatsApp Webview (Kiri) */}
          <div className="flex-1 relative bg-base-200 border-r border-base-300" style={{ flex: 2 }}>
            <webview
            ref={webviewRef}
            src="https://web.whatsapp.com/"
            partition="persist:whatsapp"
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            className="w-full h-full border-none"
            webpreferences="contextIsolation=no, nodeIntegration=yes"
          ></webview>
            
            {/* Overlay peringatan mode preview dihapus sementara biar bisa klik manual */}
          </div>

          {/* Riwayat Balasan (Kanan) */}
          <div className="flex-1 bg-base-100 flex flex-col overflow-hidden" style={{ flex: 1, minWidth: '350px' }}>
            <div className="p-4 border-b border-base-300 bg-base-200/50">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <FaHistory className="text-primary" />
                Riwayat Balasan
              </h2>
              <p className="text-xs text-base-content/60 mt-1">Log aktivitas Mark membalas pesan.</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-base-content/40">
                  <FaRobot className="text-4xl mb-3 opacity-20" />
                  <p>Belum ada pesan yang dibalas.</p>
                </div>
              ) : (
                history.map((log) => (
                  <div key={log.id} className="card bg-base-200 shadow-sm text-sm">
                    <div className="card-body p-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-primary flex items-center gap-1">
                          <FaPaperPlane size={12} /> {log.to}
                        </span>
                        <span className="text-xs opacity-50">{log.time}</span>
                      </div>
                      <div className="bg-base-300 p-2 rounded-md mb-2 border-l-2 border-base-content/20 italic">
                        <span className="opacity-70 line-clamp-2">"{log.msg}"</span>
                      </div>
                      <div>
                        <span className="font-semibold opacity-80">Mark: </span>
                        <span className="whitespace-pre-wrap">{log.reply}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
  )
}
