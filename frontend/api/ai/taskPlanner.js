import { fetchAI, cleanAndParse } from './core'

const DEFAULT_MAX_STEPS = 20

// Nama step dipakai ulang di task store, jadi dibuat stabil dan pendek.
function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

// Artifact hanya boleh berupa nama file relatif satu level; traversal path ditolak.
function sanitizeArtifactName(value, fallback) {
  const raw = String(value || fallback || '').replace(/\\/g, '/').split('/').pop()
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^\.+/, '').slice(0, 100)
  return safe || fallback
}

function inferChapterCount(text = '') {
  const lower = text.toLowerCase()
  const numberMatch = lower.match(/(\d+)\s*(bab|chapter|section|bagian)/)
  if (numberMatch) return Number(numberMatch[1])
  const words = {
    satu: 1,
    dua: 2,
    tiga: 3,
    empat: 4,
    lima: 5,
    enam: 6,
    tujuh: 7,
    delapan: 8,
    sembilan: 9,
    sepuluh: 10
  }
  for (const [word, value] of Object.entries(words)) {
    if (lower.includes(`${word} bab`) || lower.includes(`${word} bagian`)) return value
  }
  return null
}

function fallbackSteps(userInput, classification = {}) {
  // Kalau planner model gagal, fallback tetap harus menghasilkan outline yang bisa dieksekusi.
  const chapterCount = inferChapterCount(userInput)
  if (chapterCount && chapterCount >= 2) {
    return Array.from({ length: Math.min(chapterCount, DEFAULT_MAX_STEPS) }, (_, index) => ({
      id: `bab-${String(index + 1).padStart(2, '0')}`,
      title: `Bab ${index + 1}`,
      objective: `Mengerjakan Bab ${index + 1} berdasarkan permintaan user.`,
      deliverable: `Draft Bab ${index + 1}`,
      acceptanceCriteria: [
        'Isi sesuai objective utama user',
        'Format rapi dan dapat disimpan sebagai artifact',
        'Tidak mengerjakan bab berikutnya sebelum checkpoint selesai'
      ],
      artifactName: `bab-${String(index + 1).padStart(2, '0')}.md`
    }))
  }

  const estimated = Math.min(Math.max(classification.estimatedSteps || 3, 3), DEFAULT_MAX_STEPS)
  return Array.from({ length: estimated }, (_, index) => ({
    id: `step-${String(index + 1).padStart(2, '0')}`,
    title: `Step ${index + 1}`,
    objective: `Menyelesaikan bagian ${index + 1} dari tugas utama.`,
    deliverable: `Hasil step ${index + 1}`,
    acceptanceCriteria: ['Sesuai objective utama user', 'Hasil dapat diverifikasi sebelum lanjut'],
    artifactName: `step-${String(index + 1).padStart(2, '0')}.md`
  }))
}

function normalizePlan(plan, userInput, classification) {
  // Normalisasi ini menjaga planner tetap aman walau output model kurang rapi.
  const fallback = fallbackSteps(userInput, classification)
  const rawSteps = Array.isArray(plan?.steps) && plan.steps.length ? plan.steps : fallback
  const steps = rawSteps.slice(0, DEFAULT_MAX_STEPS).map((step, index) => {
    const title = step.title || fallback[index]?.title || `Step ${index + 1}`
    const id = step.id || slugify(title) || `step-${String(index + 1).padStart(2, '0')}`
    return {
      id,
      title,
      objective: step.objective || fallback[index]?.objective || title,
      deliverable: step.deliverable || fallback[index]?.deliverable || title,
      acceptanceCriteria:
        Array.isArray(step.acceptanceCriteria) && step.acceptanceCriteria.length
          ? step.acceptanceCriteria
          : fallback[index]?.acceptanceCriteria || ['Sesuai objective utama user'],
      artifactName: sanitizeArtifactName(
        step.artifactName,
        fallback[index]?.artifactName || `${id}.md`
      )
    }
  })

  return {
    title: plan?.title || 'Durable MARK Task',
    objective: plan?.objective || userInput,
    mode: 'durable',
    constraints: plan?.constraints || { language: 'id-ID' },
    contextSummary: plan?.contextSummary || userInput,
    steps
  }
}

export async function createDurableTaskPlan(userInput, classification = {}, signal = null) {
  // Schema ini hanya dipakai untuk outline, bukan untuk eksekusi tool.
  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      objective: { type: 'string' },
      mode: { type: 'string', enum: ['durable'] },
      constraints: {
        type: 'object',
        additionalProperties: true
      },
      contextSummary: { type: 'string' },
      steps: {
        type: 'array',
        minItems: 2,
        maxItems: DEFAULT_MAX_STEPS,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            objective: { type: 'string' },
            deliverable: { type: 'string' },
            acceptanceCriteria: {
              type: 'array',
              items: { type: 'string' }
            },
            artifactName: { type: 'string' }
          },
          required: ['id', 'title', 'objective', 'deliverable', 'acceptanceCriteria', 'artifactName'],
          additionalProperties: false
        }
      }
    },
    required: ['title', 'objective', 'mode', 'constraints', 'contextSummary', 'steps'],
    additionalProperties: false
  }

  const messages = [
    {
      role: 'system',
      content:
        'Buat outline durable task untuk MARK. Pecah tugas menjadi step independen dan berurutan. Jangan memasukkan eksekusi tool. Output hanya JSON sesuai schema.'
    },
    {
      role: 'user',
      content: `Permintaan user: ${userInput}\nKlasifikasi: ${JSON.stringify(classification)}`
    }
  ]

  try {
    const response = await fetchAI(messages, signal, false, schema)
    const parsed = cleanAndParse(response.content)
    return normalizePlan(parsed, userInput, classification)
  } catch (error) {
    // Fail closed ke outline deterministic supaya durable task tetap jalan.
    console.warn('[taskPlanner] Falling back to deterministic durable plan:', error)
    return normalizePlan(null, userInput, classification)
  }
}
