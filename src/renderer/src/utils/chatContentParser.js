/**
 * chatContentParser.js
 * Helper murni untuk parsing dan transformasi teks pada ChatList
 * Memisahkan pemrosesan regex & parsing XML dari siklus render React
 */

/**
 * Parsing teks pesan user: bersihkan instruksi internal skill dan ambil tag skill
 */
export function parseUserContent(content) {
  let displayUserContent = content
  let extractedSkillTag = null

  if (typeof content === 'string') {
    if (content.includes('=== SYSTEM INSTRUCTION: SKILL DIAKTIFKAN ===')) {
      const parts = content.split('=== SYSTEM INSTRUCTION: SKILL DIAKTIFKAN ===')
      const promptPart = (parts[0] || '').trim()

      const skillTagMatch = content.match(
        /---\s*SKILL\s+(?:BAWAAN|EXTERNAL):\s*([a-zA-Z0-9_-]+)\s*---/i
      )
      if (skillTagMatch) {
        extractedSkillTag = skillTagMatch[1].toLowerCase()
      }

      displayUserContent =
        promptPart || (extractedSkillTag ? `/${extractedSkillTag}` : 'Jalankan Skill')
    }
  }

  return { displayUserContent, extractedSkillTag }
}

/**
 * Parsing konten AI: ekstraksi widget aksi bawaan (<FollowUp>, <ElicitationsGroup>, dll.)
 * serta pembersihan tag XML internal dengan perlindungan terhadap code block markdown
 */
export function parseAiContent(content) {
  if (typeof content !== 'string') {
    return {
      cleanAiContent: content || '',
      followUpChips: [],
      elicitationGroup: null
    }
  }

  // 1. Code Block Shielding: Pisahkan blok kode agar tag XML di dalam contoh kode tidak ikut terhapus
  const codeBlocks = []
  let maskedContent = content.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    codeBlocks.push(match)
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`
  })

  let elicitationGroup = null

  // 2. Ekstraksi <ElicitationsGroup message="..."> ... </ElicitationsGroup>
  const groupRegex = /<ElicitationsGroup\b([^>]*?)>([\s\S]*?)<\/ElicitationsGroup>/i
  const groupMatch = groupRegex.exec(maskedContent)
  if (groupMatch) {
    const groupAttrs = groupMatch[1] || ''
    const groupBody = groupMatch[2] || ''

    const msgMatch = groupAttrs.match(/message=(?:"([^"]*)"|'([^']*)')/i)
    const groupMessage = msgMatch ? (msgMatch[1] || msgMatch[2] || '').trim() : null

    const options = []
    const optRegex = /<([A-Za-z0-9_-]+)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g
    let optMatch
    while ((optMatch = optRegex.exec(groupBody)) !== null) {
      const attrsStr = optMatch[2] || ''
      const bodyStr = (optMatch[3] || '').trim()
      const labelMatch = attrsStr.match(/label=(?:"([^"]*)"|'([^']*)')/i)
      const queryMatch = attrsStr.match(/query=(?:"([^"]*)"|'([^']*)')/i)
      const label = labelMatch ? labelMatch[1] || labelMatch[2] : bodyStr
      const query = queryMatch ? queryMatch[1] || queryMatch[2] : null

      if (label && query) {
        options.push({ label: label.trim(), query: query.trim() })
      }
    }

    if (options.length > 0) {
      elicitationGroup = {
        message: groupMessage,
        options
      }
    }
    maskedContent = maskedContent.replace(groupMatch[0], '')
  }

  // 3. Ekstraksi tag-tag saran mandiri / bebas: <FollowUp>, <Suggestion>, <SuggestedAction>, <Elicitation>
  const followUpChips = []
  const chipTagRegex =
    /<(?:FollowUp|Suggestion|SuggestedAction|Elicitation)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:FollowUp|Suggestion|SuggestedAction|Elicitation)>)/gi
  let chipMatch
  while ((chipMatch = chipTagRegex.exec(maskedContent)) !== null) {
    const fullTag = chipMatch[0]
    const attrsStr = chipMatch[1] || ''
    const bodyStr = (chipMatch[2] || '').trim()

    const labelMatch = attrsStr.match(/label=(?:"([^"]*)"|'([^']*)')/i)
    const queryMatch = attrsStr.match(/query=(?:"([^"]*)"|'([^']*)')/i)

    const label = labelMatch ? labelMatch[1] || labelMatch[2] : bodyStr
    const query = queryMatch ? queryMatch[1] || queryMatch[2] : null

    if (label && query) {
      followUpChips.push({ label: label.trim(), query: query.trim() })
      maskedContent = maskedContent.replace(fullTag, '')
    }
  }

  // 4. Bersihkan sisa tag XML internal non-teks lainnya (seperti <cite>, <source>, <grounding_metadata>)
  maskedContent = maskedContent
    .replace(
      /<(?:cite|source|grounding_metadata|image_query|table_action|chart_spec|widget)\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:cite|source|grounding_metadata|image_query|table_action|chart_spec|widget)>)/gi,
      ''
    )
    .replace(/<[A-Za-z0-9_-]+(?:\s+[^>]*?)?>/g, (m) => (m.startsWith('<think') ? m : ''))
    .replace(/<\/[A-Za-z0-9_-]+>/g, (m) => (m.startsWith('</think') ? m : ''))

  // 5. Kembalikan blok kode yang dilindungi
  codeBlocks.forEach((block, idx) => {
    maskedContent = maskedContent.replace(`__CODE_BLOCK_${idx}__`, () => block)
  })

  const cleanAiContent = maskedContent.replace(/\n{3,}/g, '\n\n').trim()

  return {
    cleanAiContent,
    followUpChips,
    elicitationGroup
  }
}

/**
 * Parsing laporan subagent: ekstraksi artefak dan pembersihan header otomatis
 */
export function parseSubagentReport(content) {
  let cleanReportContent = typeof content === 'string' ? content : JSON.stringify(content)
  let artifactInfo = null

  const artifactMatch = cleanReportContent.match(/\nArtefak:\s*(.+)$/m)
  if (artifactMatch) {
    artifactInfo = artifactMatch[1].trim()
    cleanReportContent = cleanReportContent.replace(/\nArtefak:\s*(.+)$/m, '').trim()
  }

  const reportPrefixMatch = cleanReportContent.match(
    /^\[SUB-AGENT REPORT RECEIVED\]:\s*Sub-agent\s*(@\w+)\s*telah menyelesaikan tugasnya dan melaporkan hasil berikut:\s*/i
  )
  if (reportPrefixMatch) {
    cleanReportContent = cleanReportContent.substring(reportPrefixMatch[0].length).trim()
    if (cleanReportContent.startsWith('"') && cleanReportContent.endsWith('"')) {
      cleanReportContent = cleanReportContent.slice(1, -1).trim()
    }
  }

  return {
    cleanReportContent,
    artifactInfo
  }
}
