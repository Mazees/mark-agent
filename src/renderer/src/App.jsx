import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'
import Navbar from './components/Navbar'
import Chat from './pages/Chat'
import Configuration from './pages/Configuration'
import { HashRouter, Routes, Route } from 'react-router-dom'

function App() {
  const ipcHandle = () => window.electron.ipcRenderer.send('ping')

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
