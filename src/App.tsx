import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, Suspense, lazy } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebase';

// ★ 変更: 通常のimportから、React.lazyを使った「遅延読み込み」に変更！
// 画面を開く瞬間に初めてファイルをダウンロードするようにします。
const LoginPage = lazy(() => import('./pages/LoginPage'));
const PhotoPage = lazy(() => import('./pages/PhotoPage'));
const MapPage = lazy(() => import('./pages/MapPage'));
const PdfExportPage = lazy(() => import('./pages/PdfExportPage'));
const MaterialPage = lazy(() => import('./pages/MaterialPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

// ※名前付きexport ({ ... }) されているページは書き方が少し異なります
const ProjectListPage = lazy(() => import('./pages/ProjectListPage').then(module => ({ default: module.ProjectListPage })));
const HomePage = lazy(() => import('./pages/HomePage').then(module => ({ default: module.HomePage })));
const CoverPage = lazy(() => import('./pages/CoverPage').then(module => ({ default: module.CoverPage })));

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

// ★ 新規追加: 画面を初めて開く（裏でダウンロードしている）時のローディング表示
function PageLoader() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <span className="font-bold text-gray-500 tracking-widest">画面を準備中...</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* ★ 追加: SuspenseでRoutes全体を囲み、遅延読み込み中の待機画面(PageLoader)を指定します */}
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route path="/" element={<ProtectedRoute><ProjectListPage /></ProtectedRoute>} />
          
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          
          <Route path="/project/:id" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/project/:id/cover" element={<ProtectedRoute><CoverPage /></ProtectedRoute>} />
          <Route path="/project/:id/material" element={<ProtectedRoute><MaterialPage /></ProtectedRoute>} />
          <Route path="/project/:id/photo" element={<ProtectedRoute><PhotoPage /></ProtectedRoute>} />
          <Route path="/project/:id/map" element={<ProtectedRoute><MapPage /></ProtectedRoute>} />
          <Route path="/project/:id/pdf" element={<ProtectedRoute><PdfExportPage /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}