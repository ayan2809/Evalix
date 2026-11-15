import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The web app calls plain paths like /api/agents. In development Vite hands every
// /api/* call to the backend, so the browser sees one address and cookies just work.
// Server-sent events (/api/benchmarks/{id}/events) stream through the same proxy.
const backend = 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: false },
    },
  },
  preview: {
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: false },
    },
  },
})
