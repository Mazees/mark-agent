import { build } from 'esbuild'
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'jsx',
    contents: `
      import React, {useEffect} from 'react';
      import {createRoot} from 'react-dom/client';
      import {MemoryRouter} from 'react-router-dom';
      import {ApprovalProvider,useApproval} from './src/renderer/src/contexts/ApprovalContext.jsx';
      window.api={};window.savedPermissions=0;window.autoChecks=0;
      function Harness(){const {requestApproval}=useApproval();useEffect(()=>{
        window.promptComputerUse=()=>{window.decision='pending';requestApproval('Mouse dikunci sampai sesi ditutup. Ctrl+Shift+R untuk membatalkan.','computer_use',{action:'open_session'},{sessionId:'1',forcePrompt:true}).then(value=>window.decision=value)};
        window.promptNormal=()=>{window.decision='pending';requestApproval('Normal','run-powershell',{command:'example'},{sessionId:'1'}).then(value=>window.decision=value)};
      },[requestApproval]);return null;}
      createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/settings']}><ApprovalProvider><Harness/></ApprovalProvider></MemoryRouter>);
    `
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'fixture-database',
      setup(api) {
        api.onResolve({ filter: /api\/db$/ }, () => ({ path: 'db', namespace: 'fixture' }))
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          loader: 'js',
          contents:
            'export const getAlwaysAllowedPaths=async()=>[];export const addAlwaysAllowedPath=async()=>{window.savedPermissions++;return[]};export const getSessionAutoMode=async()=>{window.autoChecks++;return true};'
        }))
      }
    }
  ]
})
const executablePath = [
  path.join(
    process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
    'Microsoft/Edge/Application/msedge.exe'
  ),
  path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe')
].find((candidate) => fs.existsSync(candidate))
const browser = await puppeteer.launch({ executablePath, headless: true })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setContent('<div id="root"></div>')
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  await page.waitForFunction(() => typeof window.promptComputerUse === 'function')
  await page.evaluate(() => window.promptComputerUse())
  await page.waitForSelector('button')
  assert.equal(
    await page.evaluate(() => window.decision),
    'pending',
    'Auto Mode tidak boleh menyetujui sesi secara otomatis.'
  )
  assert.deepEqual(
    await page.$$eval('button', (buttons) => buttons.map((button) => button.textContent.trim())),
    ['Tolak', 'Izinkan Computer Use']
  )
  const allow = (await page.$$('button'))[1]
  await allow.focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(
    () => window.decision === true && document.querySelectorAll('button').length === 0
  )
  await page.evaluate(() => window.promptComputerUse())
  await page.waitForSelector('button')
  assert.equal(
    await page.evaluate(() => window.decision),
    'pending',
    'Sesi berikutnya tetap membutuhkan izin baru.'
  )
  await (await page.$$('button'))[0].click()
  await page.waitForFunction(() => window.decision === false)
  assert.equal(await page.evaluate(() => window.savedPermissions), 0)
  assert.equal(await page.evaluate(() => window.autoChecks), 0)
  await page.evaluate(() => window.promptNormal())
  await page.waitForFunction(() => window.decision === true)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: izin sesi tampil meskipun Auto Mode aktif, hanya Tolak/Izinkan, keyboard Enter bekerja, tidak menyimpan izin permanen, sesi berikutnya meminta izin baru.'
  )
} finally {
  await browser.close()
}
