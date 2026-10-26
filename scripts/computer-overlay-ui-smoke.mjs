import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const executablePath = [
  path.join(
    process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
    'Microsoft/Edge/Application/msedge.exe'
  ),
  path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe')
].find((candidate) => fs.existsSync(candidate))
assert.ok(executablePath, 'Edge atau Chrome diperlukan untuk menguji HTML lokal.')
const browser = await puppeteer.launch({ executablePath, headless: true })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.evaluateOnNewDocument(() => {
    window.hostEvents = []
    window.chrome = { webview: { postMessage: (value) => window.hostEvents.push(value) } }
  })
  await page.setViewport({ width: 1280, height: 720 })
  await page.goto(pathToFileURL(path.resolve('src/renderer/public/overlay-hud.html')).href)
  await page.evaluate(() => {
    window.markOverlay.control(true)
    window.markOverlay.position({
      x: 640,
      y: 360,
      width: 1280,
      height: 720,
      monitorLeft: 0,
      monitorTop: 0,
      monitorWidth: 1280,
      cursorVisible: true
    })
    window.markOverlay.update({
      sessionName: 'Mark Utama',
      detail: 'Menunggu hasil klik',
      cursorAction: 'click'
    })
  })
  await page.waitForFunction(() => window.hostEvents.includes('cursor-ready'))
  const desktop = await page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    pointerEvents: getComputedStyle(document.body).pointerEvents,
    shortcut: document.querySelector('.shortcut').textContent,
    cursor: getComputedStyle(document.getElementById('cursor')).opacity,
    title: document.getElementById('title').textContent
  }))
  assert.equal(desktop.background, 'rgba(0, 0, 0, 0)')
  assert.equal(desktop.pointerEvents, 'none')
  assert.equal(desktop.cursor, '1')
  assert.match(desktop.shortcut, /Ctrl\+Shift\+R/)
  assert.equal(desktop.title, 'Mark menggunakan komputer')
  fs.mkdirSync('.mark/computer-use-smoke', { recursive: true })
  await page.screenshot({
    path: '.mark/computer-use-smoke/overlay-desktop.png',
    omitBackground: true
  })
  await page.setViewport({ width: 320, height: 700 })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.evaluate(() => {
    window.markOverlay.control(false)
    window.markOverlay.position({
      x: 100,
      y: 200,
      width: 320,
      height: 700,
      monitorLeft: 0,
      monitorTop: 0,
      monitorWidth: 320,
      cursorVisible: false
    })
    window.markOverlay.update({
      sessionName: 'Minibot dengan nama panjang untuk pemeriksaan tata letak',
      detail:
        'Mengamati halaman dengan judul yang panjang untuk memastikan teks tetap berada dalam banner'
    })
  })
  const mobile = await page.evaluate(() => {
    const rect = document.getElementById('banner').getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      cursor: getComputedStyle(document.getElementById('cursor')).opacity,
      animation: getComputedStyle(document.querySelector('.activity')).animationName,
      lock: document.getElementById('lockState').textContent
    }
  })
  assert.ok(mobile.left >= 0 && mobile.right <= mobile.width)
  assert.ok(mobile.scroll <= mobile.width)
  assert.equal(mobile.cursor, '0')
  assert.equal(mobile.animation, 'none')
  assert.equal(mobile.lock, 'Mouse tersedia')
  assert.deepEqual(errors, [])
  await page.screenshot({
    path: '.mark/computer-use-smoke/overlay-small.png',
    omitBackground: true
  })
  console.log(
    'PASS: HTML transparan, Ctrl+Shift+R, cursor aktif/dilepas, judul panjang pada 320px, reduced motion, tanpa error browser.'
  )
} finally {
  await browser.close()
}
