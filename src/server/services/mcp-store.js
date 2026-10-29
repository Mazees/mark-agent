import { randomUUID } from 'node:crypto'

// Only non-secret configuration belongs in this table and in Mark backups.
export function createMcpStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS mcp_addons (
    id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL
  )`)
  const get = db.prepare('SELECT data FROM mcp_addons WHERE id = ?')
  const list = db.prepare('SELECT data FROM mcp_addons ORDER BY updated_at DESC')
  const upsert = db.prepare(`INSERT INTO mcp_addons (id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`)
  const remove = db.prepare('DELETE FROM mcp_addons WHERE id = ?')
  const normalize = (value, existing) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Konfigurasi MCP tidak valid.')
    const name = String(value.name || '').trim()
    if (!name || name.length > 100)
      throw new Error('Nama add-on harus diisi (maksimal 100 karakter).')
    const type = value.type
    if (!['stdio', 'http'].includes(type)) throw new Error('Jenis koneksi MCP tidak valid.')
    const description = String(value.description || '')
      .trim()
      .slice(0, 500)
    const auth = type === 'http' ? value.auth || 'none' : 'none'
    if (!['none', 'bearer', 'oauth'].includes(auth))
      throw new Error('Jenis autentikasi tidak valid.')
    let command = '',
      args = [],
      url = '',
      envKeys = []
    if (type === 'stdio') {
      command = String(value.command || '').trim()
      if (!command || command.includes('\0')) throw new Error('Command MCP harus diisi.')
      if (
        !Array.isArray(value.args || []) ||
        (value.args || []).some((x) => typeof x !== 'string' || x.includes('\0'))
      )
        throw new Error('Argumen MCP tidak valid.')
      args = value.args || []
      envKeys = value.envKeys || []
      if (
        !Array.isArray(envKeys) ||
        envKeys.some((x) => typeof x !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(x))
      )
        throw new Error('Nama environment variable tidak valid.')
    } else {
      const parsed = new URL(value.url)
      if (
        !['https:', 'http:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      )
        throw new Error('URL MCP harus berupa HTTP(S) tanpa kredensial, query, atau fragment.')
      if (
        parsed.protocol === 'http:' &&
        !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
      )
        throw new Error('HTTP tanpa TLS hanya diperbolehkan untuk localhost.')
      url = parsed.toString()
    }
    let icon = value.icon || null
    if (
      icon &&
      (typeof icon !== 'string' ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(icon) ||
        icon.length > 350000 ||
        !Buffer.from(icon.slice(22), 'base64')
          .subarray(0, 8)
          .equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    )
      throw new Error('Ikon harus berupa PNG dengan ukuran maksimal 256 KB.')
    for (const list of [existing?.enabledTools, existing?.knownTools]) {
      if (
        list !== undefined &&
        (!Array.isArray(list) || list.some((item) => typeof item !== 'string'))
      )
        throw new Error('Daftar tool MCP tidak valid.')
    }
    return {
      id: existing?.id || 'mcp-' + randomUUID(),
      name,
      description,
      type,
      command,
      args,
      url,
      auth,
      envKeys: [...new Set(envKeys)],
      icon,
      enabledTools: existing?.enabledTools || [],
      knownTools: existing?.knownTools || [],
      enabled: existing?.enabled !== false
    }
  }
  return {
    list: () => list.all().map((row) => JSON.parse(row.data)),
    get: (id) => {
      const row = get.get(id)
      return row ? JSON.parse(row.data) : null
    },
    save: (value, id) => {
      const old = id ? JSON.parse(get.get(id)?.data || 'null') : null
      if (id && !old) throw new Error('Add-on tidak ditemukan.')
      const entry = normalize(value, old)
      if (
        old &&
        (old.type !== entry.type ||
          old.url !== entry.url ||
          old.command !== entry.command ||
          JSON.stringify(old.args) !== JSON.stringify(entry.args))
      ) {
        entry.enabledTools = []
        entry.knownTools = []
      }
      upsert.run(entry.id, JSON.stringify(entry), Date.now())
      return entry
    },
    setTools: (id, tools) => {
      const row = get.get(id)
      if (!row) throw new Error('Add-on tidak ditemukan.')
      if (!Array.isArray(tools) || tools.some((x) => typeof x !== 'string'))
        throw new Error('Pilihan tool tidak valid.')
      const entry = JSON.parse(row.data)
      entry.enabledTools = [...new Set(tools)]
      upsert.run(id, JSON.stringify(entry), Date.now())
      return entry
    },
    setEnabled: (id, enabled) => {
      const row = get.get(id)
      if (!row) throw new Error('Add-on tidak ditemukan.')
      const entry = JSON.parse(row.data)
      entry.enabled = enabled === true
      upsert.run(id, JSON.stringify(entry), Date.now())
      return entry
    },
    discoverTools: (id, names) => {
      const row = get.get(id)
      if (!row) throw new Error('Add-on tidak ditemukan.')
      const entry = JSON.parse(row.data)
      const known = new Set(entry.knownTools || [])
      entry.enabledTools = [
        ...new Set([...(entry.enabledTools || []), ...names.filter((name) => !known.has(name))])
      ]
      entry.knownTools = [...new Set([...known, ...names])]
      upsert.run(id, JSON.stringify(entry), Date.now())
      return entry
    },
    remove: (id) => remove.run(id).changes > 0,
    replaceAll: (entries, overwrite = true) =>
      db.transaction(() => {
        if (overwrite) db.exec('DELETE FROM mcp_addons')
        for (const entry of entries) {
          if (!entry?.id || !/^mcp-[0-9a-f-]{36}$/i.test(entry.id))
            throw new Error('ID add-on tidak valid.')
          const clean = normalize(entry, {
            id: entry.id,
            enabledTools: entry.enabledTools,
            knownTools: entry.knownTools,
            enabled: entry.enabled
          })
          upsert.run(clean.id, JSON.stringify(clean), Date.now())
        }
      })()
  }
}
