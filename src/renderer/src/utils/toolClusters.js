import { core_tools_schema } from '../api/tools/core-tools'
import { webApi } from '../api/web-bridge'

/**
 * Format string cluster key menjadi judul display yang rapi & ramah dibaca
 */
export function formatClusterName(key) {
  if (!key) return 'TOOLS'
  return key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

/**
 * Deterministic hash-based neon/holographic color generator
 * Memberikan warna cerah/neon acak namun konsisten untuk setiap tool / cluster key.
 */
export function getDeterministicColor(str = '') {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  // Ambil hue dari 0 - 360, saturasi tinggi 85-100%, lightness 55-65% untuk efek neon futuristik
  const hue = Math.abs(hash % 360)
  const sat = 85 + Math.abs((hash >> 3) % 15)
  const light = 55 + Math.abs((hash >> 6) % 10)
  return `hsl(${hue}, ${sat}%, ${light}%)`
}

/**
 * Membangun registry kluster tools secara dinamis dari groupToolsSchema, core_tools_schema, & dynamicPlugins
 */
export function buildCompleteToolClusters(dynamicPlugins = [], groupToolsSchema = null) {
  const effectiveSchema =
    groupToolsSchema && Object.keys(groupToolsSchema).length > 0
      ? groupToolsSchema
      : webApi._groupToolsCache?.schema || {}
  const clusters = []
  const hasDynamicPlugins = Array.isArray(dynamicPlugins) && dynamicPlugins.length > 0
  const seenClusterKeys = new Set()

  let currentRadius = 170
  let isClockwise = true

  // 1. Ambil seluruh tool groups dari groupToolsSchema
  Object.entries(effectiveSchema).forEach(([groupKey, groupData]) => {
    const normalizedKey = groupKey.toLowerCase()

    const isPluginGroup =
      groupData?.kind === 'plugin' ||
      (hasDynamicPlugins &&
        dynamicPlugins.some((p) => (p?.name || '').toLowerCase() === normalizedKey))

    if (isPluginGroup && hasDynamicPlugins) return
    if (groupKey === 'custom_plugins' && hasDynamicPlugins) return
    if (seenClusterKeys.has(normalizedKey)) return

    seenClusterKeys.add(normalizedKey)
    if (groupData?.displayName) {
      seenClusterKeys.add(groupData.displayName.toLowerCase())
    }

    const clusterName = groupData?.displayName || formatClusterName(groupKey)
    const clusterColor = getDeterministicColor(groupKey)
    const speed = (0.0008 - clusters.length * 0.00005) * (isClockwise ? 1 : -1)
    isClockwise = !isClockwise

    const tools = (groupData.tools || []).map((t) => {
      const fn = t.function || t
      return {
        id: `tool-${fn.name}`,
        name: fn.name,
        label: fn.name.replace(/^(browser|os|gdrive|gcalendar|gmail|music|git|tg)-/, ''),
        description: fn.description,
        clusterKey: groupKey,
        color: getDeterministicColor(fn.name),
        matchTools: [fn.name, fn.name.replace(/-/g, '_'), fn.name.replace(/_/g, '-')]
      }
    })

    clusters.push({
      id: `cluster-${groupKey}`,
      key: groupKey,
      name: clusterName,
      color: clusterColor,
      radius: currentRadius,
      speed: speed || 0.0004,
      size: 6.5,
      tools
    })

    currentRadius += 55
  })

  // 2. Kumpulkan core tools dari core_tools_schema yang belum ada di dalam group tools
  const existingToolNames = new Set()
  clusters.forEach((c) => c.tools.forEach((t) => existingToolNames.add(t.name)))

  const subagentTools = []
  const fileTools = []
  const memoryTools = []
  const coreControlTools = []

  core_tools_schema.forEach((t) => {
    const fn = t.function || t
    if (existingToolNames.has(fn.name)) return

    const item = {
      id: `tool-${fn.name}`,
      name: fn.name,
      label: fn.name.replace(/^(browser|os|gdrive|gcalendar|gmail|music|git|tg)-/, ''),
      description: fn.description,
      color: getDeterministicColor(fn.name),
      matchTools: [fn.name, fn.name.replace(/-/g, '_'), fn.name.replace(/_/g, '-')]
    }

    if (
      fn.name.includes('subagent') ||
      fn.name.includes('message_agent') ||
      fn.name.includes('send_message') ||
      fn.name.includes('report_to_lead')
    ) {
      item.clusterKey = 'subagents'
      subagentTools.push(item)
    } else if (
      fn.name === 'read-document' ||
      fn.name.includes('file') ||
      fn.name.includes('replace') ||
      fn.name.includes('list-dir') ||
      fn.name.includes('find-files') ||
      fn.name.includes('grep')
    ) {
      item.clusterKey = 'file_system'
      fileTools.push(item)
    } else if (
      fn.name.includes('memory') ||
      fn.name.includes('document') ||
      fn.name.includes('skill')
    ) {
      item.clusterKey = 'memory_rag'
      memoryTools.push(item)
    } else {
      item.clusterKey = 'core_system'
      coreControlTools.push(item)
    }
  })

  const additionalCoreGroups = [
    { key: 'subagents', name: 'Minibots', tools: subagentTools, size: 8 },
    { key: 'file_system', name: 'File System', tools: fileTools, size: 7 },
    { key: 'memory_rag', name: 'Memory RAG', tools: memoryTools, size: 6.5 },
    { key: 'core_system', name: 'Core System', tools: coreControlTools, size: 6.5 }
  ]

  additionalCoreGroups.forEach((cg) => {
    const normalizedKey = cg.key.toLowerCase()
    if (seenClusterKeys.has(normalizedKey)) return
    seenClusterKeys.add(normalizedKey)

    if (cg.tools.length > 0) {
      const speed = (0.0008 - clusters.length * 0.00005) * (isClockwise ? 1 : -1)
      isClockwise = !isClockwise

      clusters.push({
        id: `cluster-${cg.key}`,
        key: cg.key,
        name: cg.name,
        color: getDeterministicColor(cg.key),
        radius: currentRadius,
        speed: speed || 0.0003,
        size: cg.size,
        tools: cg.tools
      })
      currentRadius += 55
    }
  })

  // 3. Tambahkan Custom Plugins jika ada
  if (Array.isArray(dynamicPlugins) && dynamicPlugins.length > 0) {
    dynamicPlugins.forEach((p) => {
      if (!p || !p.name) return
      const pKey = p.name.toLowerCase()
      const dispNameKey = (p.displayName || '').toLowerCase()

      if (seenClusterKeys.has(pKey) || (dispNameKey && seenClusterKeys.has(dispNameKey))) {
        return
      }
      seenClusterKeys.add(pKey)
      if (dispNameKey) seenClusterKeys.add(dispNameKey)

      if (p.isEnabled !== false && Array.isArray(p.actions)) {
        const pluginTools = p.actions.map((act) => {
          const actionName = act.name
          const fullPrefix = `plugin-${p.name}-${actionName}`
          return {
            id: `plugin-tool-${p.name}-${actionName}`,
            name: actionName,
            label: actionName,
            description: act.description || p.description || `Custom plugin ${p.name}`,
            clusterKey: p.name,
            color: getDeterministicColor(`${p.name}-${actionName}`),
            matchTools: [
              actionName,
              fullPrefix,
              `plugin-${actionName}`,
              `plugin_${p.name}_${actionName}`,
              `plugin_${actionName}`
            ]
          }
        })

        if (pluginTools.length > 0) {
          const speed = (0.0008 - clusters.length * 0.00005) * (isClockwise ? 1 : -1)
          clusters.push({
            id: `cluster-${p.name}`,
            key: p.name,
            name: p.displayName || p.name,
            color: getDeterministicColor(p.name),
            radius: currentRadius,
            speed: speed || -0.0002,
            size: 7,
            tools: pluginTools
          })
          currentRadius += 55
        }
      }
    })
  }

  return clusters
}
