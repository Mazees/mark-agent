import { exec } from 'child_process'
import os from 'os'
import open from 'open'

/**
 * Meluncurkan antarmuka WebUI dalam mode desktop window (Microsoft Edge App Mode).
 *
 * @param {object} options
 * @param {number} [options.port=3000] Port server
 * @param {boolean} [options.headless=false] Jika true, jangan buka browser
 * @param {string} [options.mode='app'] 'app' (Edge App Mode) | 'browser' (Default Browser)
 */
export async function launchUI(options = {}) {
  const { port = 3000, headless = false, mode = 'app' } = options

  if (headless || process.argv.includes('--headless') || process.argv.includes('--no-ui')) {
    return
  }

  const url = `http://localhost:${port}`
  const isWindows = os.platform() === 'win32'

  if (isWindows && mode === 'app') {
    const cmd = `start msedge --app="${url}"`
    exec(cmd, (err) => {
      if (err) {
        open(url).catch(() => {})
      }
    })
  } else {
    try {
      await open(url)
    } catch (_) {}
  }
}
