import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { ProjectListPage } from './pages/ProjectListPage';
import { HomePage } from './pages/HomePage';
import { CoverPage } from './pages/CoverPage';
import PhotoPage from './pages/PhotoPage';
import MapPage from './pages/MapPage';
import PdfExportPage from './pages/PdfExportPage';
// ★ 新設した MaterialPage を読み込む
import MaterialPage from './pages/MaterialPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectListPage />} />
        <Route path="/project/:id" element={<HomePage />} />
        <Route path="/project/:id/cover" element={<CoverPage />} />
        
        {/* ★ 材料画面への道（ルーティング）を追加 */}
        <Route path="/project/:id/material" element={<MaterialPage />} />
        
        <Route path="/project/:id/photo" element={<PhotoPage />} />
        <Route path="/project/:id/map" element={<MapPage />} />
        <Route path="/project/:id/pdf" element={<PdfExportPage />} />
      </Routes>
    </BrowserRouter>
  );
}