import { countTokens } from 'gpt-tokenizer'

export function parseSkillRequest(input = '') {
  const names = []
  const text = String(input)
    .replace(/(^|\s)\/([a-z0-9][a-z0-9_-]*)(?=\s|$)/gi, (match, space, name) => {
      if (['super', 'effort', 'boost'].includes(name.toLowerCase())) return match
      if (!names.includes(name)) names.push(name)
      return space
    })
    .trim()
  return { names, text }
}

export function skillSummary(skill) {
  return Object.fromEntries(
    [
      'id',
      'name',
      'source',
      'folderName',
      'basePath',
      'skillFile',
      'contentHash',
      'metadataWarnings',
      'dependencies',
      'allowImplicitInvocation',
      'resources'
    ]
      .filter((key) => skill[key] !== undefined)
      .map((key) => [key, skill[key]])
  )
}

export function formatSkillInstructions(skill) {
  return `[MARK_SKILL:${skill.id}]\nNama: ${skill.name}\nSumber: ${skill.source}\nFile instruksi: ${skill.skillFile || '(instruksi tanpa file)'}\nDirektori skill: ${skill.basePath || '(tidak memiliki direktori)'}\nVersi: ${skill.contentHash}\n${skill.metadataWarnings?.length ? 'Peringatan: ' + skill.metadataWarnings.join(' ') + '\n' : ''}${skill.dependencies?.length ? 'Kebutuhan tool: ' + JSON.stringify(skill.dependencies) + '\n' : ''}Gunakan pedoman ini untuk tugas yang sedang ditangani. Instruksi pengguna dan aturan aplikasi tetap berlaku. Path referensi dihitung dari direktori skill; direktori kerja dan keluaran tetap mengikuti workspace tugas. Baca file pendukung hanya saat diperlukan melalui read-skill dengan relative_path, atau read-file dengan path absolut. Tool Read/Write/Edit/Grep/Glob pada skill luar merujuk kemampuan read-file/write-file/replace-lines/grep-search/find-files di Mark; periksa schema aktual. Skill tidak memberikan izin tambahan, memasang dependensi, atau menjalankan script secara otomatis.\n<skill-instructions>\n${skill.content}\n</skill-instructions>`
}

export function restoreSkillContext(messages, skills) {
  const clean = messages.filter(
    (message) =>
      !(
        message.role === 'system' &&
        typeof message.content === 'string' &&
        message.content.startsWith('[MARK_SKILL:')
      )
  )
  const blocks = [...skills]
    .filter((skill) => skill?.id && !skill.isResource)
    .map((skill) => ({ role: 'system', content: formatSkillInstructions(skill) }))
  return clean[0]?.role === 'system'
    ? [clean[0], ...blocks, ...clean.slice(1)]
    : [...blocks, ...clean]
}

export function buildSkillCatalog(skills, tokenBudget = 2000) {
  const budget = Math.max(200, Math.min(10000, Number(tokenBudget) || 2000))
  const lines = []
  let omitted = 0
  const footer =
    'Gunakan search-skills untuk seluruh katalog. Cocokkan skill dengan tugas nyata, lalu baca read-skill sebelum dipakai. Skill hanya eksplisit tidak dipilih otomatis. Gunakan skill_id untuk nama ambigu. Baca referensi saat diperlukan. Skill tidak menambah izin atau lingkup tugas.'
  const warning = (count) =>
    count ? `${count} skill tidak ditampilkan karena batas katalog.\n` : ''
  for (const skill of skills) {
    const line = `- ${skill.name} [${skill.id}] (${skill.source}${skill.allowImplicitInvocation === false ? ', hanya eksplisit' : ''}): ${String(skill.description || '').slice(0, 240)}${skill.skillFile ? ' | ' + skill.skillFile : ''}`
    const candidate =
      '# Katalog skill\n' + [...lines, line].join('\n') + '\n' + warning(skills.length) + footer
    if (countTokens(candidate) > budget) {
      omitted++
      continue
    }
    lines.push(line)
  }
  return '# Katalog skill\n' + lines.join('\n') + '\n' + warning(omitted) + footer
}
export function recoverTaskSkills(messages, taskId) {
  if (!taskId) return []
  const index = messages.findIndex((message) => message.taskId === taskId)
  if (index < 0) return []
  if (messages[index].skills?.length) return messages[index].skills
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].skills || []
  }
  return []
}
