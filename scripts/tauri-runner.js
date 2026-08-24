import { spawn } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs'

// Automatically ensure Cargo and Rustup paths are loaded into environment
const cargoBin = path.join(os.homedir(), '.cargo', 'bin')
if (!process.env.PATH.includes(cargoBin)) {
  process.env.PATH = `${cargoBin};${process.env.PATH}`
}

const args = process.argv.slice(2)
const tauriJs = path.resolve('node_modules', '@tauri-apps', 'cli', 'tauri.js')

let child
if (fs.existsSync(tauriJs)) {
  child = spawn(process.execPath, [tauriJs, ...args], {
    stdio: 'inherit',
    env: process.env
  })
} else {
  child = spawn(os.platform() === 'win32' ? 'npx.cmd' : 'npx', ['tauri', ...args], {
    stdio: 'inherit',
    shell: true,
    env: process.env
  })
}

child.on('exit', (code) => {
  process.exit(code || 0)
})
