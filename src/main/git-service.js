import fs from 'fs'
import { runGit } from './git-runtime.js'

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
    const { stdout } = await runGit(['status', '--short'], { cwd: check.target })
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
    const { stdout } = await runGit(
      ['diff', '--no-ext-diff', '--no-textconv', ...(filePath ? ['--', filePath.trim()] : [])],
      { cwd: check.target }
    )
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
    await runGit(['add', '-A'], { cwd: check.target })
    const { stdout } = await runGit(['commit', '-m', message], { cwd: check.target })
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
      await runGit(['checkout', '--', filePath.trim()], { cwd: check.target })
      return { success: true, message: `Berhasil me-rollback perubahan pada berkas ${filePath}.` }
    } else {
      await runGit(['reset', '--hard', 'HEAD'], { cwd: check.target })
      return { success: true, message: 'Berhasil me-rollback seluruh repositori ke HEAD.' }
    }
  } catch (err) {
    return { success: false, error: formatGitError(err, check.target) }
  }
}
