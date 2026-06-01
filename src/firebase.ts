import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

// ★ 追加：環境変数がちゃんと設定されているか起動時にチェック（フェイルセーフ）
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
] as const;

for (const key of requiredEnvVars) {
  if (!import.meta.env[key]) {
    throw new Error(`環境変数 ${key} が設定されていません。金庫（.env）を確認してください！`);
  }
}

// 金庫（.env）から鍵を取り出す
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

// App Check: 不正なAPIキー利用・クォータ枯渇攻撃を防ぐ
// 本番ビルドでキーが未設定なら起動を止める（無言で App Check 無効のまま出荷させない）
if (import.meta.env.PROD && !import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  throw new Error('本番ビルドで VITE_RECAPTCHA_SITE_KEY が未設定です。App Check が無効化されます。.env を確認してください。');
}
if (import.meta.env.DEV) {
  if (!import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
    console.warn('[App Check] VITE_RECAPTCHA_SITE_KEY 未設定（開発時のみ許容）');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  try {
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
    // App Check トークン取得エラーを監視（診断用）
    import('firebase/app-check').then(({ onTokenChanged }) => {
      onTokenChanged(appCheck,
        () => { /* トークン正常取得 */ },
        (err) => { console.error('[App Check] トークン取得失敗:', err); }
      );
    }).catch(() => {/* noop */});
  } catch (e) {
    console.error('[App Check] 初期化失敗:', e);
  }
}

// オフライン防衛線を起動したデータベース
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});

export const storage = getStorage(app);
export const auth = getAuth(app);