import fs from 'node:fs'
import path from 'node:path'

export function parsePatch(patch, resolve) {
  const lines = String(patch || '')
    .replaceAll('\r\n', '\n')
    .split('\n')
  if (lines[0] !== '*** Begin Patch' || !lines.includes('*** End Patch'))
    throw new Error('Gunakan format *** Begin Patch / *** End Patch.')
  const plans = []
  for (let i = 1; i < lines.length && lines[i] !== '*** End Patch'; ) {
    const match = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(lines[i++])
    if (!match) throw new Error('Header berkas patch tidak valid.')
    const [, operation, name] = match
    const target = resolve(name)
    if (plans.some((p) => p.path.toLowerCase() === target.toLowerCase()))
      throw new Error('Satu berkas hanya boleh muncul sekali dalam patch.')
    const before = fs.existsSync(target) ? fs.readFileSync(target) : null
    const content = []
    while (i < lines.length && !lines[i].startsWith('*** ')) content.push(lines[i++])
    let after = null
    if (operation === 'Add') {
      if (before) throw new Error(`Berkas sudah ada: ${name}`)
      if (content.some((line) => !line.startsWith('+')))
        throw new Error('Baris berkas baru harus diawali +.')
      after = Buffer.from(content.map((line) => line.slice(1)).join('\n') + '\n')
    } else if (operation === 'Update') {
      if (!before) throw new Error(`Berkas tidak ditemukan: ${name}`)
      const newline = before.includes(Buffer.from('\r\n')) ? '\r\n' : '\n'
      let text = before.toString('utf8').replaceAll('\r\n', '\n')
      let chunk = []
      const apply = () => {
        if (!chunk.length) return
        if (chunk.some((line) => !/^[ +-]/.test(line)))
          throw new Error('Baris hunk harus diawali spasi, +, atau -.')
        const old = chunk
          .filter((line) => line[0] !== '+')
          .map((line) => line.slice(1))
          .join('\n')
        const next = chunk
          .filter((line) => line[0] !== '-')
          .map((line) => line.slice(1))
          .join('\n')
        if (!old || text.split(old).length !== 2)
          throw new Error(`Konteks patch tidak ditemukan atau tidak unik: ${name}`)
        text = text.replace(old, () => next)
        chunk = []
      }
      for (const line of content) {
        if (line.startsWith('@@')) apply()
        else chunk.push(line)
      }
      apply()
      after = Buffer.from(text.replaceAll('\n', newline))
    } else if (!before) throw new Error(`Berkas tidak ditemukan: ${name}`)
    plans.push({ path: target, before, after })
  }
  if (!plans.length) throw new Error('Patch tidak berisi perubahan.')
  return plans
}
export function writeBytes(file, bytes) {
  if (bytes === null) {
    fs.unlinkSync(file)
    return
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.mark-${crypto.randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, bytes)
    fs.renameSync(temporary, file)
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
}
