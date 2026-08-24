// Redirect console.log and console.info to stderr so stdout is 100% reserved for clean JSON RPC
console.log = (...args) => console.error('[LOG]', ...args)
console.info = (...args) => console.error('[INFO]', ...args)

import readline from 'readline'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { NATIVE_TOOLS } from './node-tools.js'
import { fetchAI, abortAllFetches, setGlobalConfig } from './ai-bridge.js'
import {
  startTelegramBot,
  stopTelegramBot,
  getConnectionStatus,
  uiMessageHistory,
  sendTelegramMessage,
  sendTelegramToAdmins
} from './telegram/telegram-service.js'
import {
  getSkills,
  readSkill,
  saveSkill,
  deleteSkill,
  installSkillFromZip,
  getSkillFileTree,
  readSkillFile,
  saveSkillFile,
  createSkillItem,
  deleteSkillItem,
  renameSkillItem,
  setupSkillWatcher
} from './skills/skill-manager.js'
import {
  loadPlugins,
  executePlugin,
  getPluginsDir,
  createPlugin,
  togglePlugin,
  deletePlugin
} from './plugins/plugin-loader.js'
import { connectGoogle, disconnectGoogle, getGoogleStatus } from './google/google-service.js'
import { setBrowserEventEmitter } from './browser-agent.js'
import { generateEmbedding, generateEmbeddingBatch } from './services/vector-service.js'
import { setPCEventBridge, triggerEmergencyStop, resolveAskUserPC } from './pc-agent.js'

// Setup stdio JSON RPC interface
const rl = readline.createInterface({
  input: process.stdin,
  terminal: false
})

function sendResponse(id, success, data = null, error = null) {
  const message = JSON.stringify({ id, success, data, error })
  process.stdout.write(message + '\n')
}

function emitEvent(event, payload) {
  const message = JSON.stringify({ event, payload })
  process.stdout.write(message + '\n')
}

// Connect browser & PC automation events to Tauri / React bridge
try {
  setBrowserEventEmitter(emitEvent)
  setPCEventBridge(emitEvent)
} catch (e) {
  console.error('[NodeEngine] Emitter init error:', e)
}

// Mock window event bridge that redirects webContents.send(...) to stdout emitEvent(...)
const eventBridge = {
  webContents: {
    send: (event, payload) => emitEvent(event, payload),
    isDestroyed: () => false
  }
}

// Setup skill file watcher with event bridge
try {
  setupSkillWatcher(eventBridge)
} catch (e) {
  console.error('[NodeEngine] Skill watcher init error:', e)
}

console.error('[NodeEngine] MARK Node.js Backend Engine initialized. Ready for operations.')

rl.on('line', async (line) => {
  const trimmed = line.trim()
  if (!trimmed) return

  let request
  try {
    request = JSON.parse(trimmed)
  } catch (err) {
    console.error('[NodeEngine] Invalid JSON request:', trimmed)
    return
  }

  const { id, action, payload } = request

  try {
    switch (action) {
      case 'ping': {
        sendResponse(id, true, { status: 'alive', uptime: process.uptime() })
        break
      }

      // --- PC Automation Emergency Stop & User Prompt Response ---
      case 'triggerPCEmergencyStop': {
        const res = triggerEmergencyStop(payload?.reason)
        sendResponse(id, true, res)
        break
      }

      case 'resolveAskUserPC': {
        const res = resolveAskUserPC(payload?.response)
        sendResponse(id, true, { success: res })
        break
      }

      // --- Native Tools Execution ---
      case 'executeNativeTool': {
        const { toolName, query, config } = payload || {}

        // 1. Check Skill Manager specific tools
        if (toolName === 'get-skills') {
          const skills = await getSkills()
          sendResponse(id, true, skills)
          return
        }
        if (toolName === 'read-skill') {
          const res = await readSkill(query)
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'save-skill') {
          const [name, ...contentParts] = (query || '').split('||')
          const res = await saveSkill(name, contentParts.join('||'))
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'delete-skill') {
          const res = await deleteSkill(query)
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'install-skill') {
          const res = await installSkillFromZip(query)
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'get-skill-tree') {
          const res = await getSkillFileTree(query)
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'read-skill-file') {
          const [name, relPath] = (query || '').split('||')
          const res = await readSkillFile(name, relPath)
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'save-skill-file') {
          const [name, relPath, ...contentParts] = (query || '').split('||')
          const res = await saveSkillFile(name, relPath, contentParts.join('||'))
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'create-skill-item') {
          const [name, relPath, isFolder] = (query || '').split('||')
          const res = await createSkillItem(name, relPath, isFolder === 'true')
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'delete-skill-item') {
          const [name, relPath] = (query || '').split('||')
          const res = await deleteSkillItem(name, relPath)
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'rename-skill-item') {
          const [name, oldPath, newPath] = (query || '').split('||')
          const res = await renameSkillItem(name, oldPath, newPath)
          sendResponse(id, true, res)
          return
        }

        // 2. Check Plugin Manager tools
        if (toolName === 'get-plugins' || toolName === 'reload-plugins') {
          const plugins = await loadPlugins()
          sendResponse(id, true, plugins)
          return
        }
        if (toolName === 'execute-plugin') {
          const [actName, pQuery] = (query || '').split('||')
          const res = await executePlugin(actName, pQuery)
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'open-plugin-folder') {
          const dir = getPluginsDir()
          sendResponse(id, true, dir)
          return
        }
        if (toolName === 'create-plugin') {
          const pData = typeof query === 'string' ? JSON.parse(query) : query
          const res = await createPlugin(pData)
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'toggle-plugin') {
          const [pName, isEnabled] = (query || '').split('||')
          const res = await togglePlugin(pName, isEnabled === 'true')
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'delete-plugin') {
          const res = await deletePlugin(query)
          sendResponse(id, true, res)
          return
        }

        // 3. Check Telegram Bot tools
        if (toolName === 'tg-start') {
          await startTelegramBot(query, eventBridge)
          sendResponse(id, true, { status: 'started' })
          return
        }
        if (toolName === 'tg-stop') {
          stopTelegramBot()
          sendResponse(id, true, { status: 'stopped' })
          return
        }
        if (toolName === 'tg-status') {
          const st = getConnectionStatus()
          sendResponse(id, true, st)
          return
        }
        if (toolName === 'tg-history') {
          sendResponse(id, true, uiMessageHistory)
          return
        }
        if (toolName === 'tg-send') {
          const [chatId, ...textParts] = (query || '').split('||')
          const res = await sendTelegramMessage(chatId, textParts.join('||'))
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'tg-broadcast') {
          await sendTelegramToAdmins(query)
          sendResponse(id, true, { status: 'broadcasted' })
          return
        }
        if (toolName === 'tg-agent-done') {
          sendResponse(id, true, { status: 'resolved' })
          return
        }

        // 4. Check Google Workspace tools
        if (toolName === 'google-connect') {
          const [clientId, clientSecret] = (query || '').split('||')
          const res = await connectGoogle(clientId, clientSecret)
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'google-disconnect') {
          const res = await disconnectGoogle()
          sendResponse(id, true, res)
          return
        }
        if (toolName === 'google-status') {
          const res = await getGoogleStatus()
          sendResponse(id, true, res)
          return
        }

        // 5. Standard NATIVE_TOOLS registry (File CRUD, PowerShell, etc.)
        const tool = NATIVE_TOOLS[toolName]
        if (!tool) {
          sendResponse(id, false, null, `Tool '${toolName}' tidak ditemukan di Node.js registry.`)
          return
        }
        const result = await tool.handler(query, config)
        sendResponse(id, true, result)
        break
      }

      // --- Tool Approval Check ---
      case 'checkToolApproval': {
        const { toolName, query } = payload || {}
        const tool = NATIVE_TOOLS[toolName]
        if (!tool) {
          sendResponse(id, true, { needsApproval: false, message: null })
          return
        }
        const needs = typeof tool.needsApproval === 'function' ? tool.needsApproval(query) : !!tool.needsApproval
        const message = needs && tool.approvalMessage ? tool.approvalMessage(query) : null
        sendResponse(id, true, { needsApproval: needs, message })
        break
      }

      // --- Vector Embedding Engine (Node.js Native) ---
      case 'generateEmbedding': {
        const { text } = payload || {}
        const vector = await generateEmbedding(text)
        sendResponse(id, true, { vector })
        break
      }

      case 'generateEmbeddingBatch': {
        const { items } = payload || {}
        const results = await generateEmbeddingBatch(items)
        sendResponse(id, true, { results })
        break
      }

      // --- AI HTTP Bridge ---
      case 'fetchAI': {
        const { messages, config, isSmallTask, jsonSchema } = payload || {}
        const onStatus = (msg) => {
          emitEvent('ai-status', msg)
        }
        const result = await fetchAI(messages, config, isSmallTask, jsonSchema, onStatus)
        sendResponse(id, true, result)
        break
      }

      case 'abortFetchAI': {
        abortAllFetches()
        sendResponse(id, true, { status: 'aborted' })
        break
      }

      case 'syncConfig': {
        const { config } = payload || {}
        setGlobalConfig(config)
        sendResponse(id, true, { status: 'synced' })
        break
      }

      // --- Document Parsing ---
      case 'parseDocument': {
        const { data, isDocx } = payload || {}
        const buffer = Buffer.from(data)
        if (isDocx) {
          const mammoth = await import('mammoth')
          const result = await mammoth.extractRawText({ buffer })
          sendResponse(id, true, result.value)
        } else {
          const { PDFParse } = await import('pdf-parse')
          const parser = new PDFParse({ data: buffer })
          const res = await parser.getText()
          sendResponse(id, true, res.text)
        }
        break
      }

      default: {
        sendResponse(id, false, null, `Unknown action '${action}'`)
      }
    }
  } catch (err) {
    console.error(`[NodeEngine] Error handling action '${action}':`, err)
    sendResponse(id, false, null, err.message || String(err))
  }
})

// Send initial ready signal
emitEvent('engine-ready', { pid: process.pid, nodeVersion: process.version })
