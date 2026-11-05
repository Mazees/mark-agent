import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import AdmZip from 'adm-zip'
const root = fileURLToPath(new URL('../resources/office/', import.meta.url))
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'))
const target = path.join(root, 'win32-x64')
const marker = path.join(target, 'mark-office.json')
let ready = false
try {
  ready =
    JSON.parse(await fs.readFile(marker, 'utf8')).sha256 === manifest.sha256 &&
    (await fs.stat(path.join(target, manifest.executable))).isFile() &&
    execFileSync(path.join(target, manifest.executable), ['--headless', '--version'], { windowsHide: true, encoding: 'utf8', timeout: 15000 }).trim().startsWith('LibreOffice ' + manifest.version + '.')
} catch {
  /* Preparation only; runtime never downloads a renderer. */
}
if (ready) console.log(`LibreOffice ${manifest.version} sudah tersedia.`)
else {
  if (process.platform !== 'win32')
    throw new Error('Persiapan distribusi Office memerlukan Windows x64.')
  const temporary = path.join(root, `.prepare-${randomUUID()}`)
  if (path.dirname(temporary) !== path.resolve(root)) throw new Error('Path persiapan tidak valid.')
  await fs.mkdir(temporary, { recursive: true })
  try {
    const archive = path.join(temporary, manifest.archive)
    const hash = createHash('sha256')
    console.log(`Mengunduh distribusi resmi LibreOffice ${manifest.version}...`)
    const response = await fetch(manifest.url, { signal: AbortSignal.timeout(600000) })
    if (!response.ok) throw new Error(`Unduhan gagal: HTTP ${response.status}`)
    const handle = await fs.open(archive, 'w')
    let size = 0,
      reported = 0
    try {
      for await (const chunk of response.body) {
        hash.update(chunk)
        await handle.write(chunk)
        size += chunk.length
        if (size - reported > 50 * 1024 * 1024) {
          console.log(`${Math.round(size / 1048576)} MiB diterima.`)
          reported = size
        }
      }
    } finally {
      await handle.close()
    }
    if (hash.digest('hex') !== manifest.sha256) throw new Error('Checksum LibreOffice tidak cocok.')
    const extracted = path.join(temporary, 'extracted')
    console.log('Mengekstrak distribusi tanpa memasang Office ke Windows...')
    const extractorResponse = await fetch(manifest.extractor.url, {
      signal: AbortSignal.timeout(60000)
    })
    if (!extractorResponse.ok) throw new Error('Unduhan ekstraktor MSI gagal.')
    const extractor = Buffer.from(await extractorResponse.arrayBuffer())
    if (createHash('sha256').update(extractor).digest('hex') !== manifest.extractor.sha256)
      throw new Error('Checksum ekstraktor MSI tidak cocok.')
    const archiveTool = new AdmZip(extractor)
    const tool = path.join(temporary, 'extractor')
    for (const entry of archiveTool.getEntries()) {
      const destination = path.resolve(tool, entry.entryName)
      if (!destination.startsWith(tool + path.sep)) throw new Error('Path ekstraktor tidak valid.')
    }
    archiveTool.extractAllTo(tool, true)
    execFileSync(path.join(tool, 'lessmsi.exe'), ['x', archive, extracted + path.sep], {
      windowsHide: true,
      timeout: 900000,
      stdio: 'ignore'
    })
    const find = async (dir, depth = 0) => {
      if (depth > 4) return null
      try {
        if ((await fs.stat(path.join(dir, manifest.executable))).isFile()) return dir
      } catch {
        /* Search extracted distribution. */
      }
      for (const entry of await fs.readdir(dir, { withFileTypes: true }))
        if (entry.isDirectory()) {
          const found = await find(path.join(dir, entry.name), depth + 1)
          if (found) return found
        }
      return null
    }
    const distribution = await find(extracted)
    if (!distribution) throw new Error('Distribusi tidak berisi soffice.exe.')
    await fs.writeFile(
      path.join(distribution, 'mark-office.json'),
      JSON.stringify(manifest, null, 2)
    )
    if (path.dirname(target) !== path.resolve(root)) throw new Error('Path distribusi tidak valid.')
    await fs.rm(target, { recursive: true, force: true })
    await fs.rename(distribution, target)
    console.log(`LibreOffice ${manifest.version} siap dan checksum terverifikasi.`)
  } finally {
    if (path.dirname(temporary) === path.resolve(root)) await fs.rm(temporary, { recursive: true, force: true })
  }
}
