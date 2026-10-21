import test from 'node:test'
import assert from 'node:assert/strict'

test('group catalog follows plugin updates without restarting the UI', async (t) => {
  const originals = new Map(
    ['window', 'WebSocket', 'fetch'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key)
    ])
  )
  let socket
  class FakeWebSocket {
    static OPEN = 1
    static CONNECTING = 0
    readyState = 1
    constructor() {
      socket = this
    }
  }
  let catalog = ['existing']
  let calls = 0
  let holdNext = false
  let release
  const response = (names) => ({
    json: async () => ({ success: true, data: { names, schema: {}, definition: {}, flat: {} } })
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        origin: 'http://localhost:3007',
        hostname: 'localhost',
        port: '3007',
        protocol: 'http:',
        host: 'localhost:3007'
      }
    }
  })
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: FakeWebSocket })
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url) => {
      assert.equal(url, 'http://localhost:3007/api/tools/groups')
      calls += 1
      const snapshot = [...catalog]
      if (holdNext) {
        holdNext = false
        return new Promise((resolve) => {
          release = () => resolve(response(snapshot))
        })
      }
      return response(snapshot)
    }
  })
  try {
    const { webApi } = await import('../src/renderer/src/api/web-bridge.js?plugin-realtime-test')
    const emitUpdate = () =>
      socket.onmessage({ data: JSON.stringify({ event: 'plugins:updated', payload: {} }) })

    await t.test('unchanged catalogs are cached', async () => {
      assert.deepEqual((await webApi.getGroupTools()).names, ['existing'])
      await webApi.getGroupTools()
      assert.equal(calls, 1)
    })

    await t.test('creation event invalidates before subscribed UI fetches', async () => {
      catalog.push('new-plugin')
      let update
      const unsubscribe = webApi.onPluginsUpdated(() => {
        update = webApi.getGroupTools()
      })
      emitUpdate()
      assert.deepEqual((await update).names, ['existing', 'new-plugin'])
      unsubscribe()
    })

    await t.test('disabling or deleting a plugin removes it from the cache', async () => {
      catalog = ['new-plugin']
      emitUpdate()
      assert.equal(webApi._groupToolsCache, null)
      assert.deepEqual((await webApi.getGroupTools()).names, ['new-plugin'])
    })

    await t.test('opening mentions can refresh changes that emitted no event', async () => {
      catalog.push('file-created-plugin')
      assert.deepEqual((await webApi.getGroupTools({ forceRefresh: true })).names, catalog)
    })

    await t.test('a response started before an update cannot restore the old catalog', async () => {
      holdNext = true
      const outdated = webApi.getGroupTools({ forceRefresh: true })
      catalog = ['latest-plugin']
      emitUpdate()
      const before = calls
      const fresh = webApi.getGroupTools()
      const sameRequest = webApi.getGroupTools()
      assert.equal(calls, before + 1)
      assert.deepEqual((await fresh).names, catalog)
      assert.deepEqual((await sameRequest).names, catalog)
      release()
      assert.deepEqual((await outdated).names, catalog)
      assert.deepEqual(webApi._groupToolsCache.names, catalog)
    })
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
