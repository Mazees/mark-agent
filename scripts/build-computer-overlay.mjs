import { ensureOverlayBinary } from '../src/server/tools/overlay-build.js'

if (process.platform === 'win32') {
  console.log(await ensureOverlayBinary({ packageBuild: true }))
} else {
  console.log('Host overlay Windows dibangun saat menyiapkan rilis Windows.')
}
