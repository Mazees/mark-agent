import { searchYoutube, getTranscript, synthesizeTTS } from '../../server/tools/media-tools.js'

export const mediaTools = {
  'search-youtube': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const q = (typeof args === 'object' && args !== null ? (args.query || '') : String(args || '')).trim()
        const result = await searchYoutube(q)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'youtube-transcript': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const url = (typeof args === 'object' && args !== null ? (args.url || '') : String(args || '')).trim()
        const result = await getTranscript(url)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'tts-speak': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const text = (typeof args === 'object' && args !== null ? (args.text || '') : String(args || '')).trim()
        const result = await synthesizeTTS(text)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
}
