import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildPluginToolGroups } from '../src/shared/plugin-schema.js'
import { loadAllPlugins, executePluginAction } from '../src/main/plugins/plugin-loader.js'
import { NATIVE_SKILLS } from '../src/renderer/src/components/core/native-skills.js'

test('create-plugin guide contains a working manifest and matching ESM handler', async () => {
  const skill = NATIVE_SKILLS.find((entry) => entry.name === 'create-plugin')
  assert.ok(skill)
  const manifest = JSON.parse(skill.content.match(/~~~json\n([\s\S]*?)\n~~~/)[1])
  const source = skill.content.match(/~~~js\n([\s\S]*?)\n~~~/)[1]
  const module = await import(`data:text/javascript,${encodeURIComponent(source)}`)
  const action = manifest.actions[0]
  assert.equal(typeof module.default[action.name], 'function')
  assert.equal((await module.default[action.name]({ query: '' })).platform, os.platform())
  const body = await import(
    `data:text/javascript,${encodeURIComponent(`export default async () => { ${action.code} }`)}`
  )
  assert.deepEqual(await body.default(), await module.default[action.name]({ query: '' }))
})

test('plugin names select groups and action names become tools', () => {
  const groups = buildPluginToolGroups([
    { name: 'system-ops', actions: [{ name: 'sys-ram-check', description: 'Read RAM' }] },
    { name: 'disabled', isEnabled: false, actions: [{ name: 'off' }] }
  ])
  assert.deepEqual(Object.keys(groups), ['system-ops'])
  assert.equal(groups['system-ops'].tools[0].function.name, 'sys-ram-check')
  assert.deepEqual(groups['system-ops'].tools[0].function.parameters.required, ['query', 'reason'])
})

test('conflicting and invalid names are excluded rather than assigned to the wrong group', () => {
  const groups = buildPluginToolGroups(
    [
      { name: 'a', actions: [{ name: 'shared' }, { name: 'read-file' }, { name: 'bad name' }] },
      { name: 'b', actions: [{ name: 'shared' }, { name: 'b-read' }] },
      { name: 'advanced_browser', actions: [{ name: 'extra' }] }
    ],
    ['read-file'],
    ['advanced_browser']
  )
  assert.deepEqual(groups.a.tools, [])
  assert.deepEqual(groups.a.unavailableTools, ['shared', 'read-file', 'bad name'])
  assert.equal(groups.b.tools[0].function.name, 'b-read')
  assert.equal(groups.advanced_browser, undefined)
})

test('loader dispatches raw names, retains legacy aliases, and rejects ambiguous actions', async () => {
  const temporaryHome = await fs.mkdtemp(path.join(os.tmpdir(), 'mark-plugin-test-'))
  const originalHomedir = os.homedir
  os.homedir = () => temporaryHome
  try {
    for (const [name, enabled] of [
      ['alpha', true],
      ['beta', true],
      ['disabled', false]
    ]) {
      const dir = path.join(temporaryHome, 'Documents', 'Mark Plugins', name)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'package.json'), '{"type":"module"}')
      await fs.writeFile(
        path.join(dir, 'plugin.json'),
        JSON.stringify({
          name,
          isEnabled: enabled,
          actions: [{ name: `${name}-read` }, { name: 'shared-read' }]
        })
      )
      await fs.writeFile(
        path.join(dir, 'index.js'),
        `export default {
        '${name}-read': async ({ query }) => ({ plugin: '${name}', query }),
        'shared-read': async () => '${name}'
      }`
      )
    }
    await loadAllPlugins()
    const result = await executePluginAction('alpha-read', { query: { value: 42 } })
    assert.deepEqual(result, { success: true, data: { plugin: 'alpha', query: '{"value":42}' } })
    assert.equal((await executePluginAction('plugin-beta-beta-read', '')).data.plugin, 'beta')
    const ambiguous = await executePluginAction('shared-read', '')
    assert.equal(ambiguous.success, false)
    assert.match(ambiguous.error, /beberapa plugin/)
    assert.equal((await executePluginAction('plugin-alpha-shared-read', '')).data, 'alpha')
    assert.equal((await executePluginAction('disabled-read', '')).success, false)
    assert.equal((await executePluginAction('unrelated-alpha-read', '')).success, false)
  } finally {
    os.homedir = originalHomedir
    await fs.rm(temporaryHome, { recursive: true, force: true })
  }
})
