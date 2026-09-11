import fs from 'fs'
import path from 'path'
import os from 'os'
import { pathToFileURL } from 'url'
import { execSync } from 'child_process'

let loadedPlugins = []
let pluginActionHandlers = new Map()

export function getPluginsDirectory() {
  const dir = path.join(os.homedir(), 'Documents', 'Mark Plugins')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export const getPluginsDir = getPluginsDirectory

export async function loadAllPlugins() {
  const dir = getPluginsDirectory()
  loadedPlugins = []
  pluginActionHandlers.clear()

  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const pluginDir = path.join(dir, entry.name)
      const manifestPath = path.join(pluginDir, 'plugin.json')
      const indexPath = path.join(pluginDir, 'index.js')

      if (fs.existsSync(manifestPath) && fs.existsSync(indexPath)) {
        try {
          const manifestRaw = await fs.promises.readFile(manifestPath, 'utf-8')
          const manifest = JSON.parse(manifestRaw)
          manifest.folderName = entry.name
          manifest.folderPath = pluginDir

          const moduleUrl = `${pathToFileURL(indexPath).href}?t=${Date.now()}`
          const module = await import(moduleUrl)
          const handlerInstance = module.default || module

          const indexContent = await fs.promises.readFile(indexPath, 'utf-8')

          if (manifest.isEnabled !== false && Array.isArray(manifest.actions)) {
            for (const act of manifest.actions) {
              const actHandler = handlerInstance[act.name] || (typeof handlerInstance === 'function' ? handlerInstance : null)
              if (typeof actHandler === 'function') {
                pluginActionHandlers.set(act.name, {
                  handler: actHandler,
                  pluginName: manifest.name,
                  actionName: act.name
                })
              }

              // Extract function body for Monaco editor
              const searchPatterns = [
                `'${act.name}': async ({ query }) => {`,
                `"${act.name}": async ({ query }) => {`,
                `${act.name}: async ({ query }) => {`,
                `'${act.name}': async (query) => {`,
                `"${act.name}": async (query) => {`,
                `${act.name}: async (query) => {`
              ]

              let startIdx = -1
              let matchedPatternLen = 0
              for (const pat of searchPatterns) {
                const idx = indexContent.indexOf(pat)
                if (idx !== -1) {
                  startIdx = idx
                  matchedPatternLen = pat.length
                  break
                }
              }

              if (startIdx !== -1) {
                let i = startIdx + matchedPatternLen
                let openBrackets = 1
                for (; i < indexContent.length; i++) {
                  if (indexContent[i] === '{') openBrackets++
                  if (indexContent[i] === '}') {
                    openBrackets--
                    if (openBrackets === 0) break
                  }
                }
                const rawCode = indexContent.substring(startIdx + matchedPatternLen, i)
                act.code = rawCode
                  .split('\n')
                  .map((l) => (l.startsWith('    ') ? l.substring(4) : l.startsWith('  ') ? l.substring(2) : l))
                  .join('\n')
                  .trim()
              }
            }
          }

          loadedPlugins.push(manifest)
        } catch (err) {
          console.error(`[Plugin Loader] Gagal memuat plugin ${entry.name}:`, err)
        }
      }
    }
  }
  return loadedPlugins
}

export const loadPlugins = loadAllPlugins
export const getLoadedPlugins = () => loadedPlugins
export const getPluginHandlers = () => Object.fromEntries(pluginActionHandlers.entries())

/**
 * Normalisasi query input dari AI/UI menjadi string tunggal bersih
 */
export function normalizePluginQuery(rawQuery) {
  if (rawQuery === null || rawQuery === undefined) return ''
  if (typeof rawQuery === 'string') return rawQuery
  if (typeof rawQuery === 'number' || typeof rawQuery === 'boolean') return String(rawQuery)
  if (typeof rawQuery === 'object') {
    if (rawQuery.query !== undefined) {
      return typeof rawQuery.query === 'object' ? JSON.stringify(rawQuery.query) : String(rawQuery.query)
    }
    if (rawQuery.value !== undefined) return String(rawQuery.value)
    if (rawQuery.volume !== undefined) return String(rawQuery.volume)
    if (rawQuery.text !== undefined) return String(rawQuery.text)
    if (rawQuery.prompt !== undefined) return String(rawQuery.prompt)
    if (rawQuery.target !== undefined) return String(rawQuery.target)
    if (rawQuery.input !== undefined) return String(rawQuery.input)
    const vals = Object.values(rawQuery)
    if (vals.length === 1 && typeof vals[0] !== 'object') {
      return String(vals[0])
    }
    return JSON.stringify(rawQuery)
  }
  return String(rawQuery)
}

export async function executePluginAction(actionName, query) {
  let registered = pluginActionHandlers.get(actionName)

  // Fallback: Jika actionName berformat plugin-<pluginName>-<actionName> atau memiliki prefix plugin-
  if (!registered && typeof actionName === 'string') {
    // 1. Cek exact match jika disimpan dengan prefix
    for (const [key, value] of pluginActionHandlers.entries()) {
      const fullKey = `plugin-${value.pluginName}-${value.actionName}`.toLowerCase()
      if (
        key.toLowerCase() === actionName.toLowerCase() ||
        fullKey === actionName.toLowerCase() ||
        actionName.toLowerCase().endsWith(`-${key.toLowerCase()}`) ||
        actionName.toLowerCase().endsWith(`_${key.toLowerCase()}`)
      ) {
        registered = value
        break
      }
    }
  }

  if (!registered) {
    return { success: false, error: `Action plugin '${actionName}' tidak ditemukan atau sedang dinonaktifkan.` }
  }

  try {
    const cleanQuery = normalizePluginQuery(query)

    // Buat polymorphic payload agar kompatibel dengan handler `{ query }` maupun `(query)` atau direct template literals
    const payload = {
      query: cleanQuery,
      ...(typeof query === 'object' && query !== null ? query : {}),
      toString: () => cleanQuery,
      valueOf: () => cleanQuery,
      [Symbol.toPrimitive]: () => cleanQuery
    }
    payload.query = cleanQuery

    const result = await registered.handler(payload)
    return { success: true, data: result }
  } catch (err) {
    console.error(`[Plugin Execution Error] ${actionName}:`, err)
    return { success: false, error: err.message }
  }
}

export async function savePluginDefinition(payload) {
  const { name, displayName, description, actions = [], dependencies = [], isEdit = false } = payload
  const cleanName = (name || '').replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
  if (!cleanName) {
    throw new Error('Nama plugin wajib diisi.')
  }

  const dir = getPluginsDirectory()
  const pluginDir = path.join(dir, cleanName)

  if (!isEdit && fs.existsSync(pluginDir)) {
    throw new Error(`Plugin dengan nama '${cleanName}' sudah ada.`)
  }

  if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir, { recursive: true })
  }

  const depsList = Array.isArray(dependencies)
    ? dependencies
    : typeof dependencies === 'string'
      ? dependencies.split(',').map((d) => d.trim()).filter(Boolean)
      : []

  const manifestActions = actions.map((act) => ({
    name: (act.name || '').trim().replace(/\s+/g, '_').toLowerCase(),
    description: act.description || '',
    triggerHint: act.triggerHint || '',
    code: act.code || 'return null;'
  }))

  const manifest = {
    name: cleanName,
    displayName: displayName || cleanName,
    description: description || '',
    version: '1.0.0',
    isEnabled: true,
    dependencies: depsList,
    actions: manifestActions
  }

  let jsCode = `// Auto-generated Plugin Module for MARK V5\n// Plugin: ${cleanName}\n\nexport default {\n`
  manifest.actions.forEach((act, idx) => {
    jsCode += `  '${act.name}': async ({ query }) => {\n`
    const lines = (act.code || 'return null;').split('\n')
    for (const l of lines) {
      jsCode += `    ${l}\n`
    }
    jsCode += `  }${idx < manifest.actions.length - 1 ? ',' : ''}\n\n`
  })
  jsCode += `};\n`

  await fs.promises.writeFile(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  await fs.promises.writeFile(path.join(pluginDir, 'index.js'), jsCode, 'utf-8')

  if (depsList.length > 0) {
    try {
      if (!fs.existsSync(path.join(pluginDir, 'package.json'))) {
        execSync('npm init -y', { cwd: pluginDir, stdio: 'ignore' })
      }
      execSync(`npm install ${depsList.join(' ')}`, { cwd: pluginDir, stdio: 'ignore' })
    } catch (npmErr) {
      console.error('[Plugin Dependencies] Gagal install npm dependencies:', npmErr)
    }
  }

  await loadAllPlugins()
  return manifest
}

export async function togglePluginState(pluginName, isEnabled) {
  const dir = getPluginsDirectory()
  const manifestPath = path.join(dir, pluginName, 'plugin.json')
  if (fs.existsSync(manifestPath)) {
    const raw = await fs.promises.readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(raw)
    manifest.isEnabled = isEnabled
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
    await loadAllPlugins()
    return true
  }
  return false
}

export async function deletePlugin(pluginName) {
  const dir = getPluginsDirectory()
  const pluginDir = path.join(dir, pluginName)
  if (fs.existsSync(pluginDir)) {
    await fs.promises.rm(pluginDir, { recursive: true, force: true })
    await loadAllPlugins()
    return true
  }
  return false
}
