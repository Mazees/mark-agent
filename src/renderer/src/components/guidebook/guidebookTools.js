import { core_tools_schema } from '../../api/tools/core-tools.js'
import { GROUP_TOOLS_SCHEMA } from '../../../../server/tools/group-tools.js'

const titles = {
  core: 'Tool inti',
  advanced_browser: 'Browser bawaan',
  youtube_music: 'YouTube dan musik',
  google_drive: 'Google Drive',
  google_calendar: 'Google Calendar',
  google_gmail: 'Gmail',
  system_vision_tg: 'Vision, suara, dan Telegram',
  git_vcs: 'Git',
  task_terminal: 'Proses terminal',
  custom_plugins: 'Penemuan plugin',
  'chrome-use': 'Chrome Bridge (chrome-use)'
}

export function guideToolGroups(runtime = {}) {
  const schema = { ...GROUP_TOOLS_SCHEMA, ...runtime }
  return [
    {
      id: 'core',
      title: titles.core,
      description: 'Kemampuan dasar yang disediakan pada agen.',
      tools: core_tools_schema
    },
    ...Object.entries(schema)
      .filter(([id]) => id !== 'core')
      .map(([id, group]) => ({ ...group, id, title: titles[id] || id }))
  ]
    .map((group) => {
      const seen = new Set()
      return {
        ...group,
        tools: (Array.isArray(group.tools) ? group.tools : [])
          .map((item) => item.function || item)
          .filter((tool) => {
            if (!tool?.name || seen.has(tool.name)) return false
            seen.add(tool.name)
            return true
          })
      }
    })
    .filter((group) => group.tools.length)
}

export function uniqueToolCount(groups) {
  return new Set(groups.flatMap((group) => group.tools.map((tool) => tool.name))).size
}

export function toolSearchText(groups) {
  return groups
    .flatMap((group) => [
      group.id,
      group.title,
      ...group.tools.map(
        (tool) => `${tool.name} ${tool.description || ''} ${JSON.stringify(tool.parameters || {})}`
      )
    ])
    .join(' ')
}

export const builtinToolGroups = guideToolGroups()
