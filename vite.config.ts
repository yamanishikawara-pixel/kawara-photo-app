import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // 本番ビルド時にキーがない場合は警告のみ（正しいキーに差し替え中は一時的にビルドを通す）
  if (mode === 'production' && !env.VITE_RECAPTCHA_SITE_KEY) {
    console.warn('[build] VITE_RECAPTCHA_SITE_KEY が未設定です。App Check が無効化されます。');
  }

  return {
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
          }
        }
      }
    },
    test: {
      environment: 'jsdom',
      globals: true,
    },
  };
})
