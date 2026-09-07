import {
  navigateTo,
  readDOM,
  executeAction,
  closeBrowser,
  executeScript,
  extractData,
  takeScreenshot,
  downloadFile,
  showBrowserWindow,
  hideBrowserWindow
} from '../browser-agent.js'

export const browserTools = {
  'browser-search': {
    needsApproval: false,
    handler: async (args) => {
      try {
        const searchQuery = (typeof args === 'object' && args !== null ? args.query || args.keyword : String(args || '')).trim()
        if (!searchQuery) return { success: false, message: 'Query pencarian kosong.' }

        let results = []
        const clean = (s) =>
          (s || '')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&nbsp;/g, ' ')
            .replace(/&#0183;/g, '·')
            .replace(/\s+/g, ' ')
            .trim()

        const axios = (await import('axios')).default

        // 1. Engine 1 (Fresh News): Google News RSS - Selalu update jam & hari ini
        try {
          const newsRes = await axios.get(
            `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=id&gl=ID&ceid=ID:id`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              timeout: 6000
            }
          )
          const xml = newsRes.data || ''
          const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || []
          for (const item of items.slice(0, 4)) {
            const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i)
            const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i)
            const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)
            const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i)

            if (linkMatch && titleMatch) {
              const dateStr = pubDateMatch ? ` [${clean(pubDateMatch[1])}]` : ''
              results.push({
                title: clean(titleMatch[1]),
                url: clean(linkMatch[1]),
                snippet: clean(descMatch ? descMatch[1] : '') + dateStr
              })
            }
          }
        } catch (_) {}

        // 2. Engine 2 (Web Results): Bing Search dengan URL Decoder
        if (results.length < 5) {
          try {
            const decodeBingUrl = (url) => {
              if (!url || !url.includes('bing.com/ck/')) return url
              const match = url.match(/[?&]u=a1([^&]+)/i) || url.match(/[?&amp;]u=a1([^&]+)/i)
              if (match) {
                try {
                  let b64 = match[1].replace(/-/g, '+').replace(/_/g, '/')
                  while (b64.length % 4) b64 += '='
                  return Buffer.from(b64, 'base64').toString('utf8')
                } catch (_) {}
              }
              return url
            }

            const bingRes = await axios.get(
              `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}&count=10`,
              {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
                },
                timeout: 7000
              }
            )
            const html = bingRes.data || ''
            const regex = /<li class="b_algo"[\s\S]*?<\/li>/gi
            let match
            while ((match = regex.exec(html)) !== null && results.length < 6) {
              const li = match[0]
              const anchors = [...li.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
              let realUrl = ''
              let rawTitle = ''

              for (const a of anchors) {
                const href = a[1]
                const inner = a[2] || ''
                if (href.includes('bing.com/ck/') || href.startsWith('http')) {
                  if (!realUrl) realUrl = decodeBingUrl(href)
                  if (!rawTitle && !inner.includes('class="tpic"') && !inner.includes('class="wr_fav"')) {
                    rawTitle = inner
                  }
                }
              }

              const snippetMatch =
                li.match(/<div class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) ||
                li.match(/<p[^>]*>([\s\S]*?)<\/p>/i)

              if (realUrl && !realUrl.includes('bing.com/search') && !realUrl.endsWith('.css') && !realUrl.endsWith('.js')) {
                const title = clean(rawTitle.includes('›') ? rawTitle.split('›').pop() : rawTitle)
                const snippet = clean(snippetMatch ? snippetMatch[1] : '')
                if (title && !results.some((r) => r.url === realUrl)) {
                  results.push({ title: title || 'Web Result', url: realUrl, snippet })
                }
              }
            }
          } catch (_) {}
        }

        // 3. Engine 3 (Fallback General): Bing RSS Feed
        if (results.length === 0) {
          try {
            const rssRes = await axios.get(
              `https://www.bing.com/search?format=rss&q=${encodeURIComponent(searchQuery)}`,
              {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 7000
              }
            )
            const xml = rssRes.data || ''
            const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || []
            for (const item of items.slice(0, 5)) {
              const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i)
              const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i)
              const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i)
              if (linkMatch && titleMatch) {
                results.push({
                  title: clean(titleMatch[1]),
                  url: clean(linkMatch[1]),
                  snippet: clean(descMatch ? descMatch[1] : '')
                })
              }
            }
          } catch (_) {}
        }

        if (results.length === 0) {
          return {
            success: true,
            data: `Tidak ditemukan link web yang cocok untuk "${searchQuery}". Coba gunakan kata kunci lain.`
          }
        }

        const formatted = results
          .map(
            (r, idx) =>
              `${idx + 1}. [${r.title}](${r.url})\n   Snippet: ${r.snippet ? r.snippet.replace(/\n+/g, ' ') : 'Tidak ada ringkasan.'}`
          )
          .join('\n\n')

        return {
          success: true,
          data: `[DAFTAR URL HASIL PENCARIAN UNTUK: "${searchQuery}"]\n(Gunakan tool "browser-fetch" dengan parameter url jika kamu ingin membaca isi artikel lengkap dari link di bawah)\n\n${formatted}`
        }
      } catch (err) {
        return { success: false, message: `Gagal melakukan web search: ${err.message}` }
      }
    }
  },

  'browser-fetch': {
    needsApproval: false,
    handler: async (args) => {
      let targetUrl = (typeof args === 'object' && args !== null ? args.url : String(args || '')).trim()
      const maxChars = typeof args === 'object' && args !== null ? (parseInt(args.max_chars, 10) || 4000) : 4000
      if (!targetUrl) return { success: false, message: 'URL tujuan tidak boleh kosong.' }

      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl
      }

      try {
        const axios = (await import('axios')).default
        const response = await axios.get(targetUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
          },
          timeout: 12000,
          maxRedirects: 5
        })

        const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

        // Bersihkan tag script, style, svg, noscript, nav, footer, header
        let cleanText = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
          .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
          .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
          .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
          .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
          .replace(/<br\s*[\/]?>/gi, '\n')
          .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr)>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&nbsp;/g, ' ')
          .replace(/\t+/g, ' ')
          .replace(/[ ]{2,}/g, ' ')
          .replace(/\n\s*\n\s*\n+/g, '\n\n')
          .trim()

        if (cleanText.length > maxChars) {
          cleanText = cleanText.slice(0, maxChars) + `\n\n[...KONTEN DIPOTONG KARENA MELEBIHI ${maxChars} KARAKTER...]`
        }

        return {
          success: true,
          url: targetUrl,
          data: `[KONTEN HASIL FETCH DARI: ${targetUrl}]\n\n${cleanText || 'Halaman kosong atau hanya berisi elemen grafis/JavaScript dinamis.'}`
        }
      } catch (err) {
        return {
          success: false,
          url: targetUrl,
          error: `Gagal mengambil konten dari ${targetUrl}: ${err.message}. Kamu bisa menggunakan 'browser-navigate' sebagai alternatif.`
        }
      }
    }
  },

  'browser-navigate': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        let url = (typeof args === 'object' && args !== null ? args.url : String(args || '')).trim()
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url
        }
        const sessionId = config?.sessionId || 'default'
        const result = await navigateTo(url, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-close': {
    handler: async (args, config) => {
      try {
        const sessionId = config?.sessionId || (typeof args === 'object' && args !== null ? (args.session_id || 'default') : String(args || '').trim() || 'default')
        const result = await closeBrowser(sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-show': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const sessionId = config?.sessionId || (typeof args === 'object' && args !== null ? (args.session_id || 'default') : String(args || '').trim() || 'default')
        const result = await showBrowserWindow(sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-hide': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const sessionId = config?.sessionId || (typeof args === 'object' && args !== null ? (args.session_id || 'default') : String(args || '').trim() || 'default')
        const result = await hideBrowserWindow(sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-read': {
    needsApproval: false,
    handler: async (_args, config) => {
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await readDOM(sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-click': {
    needsApproval: false,
    handler: async (args, config) => {
      let id = NaN
      if (typeof args === 'object' && args !== null) {
        id = parseInt(args.element_id ?? args.id, 10)
      } else {
        id = parseInt(String(args || '').trim(), 10)
      }
      if (isNaN(id)) return { success: false, error: 'element_id harus berupa angka.' }
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await executeAction({ action: 'click', id }, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-type': {
    needsApproval: false,
    handler: async (args, config) => {
      let id = NaN
      let text = ''
      if (typeof args === 'object' && args !== null) {
        id = parseInt(args.element_id ?? args.id, 10)
        text = String(args.text ?? '')
      } else {
        const parts = String(args || '').split('||')
        if (parts.length < 2) return { success: false, error: 'Format: ID||teks' }
        id = parseInt(parts[0].trim(), 10)
        text = parts.slice(1).join('||')
      }
      if (isNaN(id)) return { success: false, error: 'element_id harus berupa angka.' }
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await executeAction({ action: 'type', id, value: text }, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-scroll': {
    needsApproval: false,
    handler: async (args, config) => {
      const direction = (typeof args === 'object' && args !== null ? args.direction : String(args || '')).trim().toLowerCase()
      if (direction !== 'up' && direction !== 'down') {
        return { success: false, error: "Gunakan 'up' atau 'down'." }
      }
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await executeAction({ action: 'scroll', direction }, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-ask-user': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const prompt = typeof args === 'object' && args !== null ? (args.prompt || '') : String(args || '')
        const sessionId = config?.sessionId || 'default'
        const result = await executeAction({ action: 'unblock', value: prompt }, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-script': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const script = typeof args === 'object' && args !== null ? (args.script || '') : String(args || '')
        const sessionId = config?.sessionId || 'default'
        const result = await executeScript(script, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-extract': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const selector = typeof args === 'object' && args !== null ? (args.selector || '') : String(args || '')
        const sessionId = config?.sessionId || 'default'
        const result = await extractData(selector, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-screenshot': {
    needsApproval: false,
    handler: async (args, config) => {
      try {
        const filename = typeof args === 'object' && args !== null ? (args.filename || 'screenshot.png') : String(args || 'screenshot.png')
        const sessionId = config?.sessionId || 'default'
        const result = await takeScreenshot(filename, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },

  'browser-download': {
    needsApproval: true,
    approvalMessage: (args) => {
      const url = typeof args === 'object' && args !== null ? `${args.url} -> ${args.filename}` : String(args || '')
      return `Mark ingin mendownload file dari browser:\n\n${url}`
    },
    handler: async (args, config) => {
      let url = ''
      let filename = ''
      if (typeof args === 'object' && args !== null) {
        url = (args.url || '').trim()
        filename = (args.filename || '').trim()
      } else {
        const parts = String(args || '').split('||')
        if (parts.length < 2) return { success: false, error: 'Format: url||filename' }
        url = parts[0].trim()
        filename = parts[1].trim()
      }
      try {
        const sessionId = config?.sessionId || 'default'
        const result = await downloadFile(url, filename, sessionId)
        return { success: true, data: result }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
}
