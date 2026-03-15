import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { ProjectListPage } from './pages/ProjectListPage';
import { HomePage } from './pages/HomePage';
import { CoverPage } from './pages/CoverPage';
import { PhotoPage } from './pages/PhotoPage';
import { MapPage } from './pages/MapPage';
import PdfExportPage from './pages/PdfExportPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectListPage />} />
        <Route path="/project/:id" element={<HomePage />} />
        <Route path="/project/:id/cover" element={<CoverPage />} />
        <Route path="/project/:id/photo" element={<PhotoPage />} />
        <Route path="/project/:id/map" element={<MapPage />} />
        <Route path="/project/:id/pdf" element={<PdfExportPage />} />
      </Routes>
    </BrowserRouter>
  );
}
