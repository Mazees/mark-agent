import { ConfigField } from './ConfigFields'
import { useState } from 'react'
import { configProps, controlClass } from './configStyles'

const presets = [
  'CommandOrControl+Alt+M',
  'CommandOrControl+Shift+Space',
  'Alt+Space',
  'CommandOrControl+Space',
  'F9'
]
const displayShortcut = (value) => value.replace(/CommandOrControl|Control/g, 'Ctrl')

export const ShortcutSection = ({ config, setConfig }) => {
  const [recording, setRecording] = useState(false)
  const current = config.shortcutKey || presets[0]
  const choose = (shortcutKey) => {
    setConfig((previous) => ({ ...previous, shortcutKey }))
    setRecording(false)
  }
  const record = (event) => {
    if (event.key === 'Tab') {
      setRecording(false)
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      setRecording(false)
      event.currentTarget.blur()
      return
    }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return
    const modifiers = []
    if (event.ctrlKey || event.metaKey) modifiers.push('CommandOrControl')
    if (event.altKey) modifiers.push('Alt')
    if (event.shiftKey) modifiers.push('Shift')
    const key = event.code === 'Space' ? 'Space' : event.key.toUpperCase()
    choose([...modifiers, key].join('+'))
    event.currentTarget.blur()
  }
  return (
    <div id="tour-shortcut" className="space-y-6">
      <ConfigField
        id="shortcut-key"
        label="Kombinasi tombol"
        hint="Klik kolom, lalu tekan kombinasi yang diinginkan. Tekan Esc untuk membatalkan. Pintasan diterapkan setelah pengaturan disimpan."
      >
        <input
          id="shortcut-key"
          aria-describedby="shortcut-key-hint"
          readOnly
          onFocus={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={record}
          value={recording ? 'Tekan kombinasi tombol…' : displayShortcut(current)}
          className={`input cursor-pointer ${controlClass} ${recording ? 'border-primary' : ''}`}
        />
      </ConfigField>
      <div>
        <h3 className="mb-3 text-xs text-white/50">Pilihan pintasan</h3>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={current === preset}
              onClick={() => choose(preset)}
              className={`rounded-full border px-4 py-2 text-xs transition-colors ${current === preset ? 'border-white/25 bg-white/10 text-white' : 'border-white/10 text-white/60 hover:text-white'}`}
            >
              {displayShortcut(preset)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
ShortcutSection.propTypes = configProps
