import { exec } from 'child_process'
import util from 'util'

const execPromise = util.promisify(exec)

/**
 * Mendapatkan status berkas repositori git (git status --short)
 */
export async function getGitStatus(cwd) {
  try {
    const { stdout } = await execPromise('git status --short', { cwd: cwd || process.cwd() })
    return {
      success: true,
      status: stdout.trim() || 'Working tree clean (tidak ada perubahan berkas).'
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Mendapatkan perubahan baris kode (git diff)
 */
export async function getGitDiff(cwd, filePath = '') {
  try {
    const cleanPath = filePath ? ` -- "${filePath.trim()}"` : ''
    const { stdout } = await execPromise(`git diff${cleanPath}`, { cwd: cwd || process.cwd() })
    return {
      success: true,
      diff: stdout.trim() || 'Tidak ada perbedaan baris kode yang belum di-commit.'
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Membuat checkpoint commit git otomatis
 */
export async function gitCommit(cwd, message = 'Mark Agent Checkpoint') {
  try {
    await execPromise('git add -A', { cwd: cwd || process.cwd() })
    const safeMsg = message.replace(/"/g, '\\"')
    const { stdout } = await execPromise(`git commit -m "${safeMsg}"`, { cwd: cwd || process.cwd() })
    return { success: true, message: stdout.trim() }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Me-rollback perubahan file ke HEAD
 */
export async function gitRevert(cwd, filePath = '') {
  try {
    if (filePath && filePath.trim()) {
      await execPromise(`git checkout -- "${filePath.trim()}"`, { cwd: cwd || process.cwd() })
      return { success: true, message: `Berhasil me-rollback perubahan pada berkas ${filePath}.` }
    } else {
      await execPromise('git reset --hard HEAD', { cwd: cwd || process.cwd() })
      return { success: true, message: 'Berhasil me-rollback seluruh repositori ke HEAD.' }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
