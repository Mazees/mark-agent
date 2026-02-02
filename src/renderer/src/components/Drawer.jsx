import React from 'react'
import { NavLink } from 'react-router-dom'

const Drawer = ({ isOpen = true, onChange }) => {
  const dummySessions = [
    { id: 1, title: 'Cara membuat React component' },
    { id: 2, title: 'Optimasi database Dexie' },
    { id: 3, title: 'Tutorial Tailwind CSS' }
  ]

  return (
    <div className="drawer">
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
            <NavLink to="/" onClick={() => onChange()}>
              Chat Baru
            </NavLink>
          </li>

          <li className="menu-title mt-4">History Session</li>
          {dummySessions.map((session) => (
            <li key={session.id}>
              <NavLink to={`/chat/${session.id}`} onClick={() => onChange()}>
                {session.title}
              </NavLink>
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
