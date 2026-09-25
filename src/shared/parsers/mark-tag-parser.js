/**
 * Unified Mark Tag Parser (V5)
 * Modul isomorphic murni (kompatibel dengan Node.js backend dan browser frontend).
 * Mendukung fixed schema (<mark mood="..." done="..." />), CoT reasoning (<think>),
 * serta sanitasi tag legacy (<mood:...>, [mood:...]) dari teks output.
 */

export const VALID_MOODS = [
  'neutral',
  'joy',
  'happy',
  'sadness',
  'sad',
  'fear',
  'anger',
  'angry',
  'disgust',
  'anxiety',
  'envy',
  'embarrassment',
  'ennui',
  'thinking',
  'sarcasm',
  'focused',
  'excited',
  'confused',
  'annoyed',
  'calm'
]

export const MOOD_NORMALIZATION = {
  happy: 'joy',
  sad: 'sadness',
  angry: 'anger',
  bored: 'ennui',
  anxious: 'anxiety'
}

export const MARK_TAG_SCHEMA = {
  mood: {
    type: 'string',
    default: 'neutral',
    validate: (val) => {
      if (!val) return 'neutral'
      const clean = String(val).trim().toLowerCase()
      const normalized = MOOD_NORMALIZATION[clean] || clean
      return VALID_MOODS.includes(normalized) ? normalized : 'neutral'
    }
  },
  done: {
    type: 'boolean',
    default: false,
    validate: (val) => {
      if (val === true || val === 'true' || val === 1 || val === '1') return true
      return false
    }
  }
}

const MARK_TAG_REGEX = /<mark\b([^>]*)\/?>/i
const THINK_BLOCK_REGEX = /<think>([\s\S]*?)<\/think>/i
const LEGACY_MOOD_REGEX = /(?:<|\[)mood:[a-zA-Z0-9_-]+(?:>|\])/gi
const LEGACY_DONE_REGEX = /<\/?done\s*\/?>/gi

/**
 * Parsing atribut XML dari tag string ke objek JavaScript sesuai fixed schema.
 * @param {string} attrString - String atribut di dalam tag <mark ...>
 * @returns {Record<string, any>} Objek metadata yang divalidasi
 */
export function parseAttributes(attrString) {
  const result = {
    mood: MARK_TAG_SCHEMA.mood.default,
    done: MARK_TAG_SCHEMA.done.default,
    hasExplicitDone: false
  }

  if (!attrString || typeof attrString !== 'string') {
    return result
  }

  const attrPattern = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  let match

  while ((match = attrPattern.exec(attrString)) !== null) {
    const rawKey = match[1].toLowerCase()
    const rawValue = match[2] ?? match[3] ?? match[4] ?? ''

    if (rawKey in MARK_TAG_SCHEMA) {
      result[rawKey] = MARK_TAG_SCHEMA[rawKey].validate(rawValue)
      if (rawKey === 'done') {
        result.hasExplicitDone = true
      }
    }
  }

  return result
}

/**
 * Membersihkan semua tag kontrol (V5 dan legacy) dari teks agar riwayat dan tampilan bersih.
 * @param {string} text - Teks mentah dari AI
 * @returns {string} Teks bersih bebas dari tag kontrol
 */
export function stripMarkTags(text) {
  if (!text || typeof text !== 'string') return ''

  return text
    .replace(THINK_BLOCK_REGEX, '')
    .replace(MARK_TAG_REGEX, '')
    .replace(/<\/mark>/gi, '')
    .replace(LEGACY_MOOD_REGEX, '')
    .replace(LEGACY_DONE_REGEX, '')
    .replace(/^\s+/, '')
}

/**
 * Parsing teks respons AI untuk mengekstrak metadata <mark>, CoT reasoning, dan cleanContent.
 * @param {string} rawText - Teks mentah dari AI
 * @returns {{ meta: { mood: string, done: boolean, hasTag: boolean, hasExplicitDone: boolean }, reasoning: string, cleanContent: string }}
 */
export function parseMarkTag(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      meta: {
        mood: MARK_TAG_SCHEMA.mood.default,
        done: MARK_TAG_SCHEMA.done.default,
        hasTag: false,
        hasExplicitDone: false
      },
      reasoning: '',
      cleanContent: ''
    }
  }

  // 1. Ekstraksi CoT Reasoning (<think>...</think>)
  let reasoning = ''
  const thinkMatch = rawText.match(THINK_BLOCK_REGEX)
  if (thinkMatch) {
    reasoning = thinkMatch[1].trim()
  }

  // 2. Ekstraksi Tag <mark ... />
  let meta = {
    mood: MARK_TAG_SCHEMA.mood.default,
    done: MARK_TAG_SCHEMA.done.default,
    hasTag: false,
    hasExplicitDone: false
  }

  const markMatch = rawText.match(MARK_TAG_REGEX)
  if (markMatch) {
    const attrString = markMatch[1]
    const parsedAttrs = parseAttributes(attrString)
    meta = {
      ...parsedAttrs,
      hasTag: true
    }
  }

  // 3. Sanitasi teks untuk tampilan dan penyimpanan
  const cleanContent = stripMarkTags(rawText)

  return {
    meta,
    reasoning,
    cleanContent
  }
}

/**
 * Factory untuk membuat stream filter stateful.
 * Mem-buffer awal stream untuk mendeteksi <mark ... />, memicu onMeta, dan menyalurkan chunk bersih.
 * @param {{ onMeta?: (meta: { mood: string, done: boolean }) => void, onChunk?: (chunk: string) => void }} callbacks
 */
export function createMarkStreamFilter({ onMeta, onChunk } = {}) {
  let flushed = false
  let buffer = ''
  const MAX_BUFFER_LENGTH = 160

  const emitMeta = (meta) => {
    if (typeof onMeta === 'function') {
      try {
        onMeta(meta)
      } catch (err) {
        console.error('[MarkStreamFilter] Error in onMeta callback:', err)
      }
    }
  }

  const emitChunk = (chunk) => {
    if (chunk && typeof onChunk === 'function') {
      onChunk(chunk)
    }
  }

  return {
    /**
     * Memproses potongan token baru dari stream.
     * @param {string} chunk - Potongan teks token
     */
    write(chunk) {
      if (typeof chunk !== 'string') return

      if (flushed) {
        emitChunk(chunk)
        return
      }

      buffer += chunk

      // Cari apakah tag <mark ... /> sudah lengkap di dalam buffer
      const markMatch = buffer.match(MARK_TAG_REGEX)
      if (markMatch) {
        const meta = parseAttributes(markMatch[1])
        emitMeta(meta)

        // Hapus tag <mark ... /> dari buffer dan trim newline awal jika ada
        const tagIndex = buffer.indexOf(markMatch[0])
        const afterTag = buffer.slice(tagIndex + markMatch[0].length).replace(/^[\r\n]+/, '')
        flushed = true
        buffer = ''

        if (afterTag.length > 0) {
          emitChunk(afterTag)
        }
        return
      }

      // Jika buffer melebihi batas atau ada baris baru tanpa awalan tag, flush default
      const trimmed = buffer.trimStart()
      const hasNewlineWithoutTag = trimmed.includes('\n') && !trimmed.startsWith('<')
      if (buffer.length >= MAX_BUFFER_LENGTH || hasNewlineWithoutTag) {
        emitMeta({
          mood: MARK_TAG_SCHEMA.mood.default,
          done: MARK_TAG_SCHEMA.done.default
        })
        flushed = true
        const out = buffer
        buffer = ''
        emitChunk(out)
      }
    },

    /**
     * Menuntaskan stream jika stream berakhir sebelum buffer mencapai batas.
     */
    flush() {
      if (flushed) return

      const markMatch = buffer.match(MARK_TAG_REGEX)
      if (markMatch) {
        const meta = parseAttributes(markMatch[1])
        emitMeta(meta)
        const tagIndex = buffer.indexOf(markMatch[0])
        const afterTag = buffer.slice(tagIndex + markMatch[0].length).replace(/^[\r\n]+/, '')
        flushed = true
        buffer = ''
        if (afterTag.length > 0) {
          emitChunk(afterTag)
        }
      } else {
        emitMeta({
          mood: MARK_TAG_SCHEMA.mood.default,
          done: MARK_TAG_SCHEMA.done.default
        })
        flushed = true
        const out = buffer
        buffer = ''
        if (out.length > 0) {
          emitChunk(out)
        }
      }
    }
  }
}
