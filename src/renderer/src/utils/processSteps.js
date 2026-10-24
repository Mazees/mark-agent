import { stripMarkTags } from '@shared/parsers/mark-tag-parser.js'

export function sanitizeProcessSteps(steps) {
  if (!Array.isArray(steps)) return []

  return steps.flatMap((step) => {
    if (!step) return []
    if (typeof step === 'string') {
      const text = stripMarkTags(step)
      return text ? [{ type: 'narration', text }] : []
    }

    if (typeof step !== 'object' || Array.isArray(step)) return []

    if (step.type === 'intervention') {
      const text = stripMarkTags(step.text || step.content || step.message || step.task || '')
      return text ? [{ ...step, text }] : []
    }

    const isToolStep = Boolean(
      step.tool || step.action || step.query || step.fullResult || step.resultSummary
    )
    if (
      step.type === 'narration' ||
      (!isToolStep && (step.text || step.content || step.message || step.task))
    ) {
      const text = stripMarkTags(step.text || step.content || step.message || step.task)
      return text ? [{ ...step, type: 'narration', text }] : []
    }

    return [step]
  })
}

export function recordProgressMessage(steps, message, id) {
  const text = stripMarkTags(message)
  if (!text) return false
  const existing = steps.findIndex((step) => step.id === id)
  if (existing >= 0) {
    if (steps[existing].text === text) return false
    steps[existing] = { ...steps[existing], text }
  } else {
    if (steps.some((step) => step.type === 'narration' && step.text === text)) return false
    steps.push({ id, type: 'narration', source: 'metadata', text, timestamp: Date.now() })
  }
  return true
}

export function splitProcessTimeline(steps) {
  const segments = []
  for (const step of sanitizeProcessSteps(steps)) {
    if (step.type === 'narration' || (step.type !== 'intervention' && !step.tool && step.text)) {
      segments.push({ type: 'narration', text: step.text, id: step.id })
    } else {
      let group = segments[segments.length - 1]
      if (group?.type !== 'tools') {
        group = { type: 'tools', steps: [] }
        segments.push(group)
      }
      group.steps.push(step)
    }
  }
  return segments
}

export function buildProgressReminder(steps, { initial = false } = {}) {
  let lastNarration = -1
  for (let index = steps.length - 1; index >= 0; index--) {
    if (steps[index].type === 'narration' && stripMarkTags(steps[index].text)) {
      lastNarration = index
      break
    }
  }
  const toolsSinceUpdate = steps.slice(lastNarration + 1).filter((step) => step.tool || step.action)
  const hasFailure = toolsSinceUpdate.some(
    (step) => step.status === 'failed' || step.status === 'error'
  )
  if (!initial && toolsSinceUpdate.length < 3 && !hasFailure) return null

  const instruction = initial
    ? 'Jika tugas ini membutuhkan beberapa langkah, awali dengan pesan progres yang menjelaskan apa yang akan diperiksa atau dikerjakan. Untuk jawaban langsung yang sederhana, message boleh kosong.'
    : `Sudah ada ${toolsSinceUpdate.length} eksekusi tool sejak update terakhir${hasFailure ? ', termasuk kegagalan' : ''}. Pada respons berikutnya, isi message dengan update progres nyata 1-4 kalimat sebelum melanjutkan tool atau memberi jawaban akhir: temuan yang sudah diperoleh, kendala, dan langkah selanjutnya. Gunakan hasil observasi yang tersedia; jangan mengarang hasil.`
  return `[UPDATE PROGRES UNTUK PENGGUNA]\n${instruction}\nGunakan bahasa pengguna. Untuk format tag, tulis di atribut <mark mood="..." done="..." message="..." />; untuk format JSON, gunakan properti message. Pesan ini adalah komunikasi ke pengguna, bukan thought/reasoning. Jangan menyalin pesan progres sebelumnya atau instruksi ini. Tidak wajib mengeluarkan update pada setiap loop.`
}
