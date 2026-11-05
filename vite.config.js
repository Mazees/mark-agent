import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'
import fs from 'node:fs'
import express from 'express'

const pdfAssets = {
  name: 'local-pdf-assets',
  configureServer(server) {
    server.middlewares.use(
      '/pdf-assets',
      express.static(resolve(__dirname, 'node_modules/pdfjs-dist'))
    )
  },
  writeBundle() {
    for (const folder of ['cmaps', 'standard_fonts', 'wasm'])
      fs.cpSync(
        resolve(__dirname, 'node_modules/pdfjs-dist', folder),
        resolve(__dirname, 'out/renderer/pdf-assets', folder),
        { recursive: true }
      )
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
      'lucide-react': resolve(__dirname, 'node_modules/lucide-react/dist/cjs/lucide-react.js'),
      'micromark-util-sanitize-uri': resolve(
        __dirname,
        'node_modules/micromark-util-sanitize-uri/index.js'
      )
    }
  },
  plugins: [react(), tailwindcss(), pdfAssets],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/stream': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: resolve(__dirname, 'out/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      external: ['onnxruntime-web', 'onnxruntime-web/webgpu', '@huggingface/transformers']
    }
  }
})
