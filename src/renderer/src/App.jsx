import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Chat from './pages/Chat'
import Configuration from './pages/Configuration'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { ChatProvider } from './contexts/ChatContext'
import { YoutubeMusicProvider } from './contexts/YoutubeMusicContext'
import { YoutubeMusicPlayer } from './components/YoutubeMusicPlayer'

function App() {
  return (
    <ChatProvider>
      <YoutubeMusicProvider>
        <HashRouter>
          <div className="h-screen flex flex-col">
            <Navbar />
            <div className="h-[calc(100vh-4rem)] mt-16">
              <Routes>
                <Route path="/" element={<Chat />} />
                <Route path="/config" element={<Configuration />} />
              </Routes>
            </div>
          </div>
          <YoutubeMusicPlayer />
        </HashRouter>
      </YoutubeMusicProvider>
    </ChatProvider>
  )
}

export default App
