import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createMcpOAuth } from './mcp-oauth.js'
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'

export function mcpToolName(addonId, toolName) {
  return (
    'mcp_' +
    createHash('sha256')
      .update(addonId + '\0' + toolName)
      .digest('hex')
      .slice(0, 32)
  )
}
function wrapInputSchema(value) {
  if (Array.isArray(value)) return value.map(wrapInputSchema)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === '$ref' && typeof item === 'string' && (item === '#' || item.startsWith('#/'))
        ? '#/properties/arguments' + item.slice(1)
        : wrapInputSchema(item)
    ])
  )
}
export function createMcpRuntime({ store, vault, onChange = () => {} }) {
  const sessions = new Map()
  const status = (id) => sessions.get(id)?.status || 'disconnected'
  const notify = (id) => onChange(id, status(id))
  async function disconnect(id) {
    const s = sessions.get(id)
    sessions.delete(id)
    if (s?.oauth) s.oauth.close()
    if (s?.client) await s.client.close().catch(() => {})
    notify(id)
  }
  async function connect(id, { authProvider } = {}) {
    await disconnect(id)
    const addon = store.get(id)
    if (!addon || !addon.enabled) throw new Error('Add-on tidak tersedia atau dinonaktifkan.')
    const state = { status: 'connecting', client: null, tools: [] }
    sessions.set(id, state)
    notify(id)
    let client
    try {
      const secret = await vault.read(id)
      if (sessions.get(id) !== state) throw new Error('Koneksi dibatalkan.')
      let transport
      let oauth = authProvider
      if (addon.type === 'stdio') {
        const env = Object.fromEntries(
          addon.envKeys
            .filter((key) => secret.env?.[key] !== undefined)
            .map((key) => [key, String(secret.env[key])])
        )
        let command = addon.command,
          args = addon.args
        if (process.platform === 'win32' && /^(npx|npm)(\.cmd)?$/i.test(command)) {
          const bin = command.toLowerCase().startsWith('npx') ? 'npx-cli.js' : 'npm-cli.js'
          const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', bin)
          if (!fs.existsSync(cli))
            throw new Error('npm atau npx tidak ditemukan di instalasi Node.js.')
          command = process.execPath
          args = [cli, ...args]
        }
        transport = new StdioClientTransport({
          command,
          args,
          env,
          stderr: 'ignore'
        })
      } else {
        if (addon.auth === 'bearer' && !secret.token) throw new Error('Token MCP belum diisi.')
        if (addon.auth === 'oauth' && !oauth) {
          state.oauth = await createMcpOAuth({
            id,
            vault,
            onComplete: async (code) => {
              if (sessions.get(id) !== state) throw new Error('Login dibatalkan.')
              if (!code) {
                state.status = 'error'
                notify(id)
                return
              }
              try {
                await transport.finishAuth(code)
                if (sessions.get(id) !== state) throw new Error('Login dibatalkan.')
                await connect(id, { authProvider: state.oauth.provider })
              } catch (error) {
                if (sessions.get(id) === state) {
                  state.status = 'error'
                  notify(id)
                }
                throw error
              }
            }
          })
          if (sessions.get(id) !== state) {
            state.oauth.close()
            throw new Error('Koneksi dibatalkan.')
          }
          oauth = state.oauth.provider
        }
        transport = new StreamableHTTPClientTransport(new URL(addon.url), {
          authProvider: oauth,
          requestInit:
            addon.auth === 'bearer'
              ? { headers: { Authorization: 'Bearer ' + secret.token } }
              : undefined
        })
      }
      client = new Client({ name: 'mark-agent', version: '1.0.0' })
      state.client = client
      client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
        try {
          const refreshed = []
          let next
          do {
            const page = await client.listTools(next ? { cursor: next } : {}, { timeout: 15000 })
            refreshed.push(...page.tools)
            next = page.nextCursor
          } while (next)
          if (sessions.get(id) !== state) return
          store.discoverTools(
            id,
            refreshed.map((tool) => tool.name)
          )
          state.tools = refreshed
          notify(id)
        } catch {
          /* Keep the previous list until a later successful refresh. */
        }
      })
      client.onclose = () => {
        if (sessions.get(id) === state) {
          state.status = 'disconnected'
          state.tools = []
          notify(id)
        }
      }
      await client.connect(transport, { timeout: 15000 })
      const tools = []
      let cursor
      do {
        const page = await client.listTools(cursor ? { cursor } : {}, { timeout: 15000 })
        tools.push(...page.tools)
        cursor = page.nextCursor
      } while (cursor)
      if (sessions.get(id) !== state) throw new Error('Koneksi dibatalkan.')
      const updated = store.discoverTools(
        id,
        tools.map((tool) => tool.name)
      )
      state.tools = tools
      state.status = 'connected'
      notify(id)
      return tools.map(({ name, description, title }) => ({
        name,
        description,
        title,
        enabled: updated.enabledTools.includes(name)
      }))
    } catch (error) {
      if (client) await client.close().catch(() => {})
      if (sessions.get(id) === state) {
        state.status = state.oauth?.getAuthorizationUrl() ? 'needs-login' : 'error'
        notify(id)
      }
      throw error
    }
  }
  function available(id) {
    const entry = store.get(id),
      state = sessions.get(id)
    if (!entry || !entry.enabled || state?.status !== 'connected') return []
    return state.tools
      .filter((tool) => entry.enabledTools.includes(tool.name))
      .map((tool) => ({
        originalName: tool.name,
        type: 'function',
        function: {
          name: mcpToolName(id, tool.name),
          description: tool.description || tool.name,
          parameters: {
            type: 'object',
            properties: {
              arguments: wrapInputSchema(tool.inputSchema || { type: 'object', properties: {} })
            },
            required: ['arguments'],
            additionalProperties: false
          }
        }
      }))
  }
  async function call(id, toolName, args, options = {}) {
    const addon = store.get(id),
      state = sessions.get(id)
    if (!addon || !addon.enabled || !addon.enabledTools.includes(toolName))
      throw new Error('Tool MCP tidak diaktifkan.')
    if (state?.status !== 'connected' || !state.tools.some((t) => t.name === toolName))
      throw new Error('MCP tidak terhubung atau tool tidak tersedia.')
    return state.client.callTool({ name: toolName, arguments: args }, undefined, {
      signal: options.signal,
      timeout: 60000
    })
  }
  return {
    connect,
    disconnect,
    status,
    available,
    call,
    authorizationUrl: (id) => sessions.get(id)?.oauth?.getAuthorizationUrl() || null,
    tools: (id) =>
      (sessions.get(id)?.tools || []).map(({ name, title, description }) => ({
        name,
        title,
        description,
        enabled: store.get(id)?.enabledTools.includes(name) || false
      })),
    shutdown: () => Promise.allSettled([...sessions.keys()].map(disconnect))
  }
}
