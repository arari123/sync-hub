import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  cacheDir: './.vite_new',
  server: {
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
