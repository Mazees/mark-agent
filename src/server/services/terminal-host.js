import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let terminal
let closing = false
const send = (message) => {
  if (process.connected) process.send(message)
}
function close(code, error) {
  if (closing) return
  closing = true
  send({ type: 'exit', exitCode: code, error })
  // ConPTY workers can keep Node alive after the shell has exited.
  // This dedicated host owns no application state or other terminals.
  setTimeout(() => process.exit(code === 0 ? 0 : 1), 50)
}
process.on('message', (message) => {
  try {
    if (message.type === 'start' && !terminal) {
      const pty = require('node-pty')
      const args = ['-NoLogo', '-NoProfile']
      if (!message.interactive)
        args.push('-EncodedCommand', Buffer.from(message.command, 'utf16le').toString('base64'))
      terminal = pty.spawn('powershell.exe', args, {
        name: 'xterm-256color',
        cols: 100,
        rows: 28,
        cwd: message.root,
        env: process.env,
        useConpty: true
      })
      terminal.onData((data) => send({ type: 'data', data }))
      terminal.onExit(({ exitCode }) => close(exitCode))
      send({ type: 'ready', pid: terminal.pid })
    } else if (message.type === 'input') terminal?.write(message.data)
    else if (message.type === 'resize') terminal?.resize(message.cols, message.rows)
  } catch (error) {
    close(1, error.message)
  }
})
process.on('disconnect', () => {
  if (terminal && !closing) {
    try {
      terminal.kill()
    } catch {
      /* The shell may already be gone. */
    }
  }
  setTimeout(() => process.exit(0), 100)
})
