const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/
const validName = (name) => typeof name === 'string' && TOOL_NAME.test(name)
const actionsOf = (plugin) => (Array.isArray(plugin.actions) ? plugin.actions : [])

export function buildPluginToolGroups(plugins = [], reservedTools = [], reservedGroups = []) {
  const active = plugins.filter((plugin) => plugin.isEnabled !== false)
  const toolNames = new Set(reservedTools.map((name) => name.toLowerCase()))
  const groupNames = new Set(reservedGroups)
  const counts = new Map()
  for (const plugin of active) {
    for (const action of actionsOf(plugin)) {
      const name = String(action.name).toLowerCase()
      counts.set(name, (counts.get(name) || 0) + 1)
    }
  }

  const groups = Object.create(null)
  for (const plugin of active) {
    if (!validName(plugin.name) || groupNames.has(plugin.name)) continue
    const tools = []
    const unavailableTools = []
    for (const action of actionsOf(plugin)) {
      const name = String(action.name).toLowerCase()
      if (!validName(action.name) || toolNames.has(name) || counts.get(name) > 1) {
        unavailableTools.push(action.name)
        continue
      }
      tools.push({
        type: 'function',
        function: {
          name: action.name,
          description: `[Group: ${plugin.name}] ${action.description || action.triggerHint || ''}`,
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Input aksi plugin; gunakan JSON string untuk beberapa nilai.'
              },
              reason: { type: 'string', description: 'Tujuan pemanggilan tool.' }
            },
            required: ['query', 'reason'],
            additionalProperties: false
          }
        }
      })
    }
    groups[plugin.name] = {
      kind: 'plugin',
      displayName: plugin.displayName || plugin.name,
      description: plugin.description || '',
      tools,
      unavailableTools
    }
  }
  return groups
}
