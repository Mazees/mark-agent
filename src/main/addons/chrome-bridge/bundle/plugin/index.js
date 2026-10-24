import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

async function rpc(method, params = {}) {
  const config = JSON.parse(
    await fs.readFile(new URL('./connection.json', import.meta.url), 'utf8')
  )
  const data = JSON.stringify({ method, params })
  const result = await new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port: config.port,
        path: '/rpc',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
        timeout: method === 'chrome-ask-user' ? 305000 : 35000
      },
      (response) => {
        let body = ''
        response.on('data', (chunk) => {
          body += chunk
        })
        response.on('error', reject)
        response.on('end', () => {
          try {
            const parsed = JSON.parse(body)
            if (response.statusCode >= 400 || parsed.error)
              reject(new Error(parsed.error || 'Chrome Bridge gagal.'))
            else resolve(parsed.result)
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    request.on('error', (error) =>
      reject(
        new Error(
          error.code === 'ECONNREFUSED'
            ? 'Chrome Bridge belum aktif. Buka /addons/chrome-bridge dan periksa koneksi.'
            : error.message
        )
      )
    )
    request.on('timeout', () =>
      request.destroy(new Error('Chrome Bridge timeout. Periksa hasil sebelum mengulang aksi.'))
    )
    request.end(data)
  })
  if (result?.success === false || result?.error)
    throw new Error(result.error || 'Aksi Chrome gagal.')
  return { result, config }
}

function input(query) {
  const value = String(query || '').trim()
  return value.startsWith('{') ? JSON.parse(value) : value
}

function elementId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1)
    throw new Error('ID elemen harus bilangan bulat positif dari chrome-read.')
  return id
}

const output = async (method, params) => JSON.stringify((await rpc(method, params)).result, null, 2)

export default {
  'chrome-navigate': async ({ query }) => {
    const value = input(query)
    const raw = typeof value === 'object' ? value.url : value
    if (!raw) throw new Error('Masukkan URL tujuan.')
    if (
      /^[a-z][a-z\d+.-]*:/i.test(raw) &&
      !/^https?:/i.test(raw) &&
      !/^[\w.-]+:\d+(?:[/#?]|$)/.test(raw)
    )
      throw new Error('Hanya URL HTTP/HTTPS yang didukung.')
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (!['http:', 'https:'].includes(url.protocol))
      throw new Error('Hanya URL HTTP/HTTPS yang didukung.')
    return output('chrome-navigate', { url: url.href })
  },
  'chrome-read': async ({ query }) => {
    const { result } = await rpc('chrome-read', { reason: String(query || '') })
    return `Judul: ${result.title || '-'}\nURL: ${result.url || '-'}\n\n${(result.elements || []).map((el) => `[${el.id}] <${el.tag}> ${el.text}`).join('\n')}`
  },
  'chrome-click': async ({ query }) => {
    const value = input(query)
    return output('chrome-click', {
      element_id: elementId(typeof value === 'object' ? value.element_id : value)
    })
  },
  'chrome-type': async ({ query }) => {
    const value = input(query)
    const match = typeof value === 'string' ? value.match(/^(\d+)\s+([\s\S]*)$/) : null
    if (typeof value === 'string' && !match)
      throw new Error('Format: <id> <teks> atau JSON {element_id,text}.')
    return output('chrome-type', {
      element_id: elementId(match ? match[1] : value.element_id),
      text: String(match ? match[2] : (value.text ?? ''))
    })
  },
  'chrome-extract': async ({ query }) => {
    const value = input(query)
    return output('chrome-extract', typeof value === 'object' ? value : { selector: value })
  },
  'chrome-script': async ({ query, script, urlPattern }) => {
    let value = String(script || query || '')
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed.script === 'string') value = parsed
    } catch {
      /* Query juga menerima kode JavaScript mentah. */
    }
    return output(
      'chrome-script',
      typeof value === 'object' ? value : { script: value, urlPattern }
    )
  },
  'chrome-scroll': async ({ query }) =>
    output('chrome-scroll', { direction: String(query).trim() === 'up' ? 'up' : 'down' }),
  'chrome-screenshot': async ({ query }) => {
    const { result, config } = await rpc('chrome-screenshot')
    if (!/^data:image\/png;base64,/.test(result.dataUrl || ''))
      throw new Error('Chrome tidak mengembalikan gambar PNG.')
    const name = `${randomUUID()}-${path
      .basename(String(query || 'chrome.png'))
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .slice(0, 80)}.png`
    await fs.mkdir(config.artifactDir, { recursive: true })
    await fs.writeFile(
      path.join(config.artifactDir, name),
      Buffer.from(result.dataUrl.split(',')[1], 'base64')
    )
    return `![Tangkapan layar Chrome](/api/chat/temp-file/${encodeURIComponent(name)})`
  },
  'chrome-ask-user': async ({ query }) =>
    output('chrome-ask-user', {
      prompt: String(query || 'Selesaikan langkah yang diperlukan, lalu tekan Lanjutkan.')
    }),
  'chrome-close': async ({ query }) => output('chrome-close', { reason: String(query || '') })
}
