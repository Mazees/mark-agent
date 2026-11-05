import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import AdmZip from 'adm-zip'

const root = fileURLToPath(new URL('../resources/git/', import.meta.url))
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'))
const target = path.join(root, `${manifest.platform}-${manifest.arch}`)
const marker = path.join(target, 'mark-git.json')
let ready = false
try {
  const installed = JSON.parse(await fs.readFile(marker, 'utf8'))
  ready =
    installed.sha256 === manifest.sha256 &&
    execFileSync(path.join(target, manifest.executable), ['--version'], {
      windowsHide: true,
      encoding: 'utf8'
    }).trim() === `git version ${manifest.gitVersion}`
} catch {
  /* Preparation is explicit; runtime never downloads Git. */
}
if (ready) {
  console.log(`MinGit ${manifest.version} sudah tersedia.`)
} else {
  const temporary = path.join(root, `.prepare-${randomUUID()}`)
  if (path.dirname(temporary) !== root.replace(/[\\/]$/, ''))
    throw new Error('Direktori sementara tidak valid.')
  await fs.mkdir(temporary, { recursive: true })
  try {
    console.log(`Menyiapkan ${manifest.archive} dari rilis resmi Git for Windows...`)
    const response = await fetch(manifest.url, { signal: AbortSignal.timeout(180000) })
    if (!response.ok) throw new Error(`Unduhan MinGit gagal: HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256)
      throw new Error('Checksum MinGit tidak cocok; paket tidak dipasang.')
    const zip = new AdmZip(bytes)
    for (const entry of zip.getEntries()) {
      const name = entry.entryName.replaceAll('\\', '/')
      const resolved = path.resolve(temporary, name)
      if (path.isAbsolute(name) || !resolved.startsWith(temporary + path.sep))
        throw new Error('Arsip MinGit berisi path tidak valid.')
    }
    zip.extractAllTo(temporary, true)
    const version = execFileSync(path.join(temporary, manifest.executable), ['--version'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 15000
    }).trim()
    if (version !== `git version ${manifest.gitVersion}`)
      throw new Error('Versi binary MinGit tidak cocok.')
    await fs.writeFile(path.join(temporary, 'mark-git.json'), JSON.stringify(manifest, null, 2))
    // Only the fixed distribution directory belongs to this preparation step.
    if (path.dirname(target) !== root.replace(/[\\/]$/, ''))
      throw new Error('Direktori MinGit tidak valid.')
    await fs.rm(target, { recursive: true, force: true })
    await fs.rename(temporary, target)
    console.log(`MinGit ${manifest.version} siap, checksum dan versi terverifikasi.`)
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}
