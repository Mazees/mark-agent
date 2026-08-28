import { core_tools, core_tools_schema } from './core-tools'
import { group_tools, group_tools_flat, GROUP_TOOLS_SCHEMA } from './group-tools'

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
  const lowerQuery = (intentQuery || '').toLowerCase()
  const loadedSet = loadedGroups instanceof Set ? loadedGroups : new Set(loadedGroups || [])

  for (const [groupKey, group] of Object.entries(GROUP_TOOLS_SCHEMA)) {
    let isRelevant = loadedSet.has(groupKey)

    if (!isRelevant) {
      if (
        groupKey === 'advanced_browser' &&
        (lowerQuery.includes('browser') ||
          lowerQuery.includes('web') ||
          lowerQuery.includes('http') ||
          lowerQuery.includes('https') ||
          lowerQuery.includes('link') ||
          lowerQuery.includes('url') ||
          lowerQuery.includes('website') ||
          lowerQuery.includes('buka') ||
          lowerQuery.includes('klik') ||
          lowerQuery.includes('scroll') ||
          lowerQuery.includes('extract') ||
          lowerQuery.includes('halaman'))
      ) {
        isRelevant = true
      } else if (
        groupKey === 'pc_automation' &&
        (lowerQuery.includes('desktop') ||
          lowerQuery.includes('layar') ||
          lowerQuery.includes('aplikasi') ||
          lowerQuery.includes('ketik') ||
          lowerQuery.includes('klik') ||
          lowerQuery.includes('windows') ||
          lowerQuery.includes('overlay') ||
          lowerQuery.includes('os-') ||
          lowerQuery.includes('chrome') ||
          lowerQuery.includes('notepad') ||
          lowerQuery.includes('calc') ||
          lowerQuery.includes('mouse') ||
          lowerQuery.includes('keyboard') ||
          lowerQuery.includes('shortcut') ||
          lowerQuery.includes('focus') ||
          lowerQuery.includes('window'))
      ) {
        isRelevant = true
      } else if (
        groupKey === 'youtube_music' &&
        (lowerQuery.includes('lagu') ||
          lowerQuery.includes('musik') ||
          lowerQuery.includes('youtube') ||
          lowerQuery.includes('putar') ||
          lowerQuery.includes('video') ||
          lowerQuery.includes('yt') ||
          lowerQuery.includes('playlist') ||
          lowerQuery.includes('song') ||
          lowerQuery.includes('audio'))
      ) {
        isRelevant = true
      } else if (
        groupKey === 'git_vcs' &&
        (lowerQuery.includes('git') ||
          lowerQuery.includes('commit') ||
          lowerQuery.includes('diff') ||
          lowerQuery.includes('repo') ||
          lowerQuery.includes('branch') ||
          lowerQuery.includes('status') ||
          lowerQuery.includes('revert'))
      ) {
        isRelevant = true
      } else if (
        groupKey === 'task_terminal' &&
        (lowerQuery.includes('task') ||
          lowerQuery.includes('terminal') ||
          lowerQuery.includes('server') ||
          lowerQuery.includes('run') ||
          lowerQuery.includes('daemon') ||
          lowerQuery.includes('process') ||
          lowerQuery.includes('background') ||
          lowerQuery.includes('kill'))
      ) {
        isRelevant = true
      }
    }

    if (isRelevant && Array.isArray(group.tools)) {
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
