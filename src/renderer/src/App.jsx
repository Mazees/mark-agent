import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Chat from './pages/Chat'
import Configuration from './pages/Configuration'
import SetupScreen from './pages/SetupScreen'
import SplashScreen from './pages/SplashScreen'
import { HashRouter, Routes, Route } from 'react-router-dom'

function App() {
  const [isSetupComplete, setIsSetupComplete] = useState(false)
  const [loading, setLoading] = useState(true)

  const checkSetupStatus = async () => {
    const status = await window.api.checkCaptcha()
    setIsSetupComplete(status)
    setTimeout(() => {
      setLoading(false)
    }, 2000)
  }

  const handleSetupComplete = () => {
    setIsSetupComplete(true)
  }

  useEffect(() => {
    checkSetupStatus()
  }, [])

  if (loading) {
    return <SplashScreen />
  }

  if (!isSetupComplete) {
    return <SetupScreen onComplete={handleSetupComplete} />
  }

  return (
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
    </HashRouter>
  )
}

export default App
