import { defaultUrlTransform } from 'react-markdown'

export function transformChatLinkUrl(value) {
  if (/^(?:[a-z]:[\\/]|file:\/\/)/i.test(value)) return value
  return defaultUrlTransform(value)
}

export function resolveChatLink(value, sessionId, baseUrl) {
  const href = transformChatLinkUrl(typeof value === 'string' ? value.trim() : '')
  if (!href || href.startsWith('#')) return href
  if (/^(?:https?:|mailto:)/i.test(href)) return href
  if (href.startsWith('//')) return new URL(href, baseUrl).href
  if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^(?:[a-z]:[\\/]|file:\/\/)/i.test(href)) return ''
  if (href.startsWith('/api/')) return new URL(href, baseUrl).href

  let file = href
  if (/^file:\/\//i.test(href)) {
    try {
      const url = new URL(href)
      if (url.hostname && url.hostname !== 'localhost') return ''
      file = decodeURIComponent(url.pathname).replace(/^\/([a-z]:)/i, '$1')
    } catch {
      return ''
    }
  } else {
    try {
      file = decodeURIComponent(href)
    } catch {
      return ''
    }
  }
  const url = new URL('/api/workspace/download', baseUrl)
  url.searchParams.set('sessionId', String(sessionId))
  url.searchParams.set('path', file)
  return url.href
}
