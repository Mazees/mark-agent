import { exec } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import util from 'util'
import fs from 'fs'

const execPromise = util.promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function captureDesktopScreenshotsBase64() {
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

    const rawOutput = (stdout || '').trim()
    if (!rawOutput) {
      throw new Error(stderr || 'Output screenshot kosong.')
    }

    const base64List = rawOutput
      .split('|||')
      .map((str) => str.trim())
      .filter(Boolean)

    if (base64List.length === 0) {
      throw new Error('Tidak ada gambar layar yang berhasil diambil.')
    }

    return base64List.map((b64) => `data:image/jpeg;base64,${b64}`)
  } catch (err) {
    console.error('[Screen Capture Error]:', err)
    throw new Error(`Gagal mengambil screenshot: ${err.message}`)
  }
}

export async function captureDesktopScreenshotBase64() {
  const all = await captureDesktopScreenshotsBase64()
  return all[0]
}
