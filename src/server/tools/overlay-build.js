import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const sources = fileURLToPath(new URL('../../main/pc-agent-scripts/', import.meta.url))
const libraries = [
  'Microsoft.Web.WebView2.Core.dll',
  'Microsoft.Web.WebView2.Wpf.dll',
  'WebView2Loader.dll'
]

export async function ensureOverlayBinary({ packageBuild = false } = {}) {
  if (process.platform !== 'win32') throw new Error('Overlay desktop hanya tersedia di Windows.')
  if (process.arch !== 'x64') throw new Error('Host overlay saat ini membutuhkan Windows x64.')
  const hash = createHash('sha256')
  for (const file of [
    'OverlayNative.cs',
    'OverlayHost.cs',
    'OverlayHost.manifest',
    ...libraries.map((name) => 'overlay-runtime/' + name)
  ])
    hash.update(await fs.readFile(path.join(sources, file)))
  const version = hash.digest('hex').slice(0, 20)
  const bundled = path.join(sources, 'overlay-runtime')
  try {
    if ((await fs.readFile(path.join(bundled, 'build-id'), 'utf8')).trim() === version) {
      await fs.access(path.join(bundled, 'MarkOverlay.exe'))
      return path.join(bundled, 'MarkOverlay.exe')
    }
  } catch {
    /* Source checkouts compile once into the user's native cache. */
  }
  const output = packageBuild
    ? bundled
    : path.join(os.homedir(), '.config', 'mark-agent', 'native', version)
  const exe = path.join(output, 'MarkOverlay.exe')
  try {
    if (!packageBuild) {
      await fs.access(exe)
      return exe
    }
  } catch {
    /* Not built yet. */
  }
  await fs.mkdir(output, { recursive: true })
  for (const name of libraries)
    if (output !== bundled) await fs.copyFile(path.join(bundled, name), path.join(output, name))
  const framework = path.join(
    process.env.WINDIR || 'C:\\Windows',
    'Microsoft.NET',
    'Framework64',
    'v4.0.30319'
  )
  const references = [
    'System.dll',
    'System.Core.dll',
    'System.Drawing.dll',
    'System.Windows.Forms.dll',
    'System.Web.Extensions.dll',
    'System.Xaml.dll',
    'WPF/WindowsBase.dll',
    'WPF/PresentationCore.dll',
    'WPF/PresentationFramework.dll'
  ]
  const args = [
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/win32manifest:' + path.join(sources, 'OverlayHost.manifest'),
    '/out:' + exe,
    ...references.map((name) => '/reference:' + path.join(framework, name)),
    ...libraries
      .filter((name) => name.startsWith('Microsoft.'))
      .map((name) => '/reference:' + path.join(bundled, name)),
    path.join(sources, 'OverlayNative.cs'),
    path.join(sources, 'OverlayHost.cs')
  ]
  await new Promise((resolve, reject) => {
    const compiler = spawn(path.join(framework, 'csc.exe'), args, { windowsHide: true })
    let output = ''
    const timer = setTimeout(() => {
      compiler.kill()
      reject(new Error('Kompilasi host overlay melebihi 30 detik.'))
    }, 30000)
    compiler.stdout.on('data', (chunk) => {
      output += chunk
    })
    compiler.stderr.on('data', (chunk) => {
      output += chunk
    })
    compiler.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    compiler.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error('Host overlay gagal dikompilasi: ' + output.slice(0, 4000)))
    })
  })
  if (packageBuild) await fs.writeFile(path.join(output, 'build-id'), version)
  return exe
}
