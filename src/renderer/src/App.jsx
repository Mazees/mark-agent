import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Chat from './pages/Chat'
import Configuration from './pages/Configuration'
import SetupScreen from './pages/SetupScreen'
import { HashRouter, Routes, Route } from 'react-router-dom'

function App() {
  const [isSetupComplete, setIsSetupComplete] = useState(() => {
    return localStorage.getItem('mark-internet-setup') === 'true'
  })

  const handleSetupComplete = () => {
    localStorage.setItem('mark-internet-setup', 'true')
    setIsSetupComplete(true)
  }

  if (!isSetupComplete) {
    return <SetupScreen onComplete={handleSetupComplete} />
  }

  return (
    <HashRouter>
      <div className="h-screen flex flex-col">
        <Navbar />
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/config" element={<Configuration />} />
        </Routes>
      </div>
    </HashRouter>
  )
}

export default App
