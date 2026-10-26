import { core_tools, core_tools_schema } from './core-tools'
import { webApi } from '../web-bridge.js'

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
  cachedGroupToolsSchema = groupToolsSchema
  cachedGroupToolNames = groupToolGroupNames
  cachedPluginToolNames = new Set(
    Object.values(groupToolsSchema)
      .filter((group) => group.kind === 'plugin')
      .flatMap((group) => (group.tools || []).map((tool) => tool.function?.name))
      .filter(Boolean)
  )

  const activeSchemas = core_tools_schema.filter(
    (tool) => tool.function.name !== 'request_lead_input'
  )
  const seenToolNames = new Set(core_tools_schema.map((t) => t.function?.name))
  const loadedSet = loadedGroups instanceof Set ? loadedGroups : new Set(loadedGroups || [])

  for (const [groupKey, group] of Object.entries(groupToolsSchema)) {
    // Hanya tambah schema group jika user explicit panggil read-tools("group_name")
    const isLoaded =
      loadedSet.has(groupKey) || (group.kind === 'plugin' && loadedSet.has('custom_plugins'))
    if (isLoaded && Array.isArray(group.tools)) {
      for (const t of group.tools) {
        const name = t.function?.name
        if (name && !seenToolNames.has(name)) {
          seenToolNames.add(name)
          activeSchemas.push(t)
        }
      }
    }
  }

  // Perbarui parameter enum dan description pada read-tools agar mencakup nama plugin aktif
  const readToolsIdx = activeSchemas.findIndex((s) => s.function?.name === 'read-tools')
  if (readToolsIdx >= 0) {
    const orig = activeSchemas[readToolsIdx]
    const allGroups = [...new Set([...groupToolGroupNames, ...Object.keys(groupToolsSchema)])]
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
