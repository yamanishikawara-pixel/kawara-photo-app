import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // 本番ビルド時に必須キーを確認。未設定なら即ビルド失敗。
  if (mode === 'production' && !env.VITE_RECAPTCHA_SITE_KEY) {
    throw new Error(
      '[build] VITE_RECAPTCHA_SITE_KEY が未設定です。App Check が無効化されます。.env を確認してください。'
    );
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
