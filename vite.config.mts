import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// .mts para o Vite carregar como ESM nativo (import.meta.dirname exige Node 20.11+).
const root = import.meta.dirname

export default defineConfig({
  // O app React vive em src/renderer; é a raiz do servidor de dev.
  root: path.resolve(root, 'src/renderer'),
  // Caminhos relativos: em produção o Electron carrega o HTML via file://
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(root, 'dist/renderer'),
    emptyOutDir: true,
  },
})
