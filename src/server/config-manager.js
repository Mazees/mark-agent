import path from 'path'
import fs from 'fs'
import os from 'os'

const CONFIG_DIR = path.join(os.homedir(), '.config', 'mark-agent')
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')

export function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (_) {}
  return {
    aiProvider: 'gemini-web',
    geminiWebModel: 'gemini-3.6-flash',
    model: 'local-model',
    customModel: 'default-model',
    temperature: 0.7,
    wakeWordEnabled: true,
    wakeWord: 'mark',
    voiceEnabled: true,
    voice: 'id-ID-ArdiNeural'
  }
}

export function saveConfig(newConfig) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8')
    return true
  } catch (_) {
    return false
  }
}

let activeConfig = loadConfig()

export function reloadConfig() {
  activeConfig = loadConfig()
  return activeConfig
}

export function getActiveConfig(forceReload = false) {
  if (forceReload) {
    return reloadConfig()
  }
  return activeConfig
}

export function setActiveConfig(newConfig) {
  activeConfig = newConfig
  return activeConfig
}
