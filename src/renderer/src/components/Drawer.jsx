import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { getAllSessionTitle } from '../api/db'
import { useChat } from '../contexts/ChatContext'

const Drawer = ({ isOpen = true, onChange }) => {
  const [sessions, setSessions] = useState([])
  const { changeSession, setSessionId, setChatData, chatData } = useChat()
  useEffect(() => {
    ;(async () => {
      const allSessions = await getAllSessionTitle()
      setSessions(allSessions)
    })()
  }, [chatData])

  return (
    <div className="drawer z-30">
      <input
        id="my-drawer-1"
        type="checkbox"
        className="drawer-toggle"
        checked={isOpen}
        onChange={onChange}
      />
      <div className="drawer-side">
        <label htmlFor="my-drawer-1" aria-label="close sidebar" className="drawer-overlay"></label>
        <ul className="menu bg-base-200 min-h-full w-80 p-4">
          {/* Sidebar content here */}
          <li>
            <NavLink
              to="/"
              onClick={() => {
                setSessionId(null)
                setChatData([])
                onChange()
              }}
            >
              Chat Baru
            </NavLink>
          </li>

          <li className="menu-title mt-4">History Session</li>
          {[...sessions].reverse().map((session) => (
            <li
              key={session.id}
              onClick={async () => {
                await changeSession(session.id)
                onChange()
              }}
            >
              <a>{session.title}</a>
            </li>
          ))}

          <li className="mt-auto">
            <NavLink to="/config" onClick={() => onChange()}>
              Configuration
            </NavLink>
          </li>
        </ul>
      </div>
    </div>
  )
}

export default Drawer
