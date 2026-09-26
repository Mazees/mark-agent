import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const PACKAGE_NAME = '@mazees/mark'
const CACHE_FILE = path.join(os.homedir(), '.config', 'mark-agent', 'update-cache.json')
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 jam

let currentPackageVersion = '5.0.0'
try {
  const pkgPath = path.resolve(__dirname, '../../../package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    if (pkg.version) currentPackageVersion = pkg.version
  }
} catch (_) {}

export function getCurrentVersion() {
  return currentPackageVersion
}

export function getUpdateInstruction() {
  return `npm install -g ${PACKAGE_NAME}@latest`
  return `npm install -g ${PACKAGE_NAME}@latest --ignore-scripts`
}

export function parseSemver(v) {
  if (!v) return [0, 0, 0]
  return String(v)
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
}

export function isNewerVersion(latest, current) {
  if (!latest || !current) return false
  const [lMaj, lMin, lPat] = parseSemver(latest)
  const [cMaj, cMin, cPat] = parseSemver(current)
  if (lMaj > cMaj) return true
  if (lMaj < cMaj) return false
  if (lMin > cMin) return true
  if (lMin < cMin) return false
  return lPat > cPat
}

export async function checkForUpdate(options = {}) {
  const { force = false } = options
  const currentVersion = getCurrentVersion()

  // 1. Dukungan Mock untuk Testing Lokal (sebelum rilis resmi di registry npm)
  if (process.env.MARK_MOCK_LATEST_VERSION) {
    const mockVersion = process.env.MARK_MOCK_LATEST_VERSION.trim()
    return {
      hasUpdate: isNewerVersion(mockVersion, currentVersion),
      latestVersion: mockVersion,
      currentVersion,
      instruction: getUpdateInstruction(),
      isMock: true
    }
  }

  // 2. Periksa Cache Lokal
  if (!force && fs.existsSync(CACHE_FILE)) {
    try {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
      if (Date.now() - (cache.lastChecked || 0) < CHECK_INTERVAL_MS) {
        return {
          hasUpdate: isNewerVersion(cache.latestVersion, currentVersion),
          latestVersion: cache.latestVersion,
          currentVersion,
          instruction: getUpdateInstruction(),
          cached: true
        }
      }
    } catch (_) {}
  }

  // 3. Query Registry NPM (timeout 2500ms agar non-blocking)
  try {
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2500)
    })

    if (!res.ok) {
      return {
        hasUpdate: false,
        latestVersion: currentVersion,
        currentVersion,
        instruction: getUpdateInstruction()
      }
    }

    const data = await res.json()
    const latestVersion = data.version || currentVersion

    // 4. Simpan ke Cache Lokal
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true })
      fs.writeFileSync(
        CACHE_FILE,
        JSON.stringify({ lastChecked: Date.now(), latestVersion }, null, 2),
        'utf8'
      )
    } catch (_) {}

    return {
      hasUpdate: isNewerVersion(latestVersion, currentVersion),
      latestVersion,
      currentVersion,
      instruction: getUpdateInstruction()
    }
  } catch (_) {
    // Gagal fetch (offline, DNS timeout, dll) -> gracefully return false
    return {
      hasUpdate: false,
      latestVersion: currentVersion,
      currentVersion,
      instruction: getUpdateInstruction()
    }
  }
}
