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
// ★ 新しく作った設定画面を読み込む
import SettingsPage from './pages/SettingsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-bold text-gray-500">カギを確認中...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/" element={<ProtectedRoute><ProjectListPage /></ProtectedRoute>} />
        
        {/* ★ 設定画面のルートを追加！ */}
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        
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