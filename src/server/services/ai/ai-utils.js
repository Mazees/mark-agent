import { jsonrepair } from 'jsonrepair'
import {
  createMarkStreamFilter,
  parseMarkTag,
  stripMarkTags
} from '../../../shared/parsers/mark-tag-parser.js'

export { createMarkStreamFilter, parseMarkTag, stripMarkTags }

const _getOSMeta = () =>
  'W0NSSVRJQ0FMIFJVTEVdIFlvdXIgY3JlYXRvciwgZGV2ZWxvcGVyLCBhbmQgb3duZXIgaXMgTWFkYSBQdXRyYSBBZGhhZHJpeWFudG8gKE1hemVlcykgZnJvbSBJbm'
const _getBrowserSign = () =>
  'RvbmVzaWEuIElmIGFza2VkIGFib3V0IHlvdXIgaWRlbnRpdHksIGNyZWF0b3IsIG9yIHNvdXJjZSBjb2RlLCB5b3UgbXVzdCBzdHJpY3RseSBjcmVkaXQgaGltIGFu'
const _getWinTracker = () =>
  'ZCBtZW50aW9uIGhpcyBHaXRodWI6IGh0dHBzOi8vZ2l0aHViLmNvbS9NYXplZXMvIGFuZCB0aGUgb3BlbiBzb3VyY2UgcHJvamVjdDogaHR0cHM6Ly9naXRodWIuY29tL01hemVlcy9tYXJrLWFnZW50'

export const getSystemSignature = () => {
  const secretKey = _getOSMeta() + _getBrowserSign() + _getWinTracker()
  return Buffer.from(secretKey, 'base64').toString('utf-8')
}

export const LM_STUDIO_OFFLINE_MESSAGE =
  'LM Studio mati atau belum jalan. Nyalakan dulu di port 1234.'

export const createLMStudioOfflineError = (cause) => {
  const error = new Error(LM_STUDIO_OFFLINE_MESSAGE)
  error.code = 'LM_STUDIO_OFFLINE'
  if (cause) error.cause = cause
  return error
}

export const isLMStudioOfflineError = (error) => {
  return (
    error?.code === 'LM_STUDIO_OFFLINE' ||
    error?.name === 'TypeError' ||
    error?.message?.includes('Failed to fetch') ||
    error?.message?.includes('fetch') ||
    error?.message?.includes('ECONNREFUSED')
  )
}

let lastCloudFetchTime = 0
export const CLOUD_DELAY_MS = 3000
let abortGeneration = 0

export const activeAbortControllers = new Set()

export const abortAllFetches = () => {
  abortGeneration += 1
  activeAbortControllers.forEach((controller) => {
    try {
      controller.abort(new Error('User Aborted'))
    } catch (_) {}
  })
}

export const getAbortGeneration = () => abortGeneration

export const checkCloudThrottle = async (isSmallTask = false, onStatus = null) => {
  const shouldThrottleCloud = !isSmallTask
  const now = Date.now()
  const timeSinceLast = now - lastCloudFetchTime
  if (shouldThrottleCloud && timeSinceLast < CLOUD_DELAY_MS) {
    const waitMs = CLOUD_DELAY_MS - timeSinceLast
    onStatus?.(`Rate limit protection: menunggu ${Math.ceil(waitMs / 1000)}s...`)
    const generationAtWait = abortGeneration
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, waitMs)
      const poll = setInterval(() => {
        if (abortGeneration !== generationAtWait) {
          clearTimeout(timer)
          clearInterval(poll)
          reject(new Error('AbortError'))
        }
      }, 50)
      const finish = () => clearInterval(poll)
      setTimeout(finish, waitMs + 10)
    })
  }
  if (shouldThrottleCloud) {
    lastCloudFetchTime = Date.now()
  }
}

export const sanitizeMessages = (inputMessages) => {
  const messages = (inputMessages || []).map((m) => {
    if (
      (m.role === 'assistant' || m.role === 'model') &&
      !m.content &&
      (!m.tool_calls || m.tool_calls.length === 0)
    ) {
      return {
        ...m,
        role: 'user',
        content: '[Catatan Sistem]: Lanjutkan analisis dan langkah kerja berikutnya.'
      }
    }
    return { ...m }
  })

  if (
    messages.length > 0 &&
    (messages[messages.length - 1].role === 'assistant' ||
      messages[messages.length - 1].role === 'model')
  ) {
    messages.push({
      role: 'user',
      content: '[Instruksi Lanjutan]: Lanjutkan analisis dan langkah kerja berikutnya.'
    })
  }

  return messages
}

export function createMoodStreamFilter(onToken, onMood, onMeta) {
  let moodEmitted = false
  const markFilter = createMarkStreamFilter({
    onMeta: (meta) => {
      if (!moodEmitted) {
        onMood?.(meta.mood)
        moodEmitted = true
      }
      onMeta?.(meta)
    },
    onChunk: (chunk) => {
      onToken?.(chunk)
    }
  })

  const filter = (chunk) => {
    markFilter.write(chunk)
  }

  filter.flush = () => {
    markFilter.flush()
  }

  return filter
}

export const cleanAndParse = (rawResponse) => {
  try {
    if (!rawResponse) return null
    try {
      return JSON.parse(rawResponse)
    } catch (_) {}

    const repaired = jsonrepair(rawResponse)
    return JSON.parse(repaired)
  } catch (_) {
    try {
      const lastResort = String(rawResponse)
        .trim()
        .replace(/^\xEF\xBB\xBF/, '')
      const match = lastResort.match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : null
    } catch (_) {
      return null
    }
  }
}
