import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, execFileSync } from 'node:child_process'

const directory = fileURLToPath(new URL('../../resources/git/', import.meta.url))
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
let verified = false
function repositoryAt(cwd) {
  let directory = path.resolve(cwd)
  while (true) {
    if (fs.existsSync(path.join(directory, '.git'))) return fs.realpathSync(directory)
    const parent = path.dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}
export function gitExecutable() {
  if (process.platform !== manifest.platform || process.arch !== manifest.arch)
    throw new Error('Git bawaan Mark versi ini memerlukan Windows x64.')
  const executable = path.join(
    directory,
    `${manifest.platform}-${manifest.arch}`,
    manifest.executable
  )
  if (!fs.existsSync(executable))
    throw new Error(
      'Git bawaan Mark belum tersedia. Jalankan npm run prepare:git pada development atau perbaiki instalasi Mark.'
    )
  if (!verified) {
    const marker = JSON.parse(
      fs.readFileSync(path.join(path.dirname(path.dirname(executable)), 'mark-git.json'), 'utf8')
    )
    const version = execFileSync(executable, ['--version'], {
      windowsHide: true,
      timeout: 15000,
      encoding: 'utf8'
    }).trim()
    if (marker.sha256 !== manifest.sha256 || version !== `git version ${manifest.gitVersion}`)
      throw new Error('Git bawaan Mark tidak cocok dengan manifest paket.')
    verified = true
  }
  return executable
}
export function gitEnvironment(extra = {}, cwd) {
  const env = { ...process.env, ...extra }
  const previousPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || ''
  for (const key of Object.keys(env)) {
    if (
      key.toLowerCase() === 'path' ||
      /^(GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_COMMON_DIR|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_PAGER)$/i.test(
        key
      )
    )
      delete env[key]
  }
  env.Path = `${path.dirname(gitExecutable())}${path.delimiter}${previousPath}`
  // Git treats "cat" as no pager; MinGit does not ship less or need a cat executable.
  env.GIT_PAGER = 'cat'
  const repository = cwd && repositoryAt(cwd)
  if (repository) {
    const count = Number(env.GIT_CONFIG_COUNT || 0)
    env[`GIT_CONFIG_KEY_${count}`] = 'safe.directory'
    env[`GIT_CONFIG_VALUE_${count}`] = repository.replaceAll('\\', '/')
    env.GIT_CONFIG_COUNT = String(count + 1)
  }
  return env
}
function optionsFor(options) {
  const { input, internal = false, env: extra = {}, ...rest } = options
  const env = gitEnvironment(extra)
  if (internal) {
    for (const key of Object.keys(env)) if (/^GIT_/i.test(key)) delete env[key]
    Object.assign(
      env,
      {
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
        GIT_ATTR_NOSYSTEM: '1',
        GIT_NO_REPLACE_OBJECTS: '1',
        GIT_TERMINAL_PROMPT: '0',
        GIT_AUTHOR_NAME: 'Mark',
        GIT_AUTHOR_EMAIL: 'mark@localhost',
        GIT_COMMITTER_NAME: 'Mark',
        GIT_COMMITTER_EMAIL: 'mark@localhost'
      },
      extra
    )
  }
  return {
    input,
    options: {
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 32 * 1024 * 1024,
      encoding: 'utf8',
      ...rest,
      env
    }
  }
}
export function runGit(args, options = {}) {
  const resolved = optionsFor(options)
  const repository = !options.internal && repositoryAt(options.cwd || process.cwd())
  const commandArgs = repository
    ? [
        '-c',
        `safe.directory=${repository.replaceAll('\\', '/')}`,
        '-c',
        'core.fsmonitor=false',
        ...args
      ]
    : args
  return new Promise((resolve, reject) => {
    const child = execFile(
      gitExecutable(),
      commandArgs,
      resolved.options,
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr
          error.stdout = stdout
          reject(error)
        } else resolve({ stdout, stderr })
      }
    )
    child.stdin.on('error', () => {})
    child.stdin.end(resolved.input ?? undefined)
  })
}
export function runGitSync(args, options = {}) {
  const resolved = optionsFor(options)
  return execFileSync(gitExecutable(), args, { ...resolved.options, input: resolved.input })
}
