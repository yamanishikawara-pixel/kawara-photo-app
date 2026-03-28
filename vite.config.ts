import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          zip: ['jszip'],
          // ↑ pdfの行を完全に削除しました！
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})