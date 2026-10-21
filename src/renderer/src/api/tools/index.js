import { core_tools, core_tools_schema } from './core-tools'
import { webApi } from '../web-bridge.js'
import { buildPluginToolGroups } from '../../../../shared/plugin-schema.js'

let cachedGroupToolsFlat = {}
let cachedGroupToolsSchema = {}
let cachedGroupToolNames = []
let cachedPluginToolNames = new Set()

// Inisialisasi cache secara background agar checkTools siap sedini mungkin
if (typeof window !== 'undefined') {
  webApi
    .getGroupTools()
    .then((data) => {
      if (data?.flat) cachedGroupToolsFlat = data.flat
      if (data?.schema) cachedGroupToolsSchema = data.schema
      if (data?.names) cachedGroupToolNames = data.names
    })
    .catch(() => {})
}

export const checkTools = (toolName) => {
  return (
    !!core_tools[toolName] ||
    !!cachedGroupToolsFlat[toolName] ||
    cachedPluginToolNames.has(toolName) ||
    toolName === 'read-tools' ||
    (typeof toolName === 'string' && toolName.startsWith('plugin-'))
  )
}

/**
 * Mengambil array skema tools OpenAPI lengkap untuk dikirimkan ke model.
 * Menyaring tool groups yang relevan dengan query atau yang telah dimuat via 'read-tools' untuk menghemat context window.
 * @param {string} _intentQuery Kata kunci / prompt user (disimpan untuk kompatibilitas filter)
 * @param {Set<string>|Array<string>} loadedGroups Daftar nama group yang telah dimuat via read-tools
 */
export const getActiveToolsSchema = async (intentQuery = '', loadedGroups = []) => {
  void intentQuery
  const groupToolsData = await webApi.getGroupTools()
  const groupToolsSchema = groupToolsData?.schema || cachedGroupToolsSchema || {}
  const groupToolGroupNames = groupToolsData?.names || cachedGroupToolNames || []
  if (groupToolsData?.flat) cachedGroupToolsFlat = groupToolsData.flat

  const activeSchemas = [...core_tools_schema]
  const seenToolNames = new Set(core_tools_schema.map((t) => t.function?.name))
  const loadedSet = loadedGroups instanceof Set ? loadedGroups : new Set(loadedGroups || [])

  for (const [groupKey, group] of Object.entries(groupToolsSchema)) {
    if (group.kind === 'plugin') continue
    // Hanya tambah schema group jika user explicit panggil read-tools("group_name")
    if (loadedSet.has(groupKey) && Array.isArray(group.tools)) {
      for (const t of group.tools) {
        const name = t.function?.name
        if (name && !seenToolNames.has(name)) {
          seenToolNames.add(name)
          activeSchemas.push(t)
        }
      }
    }
  }

  // Muat dynamic plugin actions jika group plugin aktif tersebut telah dimuat via read-tools
  let activePluginNames = []
  try {
    if (typeof window !== 'undefined' && window.api && window.api.getPlugins) {
      const plugins = await window.api.getPlugins()
      if (Array.isArray(plugins)) {
        const activePlugins = plugins.filter((p) => p.isEnabled !== false)
        activePluginNames = activePlugins.map((p) => p.name)
        const nativeGroups = Object.entries(groupToolsSchema).filter(
          ([, group]) => group.kind !== 'plugin'
        )
        const reservedNames = [
          ...core_tools_schema.map((tool) => tool.function.name),
          ...nativeGroups.flatMap(([, group]) =>
            (group.tools || []).map((tool) => tool.function.name)
          )
        ]
        const pluginGroups = buildPluginToolGroups(
          activePlugins,
          reservedNames,
          nativeGroups.map(([key]) => key)
        )
        cachedPluginToolNames = new Set(
          Object.values(pluginGroups).flatMap((group) =>
            group.tools.map((tool) => tool.function.name)
          )
        )
        for (const [pluginName, group] of Object.entries(pluginGroups)) {
          if (loadedSet.has(pluginName) || loadedSet.has('custom_plugins')) {
            for (const tool of group.tools) {
              if (seenToolNames.has(tool.function.name)) continue
              seenToolNames.add(tool.function.name)
              activeSchemas.push(tool)
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // Perbarui parameter enum dan description pada read-tools agar mencakup nama plugin aktif
  const readToolsIdx = activeSchemas.findIndex((s) => s.function?.name === 'read-tools')
  if (readToolsIdx >= 0) {
    const orig = activeSchemas[readToolsIdx]
    const allGroups = [...new Set([...groupToolGroupNames, ...activePluginNames])]
    activeSchemas[readToolsIdx] = {
      ...orig,
      function: {
        ...orig.function,
        parameters: {
          ...orig.function?.parameters,
          properties: {
            ...orig.function?.parameters?.properties,
            group_name: {
              type: 'string',
              description: `Nama grup tool bawaan atau plugin aktif: ${allGroups.join(', ')}`,
              enum: allGroups
            }
          }
        }
      }
    }
  }

  // Pastikan seluruh schema tool memiliki parameter reason wajib
  for (const t of activeSchemas) {
    if (t.function?.parameters?.properties) {
      if (!t.function.parameters.properties.reason) {
        t.function.parameters.properties.reason = {
          type: 'string',
          description:
            'Penjelasan ringkas dalam bahasa manusia mengenai alasan atau tujuan aksi ini (contoh: "Membuka tab Instagram di browser").'
        }
      }
      if (Array.isArray(t.function.parameters.required)) {
        if (!t.function.parameters.required.includes('reason')) {
          t.function.parameters.required.push('reason')
        }
      } else {
        t.function.parameters.required = ['reason']
      }
    }
  }

  return activeSchemas
}

export const getGroupTools = () => webApi.getGroupTools()

export { core_tools, core_tools_schema }
