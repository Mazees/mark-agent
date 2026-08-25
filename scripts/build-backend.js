import esbuild from 'esbuild'
import path from 'path'
import fs from 'fs'

async function buildBackend() {
  console.log('[Backend Bundler] Memulai bundling backend engine dengan esbuild...')
  const outDir = path.resolve('out/backend')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  await esbuild.build({
    entryPoints: ['backend/engine.js'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: 'out/backend/engine.mjs',
    external: [
      'active-win',
      'ffmpeg-static',
      'puppeteer-core',
      '@huggingface/transformers'
    ],
    sourcemap: false,
    minify: true,
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`
    }
  })

  // Copy external node_modules so the packaged build has all runtime native and WASM dependencies
  console.log('[Backend Bundler] Menyalin dependensi external ke out/backend/node_modules...')
  const externalPackages = [
    '@huggingface',
    'onnxruntime-node',
    'onnxruntime-web',
    'onnxruntime-common',
    'active-win',
    'ffmpeg-static',
    'puppeteer-core',
    'ws'
  ]
  const outModules = path.join(outDir, 'node_modules')
  fs.mkdirSync(outModules, { recursive: true })

  function copyDirRecursive(src, dest) {
    if (!fs.existsSync(src)) return
    fs.mkdirSync(dest, { recursive: true })
    const entries = fs.readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      if (entry.isDirectory()) {
        copyDirRecursive(srcPath, destPath)
      } else {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }

  for (const pkg of externalPackages) {
    const srcPkg = path.resolve('node_modules', pkg)
    const destPkg = path.join(outModules, pkg)
    if (fs.existsSync(srcPkg)) {
      copyDirRecursive(srcPkg, destPkg)
      console.log(`[Backend Bundler] Copied external dependency: ${pkg}`)
    }
  }

  console.log('[Backend Bundler] Berhasil mem-bundle backend -> out/backend/engine.mjs')
}

buildBackend().catch((err) => {
  console.error('[Backend Bundler Error]', err)
  process.exit(1)
})
