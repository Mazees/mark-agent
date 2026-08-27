import { exec } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import util from 'util'
import fs from 'fs'

const execPromise = util.promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function captureDesktopScreenshotBase64() {
  if (process.platform !== 'win32') {
    throw new Error('Screen capture hanya didukung di lingkungan Windows.')
  }

  try {
    const scriptPath = path.resolve(__dirname, '../../main/pc-agent-scripts/take-screenshot.ps1')
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Skrip screenshot tidak ditemukan di ${scriptPath}`)
    }

    const { stdout, stderr } = await execPromise(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`,
      { maxBuffer: 50 * 1024 * 1024 }
    )

    const base64Str = (stdout || '').trim()
    if (!base64Str) {
      throw new Error(stderr || 'Output screenshot kosong.')
    }

    return `data:image/jpeg;base64,${base64Str}`
  } catch (err) {
    console.error('[Screen Capture Error]:', err)
    throw new Error(`Gagal mengambil screenshot: ${err.message}`)
  }
}
