import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
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

// 3つの神器（データベース、倉庫、鍵）をアプリ全体で使えるようにする
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);