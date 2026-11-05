import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { workspaceFile, documentExtensions } from './workspace-files.js'

const distribution = fileURLToPath(new URL('../../../resources/office/', import.meta.url))
const cache =
  process.env.MARK_DOCUMENT_CACHE_DIR ||
  path.join(os.homedir(), '.config', 'mark-agent', 'document-cache')
const jobs = new Map()
async function writeCache(file, bytes) {
  const temporary = file + '.' + randomUUID() + '.tmp'
  try { await fs.writeFile(temporary, bytes); await fs.rename(temporary, file) }
  finally { await fs.rm(temporary, { force: true }) }
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function source(sessionId, value) {
  const { root, file } = workspaceFile(sessionId, value)
  if (!documentExtensions.has(path.extname(file).toLowerCase()))
    throw new Error('Format dokumen belum didukung.')
  if ((await fs.stat(file)).size > 150 * 1024 * 1024)
    throw new Error('Dokumen melebihi batas preview 150 MiB.')
  const bytes = await fs.readFile(file)
  const hash = digest(bytes)
  return { file, bytes, hash, path: path.relative(root, file).replaceAll('\\', '/') }
}
const profileSettings = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Load"><prop oor:name="UpdateDocMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>`
async function convert(input, target) {
  const manifest = JSON.parse(await fs.readFile(path.join(distribution, 'manifest.json'), 'utf8'))
  const folder = path.join(distribution, 'win32-x64')
  let marker
  try {
    marker = JSON.parse(await fs.readFile(path.join(folder, 'mark-office.json'), 'utf8'))
  } catch {
    throw new Error(
      'Renderer dokumen lokal tidak tersedia. Paket Mark harus menyertakan LibreOffice; jalankan prepare:office saat menyiapkan rilis.'
    )
  }
  if (marker.sha256 !== manifest.sha256)
    throw new Error('Versi renderer dokumen tidak cocok dengan paket Mark.')
  const temporary = path.join(cache, `.convert-${randomUUID()}`)
  await fs.mkdir(path.join(temporary, 'profile', 'user'), { recursive: true })
  try {
    const copy = path.join(temporary, `document${path.extname(input.file)}`)
    await fs.writeFile(copy, input.bytes)
    await fs.writeFile(
      path.join(temporary, 'profile', 'user', 'registrymodifications.xcu'),
      profileSettings
    )
    await new Promise((resolve, reject) => {
      const child = spawn(
        path.join(folder, manifest.executable),
        [
          `-env:UserInstallation=${pathToFileURL(path.join(temporary, 'profile')).href}`,
          '--headless',
          '--nologo',
          '--nodefault',
          '--norestore',
          '--nofirststartwizard',
          '--convert-to',
          'pdf',
          '--outdir',
          temporary,
          copy
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: temporary }
      )
      let errorText = ''
      child.stderr.on('data', (chunk) => {
        errorText = (errorText + chunk).slice(-1000)
      })
      child.stdout.resume()
      const timer = setTimeout(() => {
        if (child.pid)
          execFile(
            'taskkill.exe',
            ['/PID', String(child.pid), '/T', '/F'],
            { windowsHide: true },
            () => {}
          )
        reject(new Error('Konversi dokumen melewati 90 detik dan dihentikan.'))
      }, 90000)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        code === 0 ? resolve() : reject(new Error(`Konversi dokumen gagal (${code}): ${errorText}`))
      })
    })
    const result = await fs.readFile(path.join(temporary, 'document.pdf'))
    if (result.subarray(0, 5).toString() !== '%PDF-')
      throw new Error('Renderer tidak menghasilkan PDF yang valid.')
    await writeCache(target, result)
  } finally {
    if (path.dirname(temporary) === path.resolve(cache))
      await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  }
}
export async function prepareDocument(sessionId, value) {
  const input = await source(sessionId, value)
  const manifest = JSON.parse(await fs.readFile(path.join(distribution, 'manifest.json'), 'utf8'))
  const key = digest(`${input.hash}:${manifest.version}`)
  const target = path.join(cache, `${key}.pdf`)
  await fs.mkdir(cache, { recursive: true })
  try {
    await fs.access(target)
  } catch {
    if (!jobs.has(key))
      jobs.set(
        key,
        (async () => {
          if (path.extname(input.file).toLowerCase() === '.pdf') {
            if (input.bytes.subarray(0, 5).toString() !== '%PDF-')
              throw new Error('Berkas bukan PDF yang valid.')
            await writeCache(target, input.bytes)
          } else await convert(input, target)
        })().finally(() => jobs.delete(key))
      )
    await jobs.get(key)
  }
  return { path: input.path, hash: input.hash }
}
export async function documentContent(sessionId, value, hash) {
  const current = await source(sessionId, value)
  if (hash !== current.hash)
    throw new Error('Dokumen berubah. Muat ulang preview untuk melihat versi terbaru.')
  const manifest = JSON.parse(await fs.readFile(path.join(distribution, 'manifest.json'), 'utf8'))
  const target = path.join(cache, `${digest(`${hash}:${manifest.version}`)}.pdf`)
  await fs.access(target)
  return target
}
