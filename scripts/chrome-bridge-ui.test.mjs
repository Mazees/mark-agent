import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'

const chromePath =
  process.env.CHROME_BRIDGE_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const available = await fs.stat(chromePath).catch(() => null)
const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
import AddonDetailRoute from '/src/pages/AddonDetailRoute.jsx';import Addons from '/src/pages/Addons.jsx';import {webApi} from '/src/api/web-bridge.js';import '/src/assets/main.css';
let state={installed:false,status:'not-installed',legacyPlugin:true,availableVersion:'1.1.0',extensionDirectory:'C:\\\\Users\\\\Nama Pengguna\\\\.config\\\\mark-agent\\\\addons\\\\chrome-bridge\\\\extension'},listeners=new Set();
window.__bridgeOperations=[];window.__setBridgeState=(next)=>{state={...state,...next};listeners.forEach(cb=>cb(state));window.dispatchEvent(new Event('mark-addon-status-changed'))};
webApi.chromeBridgeRequest=async(op='status',values={})=>{if(op==='status')return {...state};window.__bridgeOperations.push(op);if(op==='install'){if(state.legacyPlugin&&!values.replaceExisting)throw Object.assign(new Error('Plugin lama ditemukan'),{code:'LEGACY_PLUGIN_EXISTS'});window.__setBridgeState({installed:true,status:'waiting-extension',version:'1.1.0',legacyPlugin:false})}if(op==='uninstall')window.__setBridgeState({installed:false,status:'not-installed',controlledTab:null,error:null});return {...state}};
webApi.onChromeBridgeStatus=cb=>{listeners.add(cb);return()=>listeners.delete(cb)};webApi.googleStatus=async()=>({success:true,isConnected:false});let telegramConnected=false,googleConnected=new URLSearchParams(location.search).has('connected');webApi.googleStatus=async()=>({success:true,isConnected:googleConnected});webApi.googleDisconnect=async()=>{googleConnected=false;return {success:true}};webApi.onTgConnection=()=>()=>{};webApi.tgGetStatus=async()=>({success:true,status:telegramConnected?'connected':'disconnected'});webApi.tgStart=async()=>{telegramConnected=true;return {success:true}};webApi.tgStop=async()=>{telegramConnected=false;return {success:true}};webApi.syncConfig=async()=>({});
function Draft(){const route=useLocation();return <p data-draft>{route.state?.composerDraft}</p>}
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/addons/'+(new URLSearchParams(location.search).get('addon')||'chrome-bridge')]}><Routes><Route path='/addons/:addonId' element={<AddonDetailRoute/>}/><Route path='/addons' element={<Addons/>}/><Route path='/chat' element={<Draft/>}/></Routes></MemoryRouter>);
`

test(
  'addon detail: all states, legacy confirmation, keyboard, long text and narrow layout',
  { skip: !available, timeout: 90000 },
  async (t) => {
    const virtualFile = path
      .resolve('src/renderer/src/__chrome_bridge_fixture.jsx')
      .replaceAll('\\', '/')
    const vite = await createServer({
      configFile: path.resolve('vite.config.js'),
      server: { host: '127.0.0.1', port: 0, open: false },
      plugins: [
        {
          name: 'chrome-bridge-ui-fixture',
          enforce: 'pre',
          resolveId(id) {
            if (id === '/src/__chrome_bridge_fixture.jsx') return virtualFile
          },
          load(id) {
            if (id === virtualFile) return entry
          },
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (new URL(req.url, 'http://fixture').pathname !== '/__bridge-check') return next()
              const html = await server.transformIndexHtml(
                req.url,
                '<!doctype html><html data-theme="forest"><head><title>Chrome Bridge</title></head><body><div id="root"></div><script type="module" src="/src/__chrome_bridge_fixture.jsx"></script></body></html>'
              )
              res.setHeader('Content-Type', 'text/html')
              res.end(html)
            })
          }
        }
      ]
    })
    await vite.listen()
    const browser = await puppeteer.launch({ executablePath: chromePath, headless: true })
    t.after(async () => {
      await browser.close()
      await vite.close()
    })
    const page = await browser.newPage()
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/'))
        request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { tgBotToken: '', tgAdminIds: '' } })
        })
      else request.continue()
    })
    await page.evaluateOnNewDocument(() => {
      const NativeWebSocket = window.WebSocket
      window.WebSocket = class extends NativeWebSocket {
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
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewport({ width: 1100, height: 940 })
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__bridge-check`, {
      waitUntil: 'domcontentloaded'
    })
    await page.waitForSelector('h1')
    const text = () => page.evaluate(() => document.body.innerText)
    const button = (label) =>
      page.evaluate((label) => {
        const match = [...document.querySelectorAll('button')].find(
          (element) => element.textContent.trim() === label
        )
        if (!match) throw new Error('Tombol tidak ditemukan: ' + label)
        match.click()
      }, label)
    assert.match(await text(), /Chrome Bridge/)
    assert.match(await text(), /Belum dipasang/)
    await button('Install')
    await page.waitForSelector('dialog[open]')
    assert.equal(await page.evaluate(() => document.activeElement.closest('dialog') !== null), true)
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('dialog[open]'))
    assert.deepEqual(await page.evaluate(() => window.__bridgeOperations), [])
    await button('Install')
    await page.waitForSelector('dialog[open]')
    await button('Cadangkan dan ganti')
    await page.waitForSelector('#chrome-extension-location')
    assert.match(await text(), /Menunggu ekstensi/)
    for (const [status, label] of [
      ['select-tab', 'Pilih tab'],
      ['connected', 'Terhubung'],
      ['paused', 'Dijeda'],
      ['error', 'Gagal']
    ]) {
      await page.evaluate(
        (status) =>
          window.__setBridgeState({
            status,
            controlledTab:
              status === 'select-tab'
                ? null
                : {
                    id: 9,
                    title: 'Dokumen dan formulir milik pengguna dengan judul yang panjang '.repeat(
                      3
                    ),
                    url: 'https://example.test/' + 'halaman/'.repeat(35)
                  },
            error:
              status === 'error'
                ? 'Port 8765 sedang dipakai. Tutup bridge lama lalu coba lagi.'
                : null
          }),
        status
      )
      await page.waitForFunction(
        (label) => document.querySelector('#chrome-bridge-connection').textContent === label,
        {},
        label
      )
      assert.match(await text(), new RegExp(label))
    }
    await page.evaluate(() =>
      window.__setBridgeState({
        status: 'connected',
        error: null,
        controlledTab: {
          id: 9,
          title: 'Rencana kerja · Google Docs',
          url: 'https://docs.google.com/document/d/contoh'
        }
      })
    )
    await page.waitForFunction(
      () => document.querySelector('#chrome-bridge-connection').textContent === 'Terhubung'
    )
    if (process.env.CHROME_BRIDGE_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.CHROME_BRIDGE_SCREENSHOT_DIR, { recursive: true })
      await page.screenshot({
        path: path.join(process.env.CHROME_BRIDGE_SCREENSHOT_DIR, 'chrome-bridge-detail.png'),
        fullPage: true
      })
    }
    await page.setViewport({ width: 390, height: 844 })
    await page.evaluate(() =>
      window.__setBridgeState({
        controlledTab: {
          id: 9,
          title: 'Judul panjang '.repeat(20),
          url: 'https://example.test/' + 'panjang'.repeat(100)
        }
      })
    )
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true
    )
    await button('Uninstall')
    await page.waitForSelector('dialog[open]')
    assert.equal(await page.evaluate(() => document.activeElement.closest('dialog') !== null), true)
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('dialog[open]'))
    await button('Uninstall')
    await page.waitForSelector('dialog[open]')
    await page.evaluate(() =>
      [...document.querySelectorAll('dialog button')]
        .find((element) => element.textContent.trim() === 'Uninstall')
        .click()
    )
    await page.waitForFunction(
      () => document.querySelector('#chrome-bridge-connection').textContent === 'Belum dipasang'
    )
    assert.match(await text(), /Hapus juga ekstensi/)
    assert.equal(await page.$$eval('main', (elements) => elements.length), 1)
    assert.equal(
      await page.$$eval('section[aria-label="Contoh penggunaan"]', (elements) => elements.length),
      1
    )
    assert.equal(
      await page.$eval(
        '[data-addon-content]',
        (element) => element.querySelector('section[aria-label="Contoh penggunaan"]') === null
      ),
      true
    )
    const fixtureUrl = 'http://127.0.0.1:' + vite.httpServer.address().port + '/__bridge-check'
    await page.goto(fixtureUrl + '?addon=google-workspace', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () => document.querySelector('h1')?.textContent === 'Google Workspace'
    )
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (element) => element.textContent.trim() === 'Install'
      )
    )
    assert.equal(await page.$$eval('main', (elements) => elements.length), 1)
    assert.equal(
      await page.$$eval(
        'section[aria-label="Contoh penggunaan"] button',
        (elements) => elements.length
      ),
      3
    )
    await button('Install')
    await page.waitForSelector('[data-draft]')
    assert.equal(
      await page.$eval('[data-draft]', (element) => element.textContent),
      '/setup-google-workspace '
    )
    await page.goto(fixtureUrl + '?addon=google-workspace&connected=1', {
      waitUntil: 'domcontentloaded'
    })
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (element) => element.textContent.trim() === 'Uninstall'
      )
    )
    await button('Uninstall')
    await page.waitForSelector('dialog[open]')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('dialog'))
    await page.goto(fixtureUrl + '?addon=telegram', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#telegram-addon-settings')
    assert.equal(await page.$$eval('main', (elements) => elements.length), 1)
    assert.equal(
      await page.$$eval(
        'section[aria-label="Contoh penggunaan"] button',
        (elements) => elements.length
      ),
      3
    )
    await page.type('input[type="password"]', 'fixture-token')
    await button('Install')
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (element) => element.textContent.trim() === 'Putuskan koneksi'
      )
    )
    await button('Putuskan koneksi')
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (element) => element.textContent.trim() === 'Install'
      )
    )
    assert.deepEqual(errors, [])
  }
)
