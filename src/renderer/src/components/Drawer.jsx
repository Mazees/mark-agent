import React from 'react'
import { NavLink } from 'react-router-dom'

const Drawer = ({ isOpen=true, onChange }) => {
  return (
    <div className="drawer">
      <input id="my-drawer-1" type="checkbox" className="drawer-toggle" checked={isOpen} onChange={onChange} />
      <div className="drawer-side">
        <label htmlFor="my-drawer-1" aria-label="close sidebar" className="drawer-overlay"></label>
        <ul className="menu bg-base-200 min-h-full w-80 p-4">
          {/* Sidebar content here */}
          <li>
            <NavLink to="/" onClick={() => onChange()}>Chat</NavLink>
          </li>
          <li>
            <NavLink to="/config" onClick={() => onChange()}>Configuration</NavLink>
          </li>
        </ul>
      </div>
    </div>
  )
}

export default Drawer
