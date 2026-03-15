import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyB9XDlErN8cUdcpMbAPEt0uCZtboBWFm6Q",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "kawara-photo-app.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "kawara-photo-app",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "kawara-photo-app.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "777689245112",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:777689245112:web:a1d1a534fcc8a040ee5b4d",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
