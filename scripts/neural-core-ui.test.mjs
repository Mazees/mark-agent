import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
import {
  buildMemoryGraph,
  neuralTab
} from '../src/renderer/src/components/neural-core/neuralCoreData.js'

test('memory identities, graph links and existing tab aliases are preserved', () => {
  const graph = buildMemoryGraph({
    memories: [{ id: 'memory-uuid-42', memory: 'Ingatan', type: 'profile' }],
    archives: [{ id: 'archive-uuid-5', summary: 'Ringkasan', topic: 'Project' }],
    skills: [{ id: 'skill_uuid-6', name: 'read-doc', content: 'Panduan' }],
    diskSkills: [{ name: 'local-guide', description: 'Skill lokal' }]
  })
  assert.equal(graph.nodes.find((node) => node.kind === 'memory').recordId, 'memory-uuid-42')
  assert.equal(graph.nodes.find((node) => node.kind === 'archive').recordId, 'archive-uuid-5')
  assert.equal(graph.nodes.find((node) => node.kind === 'skill').recordId, 'skill_uuid-6')
  const ids = new Set(graph.nodes.map((node) => node.id))
  assert.ok(graph.links.every((link) => ids.has(link.source) && ids.has(link.target)))
  for (const [oldTab, newTab] of [
    ['tri-lobe', 'overview'],
    ['emotional', 'personality'],
    ['synaptic', 'memory'],
    ['procedural', 'skills'],
    ['journal', 'journal'],
    ['unknown', 'overview']
  ])
    assert.equal(neuralTab(oldTab), newTab)
})

const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,useNavigate,useLocation} from 'react-router-dom';import NeuralCore from '/src/pages/NeuralCore.jsx';import '/src/assets/main.css';
window.__groomed=0;function App(){const nav=useNavigate(),route=useLocation();window.__navigate=nav;window.__route=route.search;return <NeuralCore/>}createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/neural-core?tab=overview']}><App/></MemoryRouter>);
`
const groomFixture = `import {useState} from 'react';export function useMemoryGroomer(){const [busy,setBusy]=useState(false),[result,setResult]=useState({lastChecked:null});return {isGrooming:busy,groomResult:result,triggerGrooming:async()=>{setBusy(true);window.__groomed++;await new Promise(resolve=>setTimeout(resolve,120));const value={lastChecked:Date.now()};setResult(value);setBusy(false);return value}}}`

test(
  'Neural Core: navigation, searchable data, dialogs, graph sizing and data controls',
  { timeout: 180000 },
  async (t) => {
    const now = Date.now()
    let skills = [
      {
        id: 'skill_uuid-6',
        name: 'read-project-docs',
        description: 'Membaca dan merangkum dokumentasi project.',
        content: '# Panduan membaca\n\nBaca sumber sebelum menyimpulkan.',
        updatedAt: now
      },
      {
        id: 'skill-2',
        name: 'Panduan dengan nama yang panjang untuk menguji tampilan',
        description: 'Deskripsi panjang '.repeat(40),
        content: 'Panduan tambahan.',
        updatedAt: now
      }
    ]
    let memories = [
      {
        id: 'memory-uuid-42',
        type: 'profile',
        summary: 'Preferensi bahasa',
        memory: 'Pengguna memilih bahasa Indonesia.',
        created_at: now
      },
      {
        id: 'journal-old',
        type: 'journal',
        summary: 'Catatan lama',
        memory: 'Isi catatan lama.',
        created_at: now - 100000
      },
      {
        id: 'journal-new',
        type: 'private_journal',
        summary: 'Catatan terbaru',
        memory: 'Isi refleksi terbaru.',
        createdAt: now
      }
    ]
    let archives = [
      {
        id: 'archive-uuid-5',
        topic: 'Project',
        summary: 'Ringkasan percakapan project.',
        timestamp: now
      }
    ]
    const calls = [],
      errors = [],
      external = [],
      unexpected = []
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mark-neural-ui-'))
    const backup = path.join(dir, 'backup.json'),
      invalid = path.join(dir, 'invalid.json')
    await fs.writeFile(backup, '{"tables":{}}')
    await fs.writeFile(invalid, 'not-json')
    const virtualFile = path
      .resolve('src/renderer/src/__neural_core_fixture.jsx')
      .replaceAll('\\', '/')
    const vite = await createServer({
      configFile: path.resolve('vite.config.js'),
      server: { host: '127.0.0.1', port: 5190, open: false },
      plugins: [
        {
          name: 'neural-core-fixture',
          enforce: 'pre',
          resolveId(id) {
            if (id === '/src/__neural_core_fixture.jsx') return virtualFile
            if (id.endsWith('/hooks/useMemoryGroomer')) return '\0neural-groom-fixture'
          },
          load(id) {
            if (id === virtualFile) return entry
            if (id === '\0neural-groom-fixture') return groomFixture
          },
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== '/__neural-check') return next()
              const html = await server.transformIndexHtml(
                req.url,
                '<!doctype html><html data-theme="forest"><head><title>Neural Core</title></head><body><div id="root"></div><script type="module" src="/src/__neural_core_fixture.jsx"></script></body></html>'
              )
              res.setHeader('Content-Type', 'text/html')
              res.end(html)
            })
          }
        }
      ]
    })
    await vite.listen()
    const browser = await puppeteer.launch({
      executablePath:
        process.env.CHROME_BRIDGE_TEST_BROWSER ||
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    })
    t.after(async () => {
      await browser.close()
      await vite.close()
      assert.ok(dir.startsWith(path.join(os.tmpdir(), 'mark-neural-ui-')))
      await fs.rm(dir, { recursive: true, force: true })
    })
    const page = await browser.newPage()
    page.setDefaultNavigationTimeout(60000)
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      const url = new URL(request.url()),
        endpoint = url.pathname,
        method = request.method()
      if (!endpoint.startsWith('/api/')) {
        if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') {
          external.push(request.url())
          request.abort()
        } else request.continue()
        return
      }
      let data = null,
        status = 200,
        error
      calls.push({ endpoint, method })
      if (endpoint === '/api/relationships/owner')
        data = {
          userId: 'owner',
          warmth: 0.82,
          sarcasm_level: 0.57,
          trust: 0.84,
          energy: 0,
          obedience: 0.55,
          evalCount: 12,
          lastEvaluation: now,
          reasoning: 'Penyesuaian dari percakapan sebelumnya.'
        }
      else if (endpoint === '/api/learned-skills') data = skills
      else if (endpoint === '/api/memories') data = memories
      else if (endpoint === '/api/archives') data = archives
      else if (endpoint === '/api/skills')
        data = [{ name: 'local-guide', description: 'Panduan lokal pengguna.' }]
      else if (endpoint === '/api/db/export')
        data = { version: 5, tables: { memories: [], learned_skills: [] } }
      else if (endpoint === '/api/db/restore') {
        status = 400
        error = 'Cadangan simulasi ditolak.'
      } else if (endpoint === '/api/config') data = { aiProvider: 'fixture' }
      else if (method === 'DELETE' && endpoint.startsWith('/api/learned-skills/')) {
        const id = decodeURIComponent(endpoint.split('/').at(-1))
        skills = skills.filter((item) => String(item.id) !== id)
        data = true
      } else if (method === 'DELETE' && endpoint.startsWith('/api/memories/')) {
        const id = decodeURIComponent(endpoint.split('/').at(-1))
        memories = memories.filter((item) => String(item.id) !== id)
        data = true
      } else if (method === 'DELETE' && endpoint.startsWith('/api/archives/')) {
        const id = decodeURIComponent(endpoint.split('/').at(-1))
        archives = archives.filter((item) => String(item.id) !== id)
        data = true
      } else {
        unexpected.push(endpoint)
        data = []
      }
      request.respond({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ success: !error, data, error })
      })
    })
    await page.evaluateOnNewDocument(() => {
      const Native = window.WebSocket
      window.WebSocket = class extends Native {
        constructor(url, ...args) {
          if (String(url).endsWith('/stream'))
            return {
              readyState: 0,
              send() {},
              close() {},
              addEventListener() {},
              removeEventListener() {}
            }
          super(url, ...args)
        }
      }
    })
    const client = await page.createCDPSession()
    await client.send('Page.setDownloadBehavior', { behavior: 'deny' })
    const click = async (label) => {
      await page.waitForFunction(
        (label) =>
          [...document.querySelectorAll('button')].some(
            (el) => el.textContent.trim() === label && el.getClientRects().length
          ),
        {},
        label
      )
      await page.evaluate(
        (label) =>
          [...document.querySelectorAll('button')]
            .find((el) => el.textContent.trim() === label && el.getClientRects().length)
            .click(),
        label
      )
    }
    const text = () => page.evaluate(() => document.body.innerText)
    const shot = async (name) => {
      if (process.env.NEURAL_SCREENSHOT_DIR) {
        await fs.mkdir(process.env.NEURAL_SCREENSHOT_DIR, { recursive: true })
        await page.screenshot({
          path: path.join(process.env.NEURAL_SCREENSHOT_DIR, name + '.png'),
          fullPage: true
        })
      }
    }
    const closed = () => page.waitForFunction(() => !document.querySelector('dialog[open]'))
    await page.setViewport({ width: 1200, height: 940 })
    await page.goto('http://127.0.0.1:' + vite.httpServer.address().port + '/__neural-check', {
      waitUntil: 'domcontentloaded'
    })
    await page.waitForSelector('[aria-label="Ringkasan Neural Core"]')
    assert.match(await text(), /3 ingatan · 1 arsip/)
    await shot('neural-core-overview')
    await click('Karakter')
    await page.waitForSelector('meter')
    assert.equal(await page.$eval('meter[aria-label="Energi"]', (el) => el.value), 0)
    assert.match(await text(), /12 evaluasi/)
    await shot('neural-core-character')
    await page.evaluate(() => window.__navigate(-1))
    await page.waitForSelector('[aria-label="Ringkasan Neural Core"]')
    for (const [alias, selector] of [
      ['emotional', 'meter'],
      ['procedural', '[aria-label="Cari skill yang dipelajari"]'],
      ['synaptic', '[aria-label="Peta hubungan memori"]']
    ]) {
      await page.evaluate((alias) => window.__navigate('/neural-core?tab=' + alias), alias)
      await page.waitForSelector(selector)
    }
    assert.deepEqual(
      await page.$$eval('[aria-label="Tampilan memori"] button', (buttons) =>
        buttons.map((button) => [button.textContent.trim(), button.getAttribute('aria-pressed')])
      ),
      [
        ['Peta', 'true'],
        ['Daftar', 'false']
      ]
    )
    await click('Daftar')
    await page.waitForSelector('[aria-label="Cari memori"]')
    await page.type('[aria-label="Cari memori"]', 'Preferensi bahasa')
    await click('Preferensi bahasaIngatan tersimpan')
    await page.waitForSelector('dialog[open]')
    assert.match(await text(), /Pengguna memilih bahasa Indonesia/)
    await click('Hapus data')
    await click('Batal')
    assert.ok(memories.some((item) => item.id === 'memory-uuid-42'))
    await click('Hapus data')
    await click('Hapus data')
    await closed()
    assert.ok(!memories.some((item) => item.id === 'memory-uuid-42'))
    assert.ok(
      calls.some(
        (call) => call.endpoint === '/api/memories/memory-uuid-42' && call.method === 'DELETE'
      )
    )
    await page.focus('[aria-label="Cari memori"]')
    await page.keyboard.down('Control')
    await page.keyboard.press('a')
    await page.keyboard.up('Control')
    await page.keyboard.press('Backspace')
    await click('Skill lokal')
    await click('/local-guideSkill lokal')
    await page.waitForSelector('dialog[open]')
    assert.equal(
      await page.$$eval('dialog button', (els) =>
        els.some((el) => el.textContent.trim() === 'Hapus data')
      ),
      false
    )
    await page.keyboard.press('Escape')
    await closed()
    await click('Semua')
    await click('Peta')
    await page.waitForSelector('canvas')
    await page.waitForSelector('[aria-label="Peta hubungan memori"][aria-busy="false"]')
    const canvas = await page.$eval('canvas', (el) => ({
      width: el.getBoundingClientRect().width,
      parent: el.closest('[aria-label="Peta hubungan memori"]').getBoundingClientRect().width
    }))
    assert.ok(canvas.width <= canvas.parent)
    await shot('neural-core-memory')
    await click('Rapikan memori')
    await page.waitForFunction(() =>
      document.body.innerText.includes('Pemeriksaan memori selesai.')
    )
    assert.equal(await page.evaluate(() => window.__groomed), 1)
    await click('Skill dipelajari')
    await page.waitForSelector('[aria-label="Cari skill yang dipelajari"]')
    await page.type('[aria-label="Cari skill yang dipelajari"]', 'read-project')
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((el) => el.textContent.includes('read-project-docs'))
        .click()
    )
    await page.waitForSelector('dialog[open]')
    assert.match(await text(), /Panduan membaca/)
    await click('Hapus skill')
    await page.keyboard.press('Escape')
    await closed()
    assert.equal(skills.length, 2)
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((el) => el.textContent.includes('read-project-docs'))
        .click()
    )
    await page.waitForSelector('dialog[open]')
    await click('Hapus skill')
    await click('Hapus skill')
    await closed()
    assert.ok(
      calls.some(
        (call) => call.endpoint === '/api/learned-skills/skill_uuid-6' && call.method === 'DELETE'
      )
    )
    await click('Buku harian')
    await page.waitForSelector('#journal-title')
    assert.equal(await page.$eval('article h3', (el) => el.textContent), 'Catatan terbaru')
    await shot('neural-core-journal')
    await page.setViewport({ width: 390, height: 844 })
    await click('Kelola data')
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true
    )
    await shot('neural-core-mobile')
    await click('Unduh JSON')
    await page.waitForFunction(() =>
      document.body.innerText.includes('File cadangan JSON telah disiapkan')
    )
    const input = await page.$('input[type="file"]')
    await input.uploadFile(invalid)
    await page.waitForFunction(() => document.body.innerText.includes('File tidak dapat dibaca'))
    assert.equal(calls.filter((call) => call.endpoint === '/api/db/restore').length, 0)
    await input.uploadFile(backup)
    await page.waitForSelector('dialog[open]')
    await page.keyboard.press('Escape')
    await closed()
    assert.equal(calls.filter((call) => call.endpoint === '/api/db/restore').length, 0)
    await input.uploadFile(backup)
    await page.waitForSelector('dialog[open]')
    await click('Pulihkan data')
    await page.waitForFunction(() =>
      document.querySelector('dialog')?.textContent.includes('Cadangan simulasi ditolak.')
    )
    await page.keyboard.press('Escape')
    await closed()
    await click('Reset data')
    await page.waitForSelector('dialog[open]')
    await click('Lanjutkan')
    await page.waitForSelector('dialog input')
    await page.type('dialog input', 'RESET')
    assert.equal(
      await page.$$eval(
        'dialog button',
        (els) => els.find((el) => el.textContent.trim() === 'Reset data').disabled
      ),
      true
    )
    await page.type('dialog input', ' MARK')
    assert.equal(
      await page.$$eval(
        'dialog button',
        (els) => els.find((el) => el.textContent.trim() === 'Reset data').disabled
      ),
      false
    )
    await page.keyboard.press('Escape')
    await closed()
    assert.equal(calls.filter((call) => call.endpoint === '/api/db/reset-ai').length, 0)
    await click('Reset data')
    await page.waitForSelector('dialog[open]')
    assert.match(await page.$eval('dialog', (el) => el.textContent), /Reset data Mark/)
    await page.keyboard.press('Escape')
    await closed()
    await page.evaluate(() => window.__navigate('/neural-core?tab=overview'))
    await shot('neural-core-overview-mobile')
    assert.deepEqual(errors, [])
    assert.deepEqual(external, [])
    assert.deepEqual(unexpected, [])
  }
)
