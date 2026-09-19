import { exec } from 'child_process'
import util from 'util'
import fs from 'fs'

const execPromise = util.promisify(exec)

function validateRepoCwd(cwd) {
  const target = cwd || process.cwd()
  if (!fs.existsSync(target)) {
    return { valid: false, error: `Direktori '${target}' tidak ditemukan.` }
  }
  return { valid: true, target }
}

function formatGitError(err, target) {
  const msg = err?.message || String(err)
  if (msg.includes('not a git repository')) {
    return `Folder '${target}' bukan repositori Git.`
  }
  return msg
}

/**
 * Mendapatkan status berkas repositori git (git status --short)
 */
export async function getGitStatus(cwd) {
  const check = validateRepoCwd(cwd)
  if (!check.valid) return { success: false, error: check.error }
  try {
    const { stdout } = await execPromise('git status --short', { cwd: check.target })
    return {
      success: true,
      status: stdout.trim() || 'Working tree clean (tidak ada perubahan berkas).'
    }
  } catch (err) {
    return { success: false, error: formatGitError(err, check.target) }
  }
}
/**
 * Mendapatkan perubahan baris kode (git diff)
 */
export async function getGitDiff(cwd, filePath = '') {
  const check = validateRepoCwd(cwd)
  if (!check.valid) return { success: false, error: check.error }
  try {
    const cleanPath = filePath ? ` -- "${filePath.trim()}"` : ''
    const { stdout } = await execPromise(`git diff${cleanPath}`, { cwd: check.target })
    return {
      success: true,
      diff: stdout.trim() || 'Tidak ada perbedaan baris kode yang belum di-commit.'
    }
  } catch (err) {
    return { success: false, error: formatGitError(err, check.target) }
  }
}

/**
 * Membuat checkpoint commit git otomatis
 */
export async function gitCommit(cwd, message = 'Mark Agent Checkpoint') {
  const check = validateRepoCwd(cwd)
  if (!check.valid) return { success: false, error: check.error }
  try {
    await execPromise('git add -A', { cwd: check.target })
    const safeMsg = message.replace(/"/g, '\\"')
    const { stdout } = await execPromise(`git commit -m "${safeMsg}"`, { cwd: check.target })
    return { success: true, message: stdout.trim() }
  } catch (err) {
    return { success: false, error: formatGitError(err, check.target) }
  }
}

/**
 * Me-rollback perubahan file ke HEAD
 */
export async function gitRevert(cwd, filePath = '') {
  const check = validateRepoCwd(cwd)
  if (!check.valid) return { success: false, error: check.error }
  try {
    if (filePath && filePath.trim()) {
      await execPromise(`git checkout -- "${filePath.trim()}"`, { cwd: check.target })
      return { success: true, message: `Berhasil me-rollback perubahan pada berkas ${filePath}.` }
    } else {
      await execPromise('git reset --hard HEAD', { cwd: check.target })
      return { success: true, message: 'Berhasil me-rollback seluruh repositori ke HEAD.' }
    }
  } catch (err) {
    return { success: false, error: formatGitError(err, check.target) }
  }
}
