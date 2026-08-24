import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'frontend'),
      '@': resolve(__dirname, 'frontend')
    }
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(__dirname, 'out/renderer'),
    emptyOutDir: true
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '^/models/(Xenova|onnx-community)/.*': {
        target: 'https://huggingface.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/models\/(Xenova|onnx-community)\/(.*?)(\/resolve\/main)?\/(.*)$/, '/$1/$2/resolve/main/$4')
      }
    }
  }
})
