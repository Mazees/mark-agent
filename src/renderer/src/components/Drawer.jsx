import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { getAllSessionTitle } from '../api/db'
import { useChat } from '../contexts/ChatContext'
import { useNavigate } from 'react-router-dom'

const Drawer = ({ isOpen = true, onChange }) => {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const { changeSession, setSessionId, setChatData, chatData } = useChat()

  const getSessions = async () => {
    const allSessions = await getAllSessionTitle()
    setSessions(allSessions)
  }
  useEffect(() => {
    ;(async () => {
      await getSessions()
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
        <ul className="menu bg-base-200 min-h-full w-80 p-4 gap-5">
          {/* Sidebar content here */}
          <li>
            <NavLink
              to="/"
              className="btn btn-primary"
              onClick={() => {
                setSessionId(null)
                setChatData([])
                onChange()
              }}
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="1.5em"
                height="1.5em"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  fill-rule="evenodd"
                  d="M3 5.983C3 4.888 3.895 4 5 4h14c1.105 0 2 .888 2 1.983v8.923a1.992 1.992 0 0 1-2 1.983h-6.6l-2.867 2.7c-.955.899-2.533.228-2.533-1.08v-1.62H5c-1.105 0-2-.888-2-1.983V5.983Zm5.706 3.809a1 1 0 1 0-1.412 1.417 1 1 0 1 0 1.412-1.417Zm2.585.002a1 1 0 1 1 .003 1.414 1 1 0 0 1-.003-1.414Zm5.415-.002a1 1 0 1 0-1.412 1.417 1 1 0 1 0 1.412-1.417Z"
                  clip-rule="evenodd"
                />
              </svg>
              Chat Baru
            </NavLink>
          </li>
          <li className="font-bold text-lg">Percakapan</li>
          <li className="flex-1 gap-3">
            <button
              className="btn btn-outline"
              onClick={async () => {
                await getSessions()
              }}
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="1em"
                height="1em"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17.651 7.65a7.131 7.131 0 0 0-12.68 3.15M18.001 4v4h-4m-7.652 8.35a7.13 7.13 0 0 0 12.68-3.15M6 20v-4h4"
                />
              </svg>
              Refresh
            </button>
            {[...sessions]
              .sort((a, b) => b.timestamp - a.timestamp)
              .map((session) => (
                <h1
                  key={session.id}
                  onClick={async () => {
                    await changeSession(session.id)
                    navigate('/')
                    onChange()
                  }}
                >
                  <a>{session.title}</a>
                </h1>
              ))}
          </li>
          <li className="mt-auto">
            <NavLink className="btn justify-start" to="/config" onClick={() => onChange()}>
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="2em"
                height="2em"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  fill-rule="evenodd"
                  d="M17 10v1.126c.367.095.714.24 1.032.428l.796-.797 1.415 1.415-.797.796c.188.318.333.665.428 1.032H21v2h-1.126c-.095.367-.24.714-.428 1.032l.797.796-1.415 1.415-.796-.797a3.979 3.979 0 0 1-1.032.428V20h-2v-1.126a3.977 3.977 0 0 1-1.032-.428l-.796.797-1.415-1.415.797-.796A3.975 3.975 0 0 1 12.126 16H11v-2h1.126c.095-.367.24-.714.428-1.032l-.797-.796 1.415-1.415.796.797A3.977 3.977 0 0 1 15 11.126V10h2Zm.406 3.578.016.016c.354.358.574.85.578 1.392v.028a2 2 0 0 1-3.409 1.406l-.01-.012a2 2 0 0 1 2.826-2.83ZM5 8a4 4 0 1 1 7.938.703 7.029 7.029 0 0 0-3.235 3.235A4 4 0 0 1 5 8Zm4.29 5H7a4 4 0 0 0-4 4v1a2 2 0 0 0 2 2h6.101A6.979 6.979 0 0 1 9 15c0-.695.101-1.366.29-2Z"
                  clip-rule="evenodd"
                />
              </svg>
              Configuration
            </NavLink>
          </li>
        </ul>
      </div>
    </div>
  )
}

export default Drawer
