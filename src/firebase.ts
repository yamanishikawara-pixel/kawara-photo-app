import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// 山西瓦店様専用の「合鍵」
const firebaseConfig = {
  apiKey: "AIzaSyB9XDlErN8cUdcpMbAPEt0uCZtboBWFm6Q",
  authDomain: "kawara-photo-app.firebaseapp.com",
  projectId: "kawara-photo-app",
  storageBucket: "kawara-photo-app.firebasestorage.app",
  messagingSenderId: "777689245112",
  appId: "1:777689245112:web:a1d1a534fcc8a040ee5b4d"
};

// アプリとGoogle倉庫を連結！
const app = initializeApp(firebaseConfig);

// データベース（文字用）とストレージ（写真用）の準備
export const db = getFirestore(app);
export const storage = getStorage(app);