import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  cacheDir: './.vite_new',
  server: {
    // Allow access via IDE "project browser"/port preview domains (non-localhost Host header).
    // Without this, Vite returns 403 Forbidden for unknown hosts.
    allowedHosts: true,
    proxy: {
      '/auth': {
        target: 'http://web:8000',
        changeOrigin: true,
      },
      '/documents': {
        target: 'http://web:8000',
        changeOrigin: true,
      },
      '/budget': {
        target: 'http://web:8000',
        changeOrigin: true,
      },
      '/agenda': {
        target: 'http://web:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://web:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://web:8000',
        changeOrigin: true,
      },
    },
  },
})
