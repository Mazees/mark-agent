export function normalizeBrowserUrl(value) {
  let input = String(value ?? '').trim()
  if (!/^https?:\/\//i.test(input)) {
    const embeddedUrl = input.match(/https?:\/\/[^\s<>"'`)\]]+/i)
    if (embeddedUrl) input = embeddedUrl[0]
  }
  input = input.replace(/&amp;/gi, '&').replace(/[),.]+$/, '')
  if (input.startsWith('<') && input.endsWith('>')) input = input.slice(1, -1)
  if (!input) throw new Error('URL tujuan tidak boleh kosong.')
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(input) && !/^https?:\/\//i.test(input)) {
    throw new Error('URL tidak valid. Hanya alamat HTTP atau HTTPS yang didukung.')
  }

  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`
  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error('URL tidak valid. Gunakan alamat web biasa, misalnya https://example.com/.')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('URL tidak valid. Hanya alamat HTTP atau HTTPS yang didukung.')
  }
  return parsed.href
}

export function describeBrowserNetworkError(error) {
  const message = String(error?.message || error || 'Kesalahan jaringan tidak diketahui')
  if (/EAI_AGAIN|ENOTFOUND|ERR_NAME_NOT_RESOLVED/i.test(message)) {
    return `${message}. Resolusi nama domain gagal atau sementara tidak tersedia; dari error ini saja belum bisa dipastikan apakah penyebabnya jaringan lokal, DNS, atau domain tujuan.`
  }
  return message
}
