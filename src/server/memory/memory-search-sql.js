const dimensions = 384
const vectorCacheLimit = 32 * 1024 * 1024
const emptyVector = Buffer.alloc(dimensions * 4)
const sources = {
  memories: {
    table: 'memories',
    text: "COALESCE(summary || ' ', '') || memory",
    fields:
      'id, type, summary, memory, confidence, created_at AS createdAt, updated_at AS updatedAt'
  },
  archives: {
    table: 'chat_archives',
    text: "COALESCE(topic || ' ', '') || summary",
    fields: 'id, summary, topic, timestamp'
  },
  chatTurns: {
    table: 'chat_turns',
    text: "COALESCE(combined_text, user_text || ' ' || ai_text)",
    fields: `id, id AS pairId, session_id AS sessionId, session_title AS sessionTitle,
      user_text AS userText, ai_text AS aiText, COALESCE(combined_text, user_text || ' ' || ai_text) AS combinedText, timestamp`
  }
}
const fold = (text) =>
  String(text ?? '')
    .normalize('NFC')
    .toLowerCase()

function literalRank(text, phrase, identifiers, tokens) {
  const body = fold(text)
  if (body.includes(phrase)) return 1000
  let rank = 0
  for (const identifier of identifiers) if (body.includes(identifier)) rank += 16
  for (const token of tokens) if (body.includes(token)) rank++
  return rank
}

export function vectorBuffer(value) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!Array.isArray(value) || value.length !== dimensions) return null
  const vector = new Float32Array(dimensions)
  let nonzero = false
  for (let i = 0; i < dimensions; i += 1) {
    const component = value[i]
    if (!Number.isFinite(component) || Math.abs(component) > 1e16) return null
    vector[i] = component
    if (Math.abs(component) >= 1e-18) nonzero = true
  }
  return nonzero ? Buffer.from(vector.buffer) : null
}

export function createMemorySearch(db) {
  db.pragma('cache_size = -16384')
  const vectors = new Map()
  let vectorCacheBytes = 0
  let lexicalQuery
  let isCanceled = () => false
  const checkCancellation = () => {
    if (isCanceled()) throw new Error('Pencarian memori dibatalkan.')
  }
  db.function('memory_literal_rank', (text, query) => {
    checkCancellation()
    if (lexicalQuery?.raw !== query) {
      const phrase = fold(query)
      const tokens = [...new Set(phrase.match(/[\p{L}\p{N}_]+/gu) || [])].slice(0, 12)
      const identifiers = [
        ...new Set(phrase.match(/[\p{L}\p{N}_]+(?:[./\\:-][\p{L}\p{N}_]+)+/gu) || [])
      ].slice(0, 6)
      lexicalQuery = { raw: query, phrase, identifiers, tokens }
    }
    const { phrase, identifiers, tokens } = lexicalQuery
    return literalRank(text, phrase, identifiers, tokens)
  })
  db.function('memory_vector_blob', { deterministic: true }, (text) => {
    checkCancellation()
    if (typeof text !== 'string') return null
    if (vectors.has(text)) return vectors.get(text)
    const vector = vectorBuffer(text)
    // Keep a bounded set of conversions. The exact stored text is the cache key.
    const bytes = text.length * 2 + (vector?.length ?? 0) + 96
    if (vectorCacheBytes + bytes <= vectorCacheLimit) {
      vectors.set(text, vector)
      vectorCacheBytes += bytes
    }
    return vector
  })

  function searchSource(source, options, embedding) {
    const { table, text, fields } = sources[source]
    const filters = []
    const args = { candidates: options.limit * 4 }
    if (source === 'memories' && options.types?.length) {
      filters.push(`type IN (${options.types.map((_, i) => `@type${i}`).join(', ')})`)
      options.types.forEach((type, i) => {
        args[`type${i}`] = type
      })
    }
    if (options.sessionId != null) {
      if (source !== 'chatTurns') return []
      filters.push('session_id = @session')
      args.session = options.sessionId
    }
    const where = filters.length ? filters.join(' AND ') : '1'

    let semantic = []
    if (embedding) {
      const semanticArgs = {
        ...args,
        embedding,
        threshold: options.threshold,
        zero: emptyVector
      }
      semantic = db
        .prepare(
          `
        WITH scored AS MATERIALIZED (
          SELECT id, 1 - vec_distance_cosine(
            COALESCE(memory_vector_blob(vector), @zero), @embedding
          ) AS score
          FROM ${table} WHERE ${where} AND vector IS NOT NULL
        )
        SELECT id, score FROM scored WHERE score >= @threshold
        ORDER BY score DESC, id LIMIT @candidates
      `
        )
        .all(semanticArgs)
    }
    let lexical = []
    const query = options.lexicalQuery ?? options.query
    if (!options.semanticOnly && query) {
      lexical = db
        .prepare(
          `
        WITH matches AS MATERIALIZED (
          SELECT id, memory_literal_rank(${text}, @query) AS rank FROM ${table} WHERE ${where}
        )
        SELECT id FROM matches WHERE rank > 0 ORDER BY rank DESC, id LIMIT @candidates
      `
        )
        .all({ ...args, query })
    }

    const ranked = new Map()
    for (const [rank, hit] of semantic.entries())
      ranked.set(hit.id, { score: Math.min(1, hit.score), rankScore: 1 / (61 + rank) })
    for (const [rank, hit] of lexical.entries()) {
      const entry = ranked.get(hit.id) || { score: null, rankScore: 0 }
      entry.rankScore += 1 / (61 + rank)
      ranked.set(hit.id, entry)
    }
    const read = db.prepare(`SELECT ${fields} FROM ${table} WHERE id = ?`)
    return [...ranked.entries()]
      .sort(
        ([idA, a], [idB, b]) =>
          b.rankScore - a.rankScore || (b.score ?? -1) - (a.score ?? -1) || idA.localeCompare(idB)
      )
      .slice(0, options.limit)
      .map(([id, scores]) => ({ ...read.get(id), ...scores, source }))
  }

  const search = db.transaction((options, embedding) =>
    Object.fromEntries(
      options.sources.map((source) => [
        source,
        searchSource(
          source,
          { ...options, threshold: options.thresholds?.[source] ?? options.threshold },
          embedding
        )
      ])
    )
  )
  const findClusters = db.transaction((threshold) => {
    const rows = db
      .prepare(
        `
        SELECT id, type, memory, created_at AS timestamp, vector FROM memories
        WHERE type IN ('profile','preference') AND vector IS NOT NULL ORDER BY id LIMIT 1000
      `
      )
      .all()
    const visited = new Set()
    const clusters = []
    for (const row of rows) {
      if (visited.has(row.id)) continue
      const embedding = vectorBuffer(row.vector)
      if (!embedding) continue
      const matches = searchSource(
        'memories',
        {
          types: [row.type],
          semanticOnly: true,
          limit: 20,
          threshold
        },
        embedding
      ).filter((hit) => hit.id !== row.id && !visited.has(hit.id))
      if (!matches.length) continue
      const items = [row, ...matches].map(({ id, type, memory, timestamp, createdAt }) => ({
        id,
        type,
        memory,
        timestamp: timestamp ?? createdAt
      }))
      items.forEach(({ id }) => visited.add(id))
      clusters.push({ group: clusters.length + 1, items })
    }
    return clusters
  })

  function cancellable(run, canceled) {
    isCanceled = canceled || (() => false)
    try {
      return run()
    } finally {
      isCanceled = () => false
      lexicalQuery = null
    }
  }

  return {
    clearCache() {
      vectors.clear()
      vectorCacheBytes = 0
    },
    search(options, embedding, canceled) {
      return cancellable(() => search(options, embedding), canceled)
    },
    clusters(threshold, canceled) {
      return cancellable(() => findClusters(threshold), canceled)
    }
  }
}
