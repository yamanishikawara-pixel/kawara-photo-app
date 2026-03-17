import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebase';

import { ProjectListPage } from './pages/ProjectListPage';
import { HomePage } from './pages/HomePage';
import { CoverPage } from './pages/CoverPage';
import PhotoPage from './pages/PhotoPage';
import MapPage from './pages/MapPage';
import PdfExportPage from './pages/PdfExportPage';
import MaterialPage from './pages/MaterialPage';
import LoginPage from './pages/LoginPage';

// ==========================================
// ★ 検問所：ログインしていない人を玄関に追い返す仕組み
// ==========================================
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebaseに「今ログインしてる？」と確認する
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-bold text-gray-500">カギを確認中...</div>;
  }

  // ログインしていなければ /login 画面へ強制送還！
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // ログインしていれば、目的の画面（children）を表示！
  return <>{children}</>;
}
// ==========================================

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ★ 誰でも入れる玄関（ログイン画面） */}
        <Route path="/login" element={<LoginPage />} />

        {/* ★ ここから下はすべて検問所（ProtectedRoute）を通らないと入れません */}
        <Route path="/" element={<ProtectedRoute><ProjectListPage /></ProtectedRoute>} />
        <Route path="/project/:id" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/project/:id/cover" element={<ProtectedRoute><CoverPage /></ProtectedRoute>} />
        <Route path="/project/:id/material" element={<ProtectedRoute><MaterialPage /></ProtectedRoute>} />
        <Route path="/project/:id/photo" element={<ProtectedRoute><PhotoPage /></ProtectedRoute>} />
        <Route path="/project/:id/map" element={<ProtectedRoute><MapPage /></ProtectedRoute>} />
        <Route path="/project/:id/pdf" element={<ProtectedRoute><PdfExportPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}