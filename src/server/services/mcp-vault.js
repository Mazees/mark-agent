import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$req = [Console]::In.ReadToEnd() | ConvertFrom-Json
$bytes = [Convert]::FromBase64String($req.data)
if ($req.action -eq 'protect') { $result = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser) }
else { $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser) }
[Console]::Out.Write([Convert]::ToBase64String($result))`
const encodedScript = Buffer.from(script, 'utf16le').toString('base64')
async function crypt(action, bytes) {
  if (process.platform !== 'win32')
    throw new Error('Penyimpanan kredensial MCP memerlukan Windows.')
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
    )
    let output = ''
    child.stdout.setEncoding('utf8')
    child.stdin.on('error', () => {})
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.on('error', () => reject(new Error('Penyimpanan kredensial Windows tidak tersedia.')))
    child.on('close', (code) =>
      code === 0
        ? resolve(Buffer.from(output.trim(), 'base64'))
        : reject(new Error('Penyimpanan kredensial Windows gagal.'))
    )
    child.stdin.end(JSON.stringify({ action, data: bytes.toString('base64') }))
  })
}
export function createMcpVault(
  directory = path.join(os.homedir(), '.config', 'mark-agent', 'mcp-credentials')
) {
  const file = (id) => {
    if (!/^mcp-[0-9a-f-]{36}$/i.test(id)) throw new Error('ID add-on tidak valid.')
    return path.join(directory, id + '.bin')
  }
  return {
    async read(id) {
      try {
        return JSON.parse((await crypt('unprotect', await fs.readFile(file(id)))).toString('utf8'))
      } catch (e) {
        if (e.code === 'ENOENT') return {}
        throw e
      }
    },
    async write(id, value) {
      const data = await crypt('protect', Buffer.from(JSON.stringify(value)))
      await fs.mkdir(directory, { recursive: true })
      const target = file(id),
        temp = target + '.tmp'
      await fs.writeFile(temp, data)
      await fs.rename(temp, target)
    },
    async remove(id) {
      await fs.rm(file(id), { force: true })
    }
  }
}
export const mcpVault = createMcpVault()
