import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, Suspense, lazy } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const PhotoPage = lazy(() => import('./pages/PhotoPage'));
const MapPage = lazy(() => import('./pages/MapPage'));
const PdfExportPage = lazy(() => import('./pages/PdfExportPage'));
const MaterialPage = lazy(() => import('./pages/MaterialPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const ProjectListPage = lazy(() => import('./pages/ProjectListPage').then(module => ({ default: module.ProjectListPage })));
const HomePage = lazy(() => import('./pages/HomePage').then(module => ({ default: module.HomePage })));
const CoverPage = lazy(() => import('./pages/CoverPage').then(module => ({ default: module.CoverPage })));
const BeforeAfterPage = lazy(() => import('./pages/BeforeAfterPage').then(m => ({ default: m.BeforeAfterPage })));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const BudgetPage = lazy(() => import('./pages/BudgetPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));



// ★ 修正：ここではカギの確認をせず、親(App)から渡されたuserの有無だけで弾く
function ProtectedRoute({ user, children }: { user: User | null, children: React.ReactNode }) {
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function PageLoader() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <span className="font-bold text-gray-500 tracking-widest">画面を準備中...</span>
    </div>
  );
}

export default function App() {
  // ★ 修正：Appのトップレベルで、アプリ起動時に「1回だけ」カギを確認する
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false); // 確認が終わったらローディングを解除

      if (!currentUser) return;
      try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        if (!snap.exists()) return;
        const data = snap.data();

        // ── apple-touch-icon を会社ロゴに更新（Safari の「ホーム画面に追加」が読む）
        if (data.logoUrl) {
          const iconLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
          if (iconLink) iconLink.href = data.logoUrl;
        }

        // ── ページタイトルを会社名に更新
        if (data.companyName) {
          document.title = `${data.companyName} 写真台帳`;
          // apple-mobile-web-app-title も更新
          const titleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null;
          if (titleMeta) titleMeta.content = data.companyName;
        }
      } catch {
        // 設定取得失敗はサイレントに無視（認証には影響しない）
      }
    });
    return () => unsubscribe();
  }, []);

  // 最初のカギ確認中だけ表示。以降の画面遷移では一切出ません！
  if (authLoading) {
    return <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-bold text-gray-500">ログインしています...</div>;
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* ログイン済みの人がログイン画面に来たら、一覧へ飛ばす親切設計 */}
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

          {/* 各画面には、確認済みのuser情報を渡すだけ */}
          <Route path="/" element={<ProtectedRoute user={user}><ProjectListPage /></ProtectedRoute>} />
          
       
          
          <Route path="/settings" element={<ProtectedRoute user={user}><SettingsPage /></ProtectedRoute>} />
          <Route path="/project/:id" element={<ProtectedRoute user={user}><HomePage /></ProtectedRoute>} />
          <Route path="/project/:id/cover" element={<ProtectedRoute user={user}><CoverPage /></ProtectedRoute>} />
          <Route path="/project/:id/material" element={<ProtectedRoute user={user}><MaterialPage /></ProtectedRoute>} />
          <Route path="/project/:id/photo" element={<ProtectedRoute user={user}><PhotoPage /></ProtectedRoute>} />
          <Route path="/project/:id/map" element={<ProtectedRoute user={user}><MapPage /></ProtectedRoute>} />
          <Route path="/project/:id/pdf" element={<ProtectedRoute user={user}><PdfExportPage /></ProtectedRoute>} />
          <Route path="/project/:id/before-after" element={<ProtectedRoute user={user}><BeforeAfterPage /></ProtectedRoute>} />
          <Route path="/project/:id/schedule" element={<ProtectedRoute user={user}><SchedulePage /></ProtectedRoute>} />
          <Route path="/calendar" element={<ProtectedRoute user={user}><CalendarPage /></ProtectedRoute>} />
          <Route path="/budget/*" element={<ProtectedRoute user={user}><BudgetPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
