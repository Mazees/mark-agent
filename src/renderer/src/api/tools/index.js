import { core_tools, core_tools_schema } from './core-tools'
import {
  group_tools,
  group_tools_flat,
  GROUP_TOOLS_SCHEMA
} from '../../../../server/tools/group-tools.js'

export const checkTools = (toolName) => {
  return !!core_tools[toolName] || !!group_tools_flat[toolName] || toolName === 'read-tools'
}

/**
 * Mengambil array skema tools OpenAPI lengkap untuk dikirimkan ke model.
 * Menyaring tool groups yang relevan dengan query atau yang telah dimuat via 'read-tools' untuk menghemat context window.
 * @param {string} intentQuery Kata kunci / prompt user
 * @param {Set<string>|Array<string>} loadedGroups Daftar nama group yang telah dimuat via read-tools
 */
export const getActiveToolsSchema = async (intentQuery = '', loadedGroups = []) => {
  const activeSchemas = [...core_tools_schema]
  const seenToolNames = new Set(core_tools_schema.map((t) => t.function?.name))
  const loadedSet = loadedGroups instanceof Set ? loadedGroups : new Set(loadedGroups || [])

  for (const [groupKey, group] of Object.entries(GROUP_TOOLS_SCHEMA)) {
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

  // Muat dynamic plugin actions jika tersedia
  try {
    if (typeof window !== 'undefined' && window.api && window.api.getPlugins) {
      const plugins = await window.api.getPlugins()
      if (Array.isArray(plugins)) {
        for (const plugin of plugins) {
          if (plugin.isEnabled !== false && Array.isArray(plugin.actions)) {
            for (const act of plugin.actions) {
              const pName = `plugin-${plugin.name}-${act.name}`
              if (!seenToolNames.has(pName)) {
                seenToolNames.add(pName)
                activeSchemas.push({
                  type: 'function',
                  function: {
                    name: pName,
                    description: `[Plugin: ${plugin.name}] ${act.description || ''}`,
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
  } catch (_) {}

  return activeSchemas
}

export { core_tools, core_tools_schema, group_tools, group_tools_flat, GROUP_TOOLS_SCHEMA }
