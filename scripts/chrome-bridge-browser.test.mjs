/* global chrome */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'
import { build } from 'esbuild'
import { createChromeBridge } from '../src/main/addons/chrome-bridge/service.js'

const chromePath =
  process.env.CHROME_BRIDGE_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const available = await fs.stat(chromePath).catch(() => null)
const pause = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(condition) {
  for (let i = 0; i < 300; i++) {
    if (await condition()) return
    await pause()
  }
  throw new Error('Status browser belum tercapai.')
}
async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}

test(
  'real Chrome extension: pinned tab, React, navigation, screenshot, cancellation and reconnect',
  { skip: !available, timeout: 90000 },
  async (t) => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'mark-chrome-browser-'))
    let browser, service
    const fixtureBuild = await build({
      stdin: {
        contents: `import React, {useState} from 'react';import {createRoot} from 'react-dom/client';function Form(){const [text,setText]=useState('awal'),[count,setCount]=useState(0),[editor,setEditor]=useState('');return <><input aria-label="Nama" value={text} onChange={e=>setText(e.target.value)}/><output id="react-value">{text}</output><button id="counter" onClick={()=>setCount(count+1)}>Tambah</button><output id="count">{count}</output><div contentEditable suppressContentEditableWarning aria-label="Editor" onInput={e=>setEditor(e.currentTarget.textContent)}>awal</div><output id="editor-value">{editor}</output></>}createRoot(document.getElementById('app')).render(<Form/>);`,
        resolveDir: process.cwd(),
        loader: 'jsx'
      },
      bundle: true,
      write: false,
      format: 'iife'
    })
    const site = http.createServer((req, res) => {
      res.setHeader(
        'Content-Type',
        req.url === '/fixture.js' ? 'application/javascript' : 'text/html'
      )
      res.end(
        req.url === '/fixture.js'
          ? fixtureBuild.outputFiles[0].text
          : `<!doctype html><html><head><title>${req.url === '/other' ? 'OTHER TAB' : 'PINNED TAB'}</title><style>body{background:${req.url === '/other' ? '#802040' : '#1a7b42'};color:white;font:16px sans-serif;padding:32px;min-height:1800px}input,button,[contenteditable]{padding:12px;margin:12px;display:block}output{display:block}</style></head><body><h1>${req.url === '/other' ? 'OTHER TAB' : 'PINNED TAB'}</h1><div id="app"></div><script src="/fixture.js"></script></body></html>`
      )
    })
    const sitePort = await listen(site)
    const reserve = http.createServer(),
      bridgePort = await listen(reserve)
    await new Promise((resolve) => reserve.close(resolve))
    service = createChromeBridge({ home, port: bridgePort, helpTimeout: 5000 })
    const installed = await service.install()
    const pluginDirectory = path.join(home, 'Documents', 'Mark Plugins', 'chrome-use')
    const config = JSON.parse(
      await fs.readFile(path.join(pluginDirectory, 'connection.json'), 'utf8')
    )
    t.after(async () => {
      await browser?.close()
      await service.stop()
      await new Promise((resolve) => {
        site.close(resolve)
        site.closeAllConnections()
      })
      assert.ok(home.startsWith(path.join(os.tmpdir(), 'mark-chrome-browser-')))
      await fs.rm(home, { recursive: true, force: true })
    })
    const launch = () =>
      puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        protocolTimeout: 10000,
        userDataDir: path.join(home, 'profile'),
        enableExtensions: [installed.extensionDirectory],
        args: ['--no-first-run', '--no-default-browser-check']
      })
    browser = await launch()
    await until(async () => (await service.getStatus()).status === 'select-tab')
    const worker = await browser.waitForTarget((target) => target.type() === 'service_worker')
    const extensionOrigin = new URL(worker.url()).origin
    // URL.origin returns "null" for extension schemes in Node.
    const extensionUrl =
      extensionOrigin === 'null' ? worker.url().replace('/background.js', '') : extensionOrigin
    const pinned = await browser.newPage()
    await pinned.goto(`http://127.0.0.1:${sitePort}/fixture`)
    await pinned.waitForSelector('input')
    const other = await browser.newPage()
    await other.goto(`http://127.0.0.1:${sitePort}/other`)
    const popup = await browser.newPage()
    await popup.goto(`${extensionUrl}/popup.html`)
    assert.equal(await popup.evaluate(() => chrome.runtime.getManifest().name), 'Mark Agent Bridge')
    await popup.waitForFunction(() => document.querySelector('img.mark').naturalWidth > 0)
    const command = (type, extra = {}) =>
      popup.evaluate((type, extra) => chrome.runtime.sendMessage({ type, ...extra }), type, extra)
    const rpc = async (method, params = {}) => {
      const response = await fetch(`http://127.0.0.1:${bridgePort}/rpc`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params })
      })
      return { status: response.status, ...(await response.json()) }
    }
    await pinned.bringToFront()
    await popup.evaluate(() => document.querySelector('#select').click())
    await until(async () => (await service.getStatus()).status === 'connected')
    const pinnedId = (await service.getStatus()).controlledTab.id
    if (process.env.CHROME_BRIDGE_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.CHROME_BRIDGE_SCREENSHOT_DIR, { recursive: true })
      await popup.setViewport({ width: 350, height: 520 })
      await popup.screenshot({
        path: path.join(process.env.CHROME_BRIDGE_SCREENSHOT_DIR, 'mark-agent-bridge-popup.png'),
        fullPage: true
      })
    }
    await other.bringToFront()

    await t.test(
      'focus changes keep all actions on the selected tab, including React input',
      async () => {
        const read = await rpc('chrome-read')
        assert.equal(read.result.title, 'PINNED TAB')
        const inputId = read.result.elements.find((element) => element.text === 'Nama').id
        assert.equal(
          (await rpc('chrome-type', { element_id: inputId, text: 'Halo React' })).status,
          200
        )
        assert.equal(
          await pinned.$eval('#react-value', (element) => element.textContent),
          'Halo React'
        )
        assert.equal(await other.$eval('input', (element) => element.value), 'awal')
        const editorId = read.result.elements.find((element) => element.text === 'Editor').id
        assert.equal(
          (await rpc('chrome-type', { element_id: editorId, text: 'Isi editor' })).status,
          200
        )
        assert.equal(
          await pinned.$eval('#editor-value', (element) => element.textContent),
          'Isi editor'
        )
        const buttonId = read.result.elements.find((element) => element.text === 'Tambah').id
        await rpc('chrome-click', { element_id: buttonId })
        assert.equal(await pinned.$eval('#count', (element) => element.textContent), '1')
        const mismatch = await rpc('chrome-script', {
          script: 'document.title="WRONG"',
          urlPattern: '/other'
        })
        assert.equal(mismatch.status, 503)
        assert.equal(await other.title(), 'OTHER TAB')
        assert.equal((await service.getStatus()).controlledTab.id, pinnedId)
      }
    )

    await t.test('JavaScript executes and debugger failures never report success', async () => {
      assert.equal((await rpc('chrome-script', { script: '6*7' })).result.value, 42)
      assert.match(
        (await rpc('chrome-script', { script: 'throw new Error("script failed")' })).error,
        /script failed/
      )
      await popup.evaluate((id) => chrome.debugger.attach({ tabId: id }, '1.3'), pinnedId)
      const conflict = await rpc('chrome-script', { script: 'window.forbiddenMutation=true' })
      assert.equal(conflict.status, 503)
      assert.match(conflict.error, /Debugger Chrome gagal/)
      assert.equal(await pinned.evaluate(() => window.forbiddenMutation), undefined)
      const retained = await popup.evaluate(
        (id) =>
          chrome.debugger.sendCommand({ tabId: id }, 'Runtime.evaluate', {
            expression: '1+1',
            returnByValue: true
          }),
        pinnedId
      )
      assert.equal(retained.result.value, 2)
      await popup.evaluate((id) => chrome.debugger.detach({ tabId: id }), pinnedId)
    })

    await t.test(
      'navigation refreshes element registry and does not duplicate injections',
      async () => {
        assert.equal(
          (await rpc('chrome-navigate', { url: `http://127.0.0.1:${sitePort}/second` })).status,
          200
        )
        assert.equal((await service.getStatus()).controlledTab.id, pinnedId)
        await rpc('chrome-read')
        await rpc('chrome-read')
        assert.equal(
          await pinned.$$eval('[data-mark-bridge-overlay]', (elements) => elements.length),
          1
        )
        assert.equal((await rpc('chrome-extract', { selector: 'h1' })).result.data[0], 'PINNED TAB')
        await rpc('chrome-scroll', { direction: 'down' })
        assert.ok(await pinned.evaluate(() => scrollY > 0))
        await rpc('chrome-scroll', { direction: 'up' })
      }
    )

    await t.test('screenshot captures the pinned tab and becomes a chat artifact', async () => {
      await other.bringToFront()
      const engine = (await import(pathToFileURL(path.join(pluginDirectory, 'index.js')))).default
      const markdown = await engine['chrome-screenshot']({ query: 'chrome-proof' })
      assert.match(markdown, /^!\[.*\]\(\/api\/chat\/temp-file\//)
      const artifacts = path.join(home, '.config', 'mark-agent', 'temp-uploads')
      const [filename] = await fs.readdir(artifacts)
      const png = await fs.readFile(path.join(artifacts, filename))
      assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      const pixel = await other.evaluate(async (data) => {
        const image = new Image()
        image.src = `data:image/png;base64,${data}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0)
        return [...context.getImageData(2, 2, 1, 1).data]
      }, png.toString('base64'))
      assert.deepEqual(pixel.slice(0, 3), [26, 123, 66])
    })

    await t.test('help permits page interaction and pause removes pending help', async () => {
      const help = rpc('chrome-ask-user', { prompt: 'Silakan lanjutkan di halaman.' })
      await pinned.waitForSelector('[data-mark-bridge-ui]')
      await pinned.bringToFront()
      await pinned.click('#counter')
      assert.equal(await pinned.$eval('#count', (element) => element.textContent), '1')
      await command('pause')
      assert.equal((await help).status, 503)
      await until(async () => !(await pinned.$('[data-mark-bridge-ui]')))
      assert.equal((await service.getStatus()).status, 'paused')
      assert.equal((await rpc('chrome-click', { element_id: 1 })).status, 503)
      await command('pause')
      await until(async () => (await service.getStatus()).status === 'connected')
    })

    await t.test('socket reconnect preserves the selected tab and popup remains live', async () => {
      assert.equal((await command('reconnect')).success, true)
      await until(async () => (await service.getStatus()).status === 'connected')
      assert.equal((await service.getStatus()).controlledTab.id, pinnedId)
      await service.reconnect()
      await until(async () => (await service.getStatus()).status === 'connected')
      assert.equal((await service.getStatus()).controlledTab.id, pinnedId)
      assert.equal(await popup.$eval('#status', (element) => element.textContent), 'Terhubung')
      assert.equal((await command('disconnect')).success, true)
      await until(async () => (await service.getStatus()).status === 'select-tab')
      assert.equal((await rpc('chrome-read')).status, 503)
      assert.equal((await command('select-tab', { tabId: pinnedId })).success, true)
      await until(async () => (await service.getStatus()).status === 'connected')
    })

    await t.test(
      'service worker restart restores the selection within the same browser session',
      async () => {
        const protocol = await popup.createCDPSession()
        let version
        protocol.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
          version =
            versions.find(
              (item) => item.scriptURL === worker.url() && item.runningStatus === 'running'
            )?.versionId || version
        })
        await protocol.send('ServiceWorker.enable')
        await until(() => !!version)
        await protocol.send('ServiceWorker.stopWorker', { versionId: version })
        await command('get-status')
        await until(async () => (await service.getStatus()).status === 'connected')
        assert.equal((await service.getStatus()).controlledTab.id, pinnedId)
        await protocol.detach()
      }
    )

    await t.test(
      'closing the selected tab releases control, browser restart requires selection',
      async () => {
        assert.equal((await rpc('chrome-close')).status, 200)
        await until(async () => (await service.getStatus()).status === 'select-tab')
        assert.equal(await other.title(), 'OTHER TAB')
        await browser.close()
        browser = await launch()
        await until(async () => (await service.getStatus()).status === 'select-tab')
        assert.equal((await service.getStatus()).controlledTab, null)
        await service.uninstall()
        assert.equal((await service.getStatus()).status, 'not-installed')
      }
    )
  }
)
