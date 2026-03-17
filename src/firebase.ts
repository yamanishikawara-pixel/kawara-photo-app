import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

// ★ Firebase画面のコードを直接ベタ書きします！
const firebaseConfig = {
  apiKey: "AIzaSyB9XDlErN8cUdcpMbAPEt0uCZTboBWFm6Q",
  authDomain: "kawara-photo-app.firebaseapp.com",
  projectId: "kawara-photo-app",
  storageBucket: "kawara-photo-app.firebasestorage.app",
  messagingSenderId: "777689245112",
  appId: "1:777689245112:web:a1d1a534fcc8a040ee5b4d"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);