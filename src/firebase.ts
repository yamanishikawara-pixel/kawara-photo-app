import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

// ★ 相棒が発掘した本物のFirebase設定！
const firebaseConfig = {
  apiKey: "AIzaSyB9XDlErN8cUdcpMbAPEt0uCZtboBWFn6Q", // ←ここが「n6Q」が正解でした！
  authDomain: "kawara-photo-app.firebaseapp.com",
  projectId: "kawara-photo-app",
  storageBucket: "kawara-photo-app.firebasestorage.app",
  messagingSenderId: "777689245112",
  appId: "1:777689245112:web:a1d1a534fcc8a040ee5b4d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// ★オフライン防衛線を起動したデータベース
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});

export const storage = getStorage(app);
export const auth = getAuth(app);