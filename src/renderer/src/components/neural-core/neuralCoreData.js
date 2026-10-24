export function neuralDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Waktu belum tercatat'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )
}

export function neuralTab(value) {
  const aliases = {
    'tri-lobe': 'overview',
    synaptic: 'memory',
    emotional: 'personality',
    procedural: 'skills'
  }
  const tab = aliases[value] || value
  return ['overview', 'personality', 'memory', 'skills', 'journal', 'data'].includes(tab)
    ? tab
    : 'overview'
}

export function buildMemoryGraph({ archives = [], memories = [], skills = [], diskSkills = [] }) {
  const nodes = [{ id: 'core', name: 'Mark', group: 0, val: 12, color: '#1fb854' }]
  const links = []
  const groups = [
    {
      id: 'archives-root',
      name: 'Arsip percakapan',
      kind: 'archive',
      color: '#94a3b8',
      records: archives,
      title: (item) => item.summary || 'Arsip percakapan',
      text: (item) => item.summary,
      date: (item) => item.timestamp
    },
    {
      id: 'vector-root',
      name: 'Ingatan tersimpan',
      kind: 'memory',
      color: '#1fb854',
      records: memories,
      title: (item) => item.summary || item.memory || 'Ingatan tersimpan',
      text: (item) => item.memory,
      date: (item) => item.created_at || item.createdAt
    },
    {
      id: 'skills-root',
      name: 'Skill dipelajari',
      kind: 'skill',
      color: '#c5ab76',
      records: skills,
      title: (item) => `/${item.name}`,
      text: (item) => item.content,
      date: (item) => item.updatedAt
    },
    {
      id: 'custom-skills-root',
      name: 'Skill lokal',
      kind: 'disk-skill',
      color: '#7ca8b3',
      records: diskSkills,
      title: (item) => `/${item.name}`,
      text: (item) => item.description,
      date: () => null
    }
  ]
  for (const group of groups) {
    nodes.push({ id: group.id, name: group.name, group: 1, val: 8, color: group.color })
    links.push({ source: 'core', target: group.id })
    const categories = new Set()
    for (const record of group.records) {
      let parent = group.id
      const category =
        group.kind === 'archive'
          ? record.topic || 'Umum'
          : group.kind === 'memory'
            ? record.type || 'Lainnya'
            : null
      if (category) {
        parent = `category:${group.kind}:${category}`
        if (!categories.has(parent)) {
          categories.add(parent)
          nodes.push({ id: parent, name: category, group: 2, val: 5, color: group.color })
          links.push({ source: group.id, target: parent })
        }
      }
      const id = `${group.kind}:${record.id ?? record.name}`
      nodes.push({
        id,
        recordId: record.id ?? record.name,
        kind: group.kind,
        name: String(group.title(record)),
        fullText: String(group.text(record) || ''),
        description: record.description || '',
        date: neuralDate(group.date(record)),
        group: 3,
        val: 3,
        color: group.color,
        typeLabel: group.name
      })
      links.push({ source: parent, target: id })
    }
  }
  return { nodes, links }
}
