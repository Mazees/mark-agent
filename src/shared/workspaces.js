export const isMainSession = (id) => /^1(?:\.0+)?$/.test(String(id).trim())

export function workspaceKey(root) {
  return String(root || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}

export function workspaceName(root) {
  return (
    String(root || '')
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || root
  )
}

export function resolveSessionWorkspace(session, defaultRoot) {
  return isMainSession(session?.id) ? defaultRoot : session?.workspaceRoot || defaultRoot
}

export function groupWorkspaceSessions(sessions, defaultRoot, query = '') {
  const general = []
  const groups = new Map()
  const needle = query.trim().toLowerCase()
  const defaultKey = workspaceKey(defaultRoot)
  const newestFirst = (a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)
  for (const session of sessions) {
    const key = workspaceKey(session.workspaceRoot)
    if (isMainSession(session.id) || !key || key === defaultKey) {
      general.push(session)
    } else {
      if (!groups.has(key))
        groups.set(key, {
          key,
          root: session.workspaceRoot,
          name: workspaceName(session.workspaceRoot),
          sessions: []
        })
      groups.get(key).sessions.push(session)
    }
  }
  general.sort(
    (a, b) => Number(isMainSession(b.id)) - Number(isMainSession(a.id)) || newestFirst(a, b)
  )
  const matchesTitle = (session) => (session.title || '').toLowerCase().includes(needle)
  return {
    general: general.filter(
      (s) => isMainSession(s.id) || !needle || matchesTitle(s) || 'percakapan umum'.includes(needle)
    ),
    workspaces: [...groups.values()]
      .map((group) => ({
        ...group,
        sessions: group.sessions.sort(newestFirst),
        timestamp: Math.max(...group.sessions.map((s) => Number(s.timestamp || 0)))
      }))
      .sort(newestFirst)
      .map((group) => ({
        ...group,
        sessions:
          !needle ||
          `${group.name} ${group.root}`.toLowerCase().includes(needle) ||
          workspaceKey(group.root).includes(workspaceKey(needle))
            ? group.sessions
            : group.sessions.filter(matchesTitle)
      }))
      .filter((group) => group.sessions.length > 0)
  }
}
