import { core_tools, core_tools_schema } from './core-tools'
import { webApi } from '../web-bridge.js'

let cachedGroupToolsFlat = {}
let cachedGroupToolsSchema = {}
let cachedGroupToolNames = []

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

        for (const plugin of activePlugins) {
          if (
            (loadedSet.has(plugin.name) || loadedSet.has('custom_plugins')) &&
            Array.isArray(plugin.actions)
          ) {
            for (const act of plugin.actions) {
              const pName = `plugin-${plugin.name}-${act.name}`
              if (!seenToolNames.has(pName)) {
                seenToolNames.add(pName)
                activeSchemas.push({
                  type: 'function',
                  function: {
                    name: pName,
                    description: `[Plugin: ${plugin.name}] ${act.description || act.triggerHint || ''}`,
                    parameters: {
                      type: 'object',
                      properties: {
                        query: { type: 'string', description: 'Parameter aksi plugin' }
                      },
                      required: ['query'],
                      additionalProperties: false
                    }
                  }
                })
              }
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
    const allGroups = [...groupToolGroupNames, ...activePluginNames]
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

  return activeSchemas
}

export const getGroupTools = () => webApi.getGroupTools()

export { core_tools, core_tools_schema }
