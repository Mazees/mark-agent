import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      'lucide-react': resolve(__dirname, 'node_modules/lucide-react/dist/cjs/lucide-react.js')
    }
  },
  plugins: [react(), tailwindcss()],
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
      external: [
        'onnxruntime-web',
        'onnxruntime-web/webgpu',
        '@huggingface/transformers'
      ]
    }
  }
})
