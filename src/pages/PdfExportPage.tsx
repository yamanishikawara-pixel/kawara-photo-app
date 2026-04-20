import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Printer, FileDown, ChevronUp, ChevronDown } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Circle, MapRow, MapLine, Photo, Project, Material, WhiteoutBox, UserSettings, BeforeAfterPair } from '../types';
import kawaraLogo from '../assets/kawara-logo.png';
import { A4_HEIGHT_PX, A4_WIDTH_PX, getPreviewScale, proxyUrl } from '../shared/utils';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';

const JP_FONT = "'BIZ UDPGothic', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', Meiryo, sans-serif";

function safeStyleLine(val: string | number | undefined | null, defaultUnit: string): string {
  if (val == null || val === '') return `0${defaultUnit}`;
  if (typeof val === 'number') return `${val}${defaultUnit}`;
  return String(val);
}


const COVER_FIELDS: { label: string; key: keyof Project }[] = [
  { label: '工事件名', key: 'projectName' },
  { label: '工事場所', key: 'projectLocation' },
  { label: '工期', key: 'constructionPeriod' },
  { label: '施工業者', key: 'contractorName' },
  { label: '作成年月日', key: 'creationDate' },
];

let _emptyIdCounter = 0;
function createEmptyPhoto(): Photo & { circles?: Circle[] } {
  return { id: -(++_emptyIdCounter), image: null, photoNumber: '', shootingDate: '', locationMap: '', process: '', description: '', circles: [] };
}

function createEmptyMaterial(): Material {
  return { id: -(++_emptyIdCounter), image: null, name: '', manufacturer: '', specification: '', remarks: '', rotation: 0 };
}


export default function PdfExportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [scale, setScale] = useState(1);
  const [sessionId] = useState(() => Date.now().toString());
  const [isPrinting, setIsPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState('');
  const [isCapturingForPdf, setIsCapturingForPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState('');
  const [appendixPages, setAppendixPages] = useState<string[]>([]); // 添付PDF→画像

  // ── セクションON/OFF制御 ──
  const [sections, setSections] = useState({
    cover: true,
    map: true,
    photo: true,
    beforeAfter: true,
    completion: false,
    material: true,
    appendix: true,
  });
  type SectionKey = keyof typeof sections;
  const DEFAULT_ORDER: SectionKey[] = ['cover', 'map', 'photo', 'beforeAfter', 'completion', 'material', 'appendix'];
  const [sectionOrder, setSectionOrder] = useState<SectionKey[]>(DEFAULT_ORDER);

  const toggleSection = (key: SectionKey) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const moveSection = (key: SectionKey, dir: 'up' | 'down') => {
    setSectionOrder(prev => {
      const idx = prev.indexOf(key);
      const next = dir === 'up' ? idx - 1 : idx + 1;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  };
  const applyPreset = (preset: typeof sections) => {
    setSections(preset);
    setSectionOrder(DEFAULT_ORDER);
  };
  const PRESETS: { label: string; icon: string; value: typeof sections }[] = [
    { label: '施主提出用', icon: '🏠', value: { cover: true, map: false, photo: false, beforeAfter: true, completion: true, material: false, appendix: false } },
    { label: '役所提出用', icon: '🏛️', value: { cover: true, map: true, photo: true, beforeAfter: true, completion: false, material: true, appendix: true } },
    { label: '写真のみ',   icon: '📷', value: { cover: false, map: false, photo: true, beforeAfter: false, completion: false, material: false, appendix: false } },
    { label: '全部',       icon: '📋', value: { cover: true, map: true, photo: true, beforeAfter: true, completion: true, material: true, appendix: true } },
  ];

  useEffect(() => {
    if (!id) return;
    setError(null);
    const fetchData = async () => {
      try {
        const d = await getDoc(doc(db, 'projects', id));
        if (d.exists()) setProject(d.data() as Project);
        const user = auth.currentUser;
        if (user) {
          const s = await getDoc(doc(db, 'users', user.uid));
          if (s.exists()) setUserSettings(s.data() as UserSettings);
        }
      } catch (err) {
        logFirebaseError(err, 'PDF出力用データ読込');
        setError(firebaseErrorMessage(err, 'データの読み込み'));
      }
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    const updateScale = () => setScale(getPreviewScale(32));
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  useEffect(() => {
    const handleAfterPrint = () => { setIsPrinting(false); setPrintProgress(''); };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // 添付PDFをページ画像に変換
  useEffect(() => {
    const url = project?.appendixPdfUrl;
    if (!url) { setAppendixPages([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).href;
        const pdfDoc = await pdfjsLib.getDocument(url).promise;
        const pages: string[] = [];
        for (let i = 1; i <= Math.min(pdfDoc.numPages, 20); i++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(i);
          // A4 150DPI 相当（794px幅）
          const viewport = page.getViewport({ scale: 794 / page.getViewport({ scale: 1 }).width });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          pages.push(canvas.toDataURL('image/jpeg', 0.92));
        }
        if (!cancelled) setAppendixPages(pages);
      } catch (e) { import.meta.env.DEV && console.warn('PDF読み込み失敗:', e); }
    })();
    return () => { cancelled = true; };
  }, [project?.appendixPdfUrl]);

  const handleZipExport = async () => {
    if (!project) return;
    try {
      setIsZipping(true); setError(null);
      await new Promise((r) => setTimeout(r, 100));
      const zip = new JSZip();
      const folderName = project.projectName || '現場写真';
      const imgFolder = zip.folder(folderName);
      if (!imgFolder) throw new Error('フォルダ作成失敗');
      const activePhotos = (project.photos ?? []).filter((p) => p.image);
      if (activePhotos.length === 0) {
        setError('ダウンロードする写真がありません。'); setIsZipping(false); return;
      }
      let failedCount = 0;
      const promises = activePhotos.map(async (p) => {
        if (!p.image) return;
        try {
          const response = await fetch(p.image);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const processName = p.process ? `_${p.process}` : '';
          const filename = `${p.photoNumber.padStart(2, '0')}${processName}.jpg`;
          imgFolder.file(filename, blob);
        } catch (e) { failedCount++; import.meta.env.DEV && console.warn('写真取得失敗:', e); }
      });
      await Promise.all(promises);
      if (failedCount > 0) setError(`${failedCount}枚の写真の取得に失敗しました。他の写真はZIPに含まれています。`);
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${folderName}.zip`);
    } catch (err) {
      logFirebaseError(err, 'ZIP作成');
      setError(firebaseErrorMessage(err, 'ZIPファイルの作成'));
    } finally { setIsZipping(false); }
  };

  const optimizeImageForPrint = (imgEl: HTMLImageElement): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // A4 300DPI 印刷品質：写真欄幅 ≈ 120mm → 300DPI で約 1417px
        const MAX_PRINT_PX = 1600;
        let { width, height } = img;
        if (width > MAX_PRINT_PX || height > MAX_PRINT_PX) {
          const ratio = Math.min(MAX_PRINT_PX / width, MAX_PRINT_PX / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(img.src); return; }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        canvas.width = 0;
        canvas.height = 0;
        resolve(dataUrl);
      };
      img.onerror = () => resolve(imgEl.src);
      img.src = imgEl.getAttribute('data-original-src') || imgEl.src;
    });
  };

  const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

  // ── 印刷 / PDFダウンロード共通：window.print() で統一 ──
  const executePrint = async (progressSetter: (msg: string) => void) => {
    const images = Array.from(document.querySelectorAll('.pdf-page img'));
    const needsConversion = images.filter((img) => {
      const src = img.getAttribute('data-original-src') || img.getAttribute('src');
      return src && !src.startsWith('data:');
    });
    const total = needsConversion.length;
    const BATCH_SIZE = 2;
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = needsConversion.slice(i, i + BATCH_SIZE);
      progressSetter(`画像を最適化中... (${Math.min(i + BATCH_SIZE, total)}/${total})`);
      await Promise.all(batch.map(async (img) => {
        try {
          const dataUrl = await optimizeImageForPrint(img as HTMLImageElement);
          img.setAttribute('src', dataUrl);
          img.removeAttribute('crossorigin');
        } catch (e) { import.meta.env.DEV && console.warn('画像最適化失敗:', e); }
      }));
      await yieldToUI();
    }
    progressSetter('PDF生成中...');
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)));
    });
    window.print();
  };

  const handlePrint = () => {
    if (!project) return;
    setIsPrinting(true);
    setPrintProgress('準備中...');
    setTimeout(async () => {
      try {
        await executePrint(setPrintProgress);
      } catch {
        setError('印刷の準備中にエラーが発生しました。');
        setIsPrinting(false);
      } finally {
        setPrintProgress('');
      }
    }, 500);
  };

  const handlePdfDownload = () => {
    if (!project) return;
    setIsCapturingForPdf(true);
    setPdfProgress('準備中...');
    setTimeout(async () => {
      try {
        await executePrint(setPdfProgress);
      } catch (err) {
        logFirebaseError(err, 'PDF生成');
        setError(firebaseErrorMessage(err, 'PDFの生成'));
      } finally {
        setIsCapturingForPdf(false);
        setPdfProgress('');
      }
    }, 500);
  };

  if (!project) return <LoadingSpinner />;

  const logoUrl = userSettings?.logoUrl;
  const companyName = userSettings?.companyName;
  const address = userSettings?.address;
  const phone = userSettings?.phone;

  const mapUrlsToRender = project.mapUrls?.length ? project.mapUrls.slice(0, 3) : [''];
  const mapCount = mapUrlsToRender.length;

  const activePhotos = (project.photos ?? []).filter((p) => p.image || p.process || p.description);
  const photoPages: (Photo & { circles?: Circle[] })[][] = [];
  for (let i = 0; i < Math.max(activePhotos.length, 3); i += 3) {
    const chunk = activePhotos.slice(i, i + 3);
    while (chunk.length < 3) chunk.push(createEmptyPhoto());
    photoPages.push(chunk);
  }

  const activeMaterials = (project.materials ?? []).filter(m => m.image || m.name || m.manufacturer || m.specification || m.remarks);
  const materialPages: Material[][] = [];
  if (activeMaterials.length > 0) {
    for (let i = 0; i < Math.max(activeMaterials.length, 3); i += 3) {
      const chunk = activeMaterials.slice(i, i + 3);
      while (chunk.length < 3) chunk.push(createEmptyMaterial());
      materialPages.push(chunk);
    }
  }

  // ビフォーアフター：2ペアずつ1ページ
  const activePairs: BeforeAfterPair[] = project.beforeAfterPairs ?? [];
  const beforeAfterPages: BeforeAfterPair[][] = [];
  for (let i = 0; i < activePairs.length; i += 2) {
    beforeAfterPages.push(activePairs.slice(i, i + 2));
  }

  const sectionPageCounts: Record<SectionKey, number> = {
    cover: 1,
    map: mapCount,
    photo: photoPages.length,
    beforeAfter: beforeAfterPages.length,
    completion: 1,
    material: materialPages.length,
    appendix: appendixPages.length,
  };

  const totalPages = sectionOrder.reduce((sum, s) => sum + (sections[s] ? sectionPageCounts[s] : 0), 0);

  const pageOffset = (section: SectionKey) => {
    let offset = 0;
    for (const s of sectionOrder) {
      if (s === section) break;
      if (sections[s]) offset += sectionPageCounts[s];
    }
    return offset;
  };
  const showLegendTable = project.showLegendTable !== false;

  return (
    <div className={`min-h-screen font-sans overflow-x-hidden w-full relative ${isPrinting ? 'bg-white p-0 block' : 'pb-12 p-4 sm:p-6 flex flex-col items-center'}`} style={isPrinting ? {} : { background: '#12122a' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap');
        .pdf-container-wrapper * { font-family: ${JP_FONT} !important; }

        @media print {
          /* ブラウザ自動ヘッダー・フッター（ページ番号・URL）を非表示 */
          @page {
            size: A4 portrait;
            margin: 0;
            /* Chrome/Edge: ヘッダー・フッターを空文字で上書き */
            @top-center { content: ''; }
            @bottom-center { content: ''; }
          }
          html, body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            overflow: visible !important;
          }
          .no-print { display: none !important; }

          .pdf-container-wrapper {
            display: block !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .pdf-page-wrapper {
            position: relative !important;
            display: block !important;
            width: 794px !important;
            height: 1123px !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            box-shadow: none !important;
            transform: none !important;
            -webkit-transform: none !important;

            break-after: auto !important;
            page-break-after: auto !important;
            -webkit-page-break-after: auto !important;

            break-before: page !important;
            page-break-before: always !important;
            -webkit-page-break-before: always !important;

            break-inside: avoid !important;
            page-break-inside: avoid !important;
            -webkit-page-break-inside: avoid !important;
          }

          .pdf-container-wrapper > .pdf-page-wrapper:first-child {
            break-before: auto !important;
            page-break-before: auto !important;
            -webkit-page-break-before: auto !important;
          }

          .pdf-map-fullbleed {
            padding: 0 !important;
          }

          .pdf-page {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            width: 794px !important;
            height: 1123px !important;
            padding: 8mm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            transform: none !important;
            -webkit-transform: none !important;
            transform-origin: unset !important;
            -webkit-transform-origin: unset !important;
          }

          :has(> .pdf-container-wrapper) {
            min-height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            display: block !important;
            overflow: visible !important;
          }
        }
      `}</style>

      <div className={`w-full max-w-2xl mb-6 flex justify-between items-center flex-wrap gap-3 no-print ${isPrinting ? 'hidden' : ''}`}>
        {/* もどる */}
        <button
          type="button"
          onClick={() => navigate(`/project/${id}`)}
          className="flex items-center gap-2 font-bold text-sm transition-colors"
          style={{ color: '#8b8ba8' }}
          onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
          onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
        >
          <ArrowLeft className="w-4 h-4" /> もどる
        </button>
        <div className="flex gap-2 sm:gap-3 flex-wrap justify-end">
          {/* Zip */}
          <button
            type="button"
            onClick={handleZipExport}
            disabled={isZipping || isPrinting || isCapturingForPdf || totalPages === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border transition-colors disabled:opacity-40"
            style={{ background: '#1c1c30', borderColor: '#2e2e50', color: '#8b8ba8' }}
            onPointerEnter={e => { e.currentTarget.style.borderColor = '#f0ede8'; e.currentTarget.style.color = '#f0ede8'; }}
            onPointerLeave={e => { e.currentTarget.style.borderColor = '#2e2e50'; e.currentTarget.style.color = '#8b8ba8'; }}
          >
            <Download className="w-4 h-4" /> 写真のみ(Zip)
          </button>
          {/* PDFダウンロード */}
          <button
            type="button"
            onClick={handlePdfDownload}
            disabled={isZipping || isPrinting || isCapturingForPdf || totalPages === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-40"
            style={{ background: '#f59e0b', color: '#000' }}
            onPointerEnter={e => (e.currentTarget.style.background = '#fbbf24')}
            onPointerLeave={e => (e.currentTarget.style.background = '#f59e0b')}
          >
            <FileDown className="w-4 h-4" />
            {isCapturingForPdf ? (pdfProgress || '処理中...') : 'PDFダウンロード'}
          </button>
          {/* 印刷 */}
          <button
            type="button"
            onClick={handlePrint}
            disabled={isZipping || isPrinting || isCapturingForPdf || totalPages === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-40"
            style={{ background: '#f59e0b', color: '#000', boxShadow: '0 0 14px rgba(245,158,11,0.35)' }}
            onPointerEnter={e => (e.currentTarget.style.background = '#fbbf24')}
            onPointerLeave={e => (e.currentTarget.style.background = '#f59e0b')}
          >
            <Printer className="w-4 h-4" />
            {isPrinting ? (printProgress || '画像処理中...') : 'PDF作成・印刷'}
          </button>
        </div>
      </div>

      {error && <div className="w-full max-w-2xl mb-4 no-print"><ErrorMessage message={error} onDismiss={() => setError(null)} /></div>}

      {/* ── セクション選択パネル ── */}
      {!isPrinting && (
        <div className="w-full max-w-2xl mb-6 no-print">
          <div className="rounded-2xl border overflow-hidden" style={{ background: '#1c1c30', borderColor: '#2e2e50' }}>
            {/* ヘッダー */}
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #2e2e50' }}>
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 rounded-full" style={{ background: '#f59e0b' }} />
                <span className="text-sm font-bold" style={{ color: '#f0ede8' }}>出力するセクション</span>
              </div>
              <span className="text-xs" style={{ color: '#4b4b70' }}>{totalPages}ページ</span>
            </div>

            {/* トグル一覧（並び替え可） */}
            <div className="px-4 py-3 flex flex-col gap-2">
              {(() => {
                const meta: Record<SectionKey, { label: string; icon: string }> = {
                  cover:       { label: '表紙',           icon: '📋' },
                  map:         { label: '位置図',         icon: '📍' },
                  photo:       { label: '工事写真',       icon: '📷' },
                  beforeAfter: { label: 'ビフォーアフター', icon: '🔄' },
                  completion:  { label: '完了報告書',     icon: '📝' },
                  material:    { label: '使用材料',       icon: '🔧' },
                  appendix:    { label: '添付PDF',        icon: '📎' },
                };
                return sectionOrder.map((key, idx) => {
                  const { label, icon } = meta[key];
                  const count = sectionPageCounts[key];
                  const on = sections[key];
                  return (
                    <div key={key} className="flex items-center gap-1.5">
                      {/* 上下ボタン */}
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveSection(key, 'up')}
                          disabled={idx === 0}
                          className="flex items-center justify-center w-6 h-5 rounded transition-colors disabled:opacity-20"
                          style={{ background: '#12122a', border: '1px solid #2e2e50', color: '#8b8ba8' }}
                          onPointerEnter={e => { if (idx > 0) e.currentTarget.style.color = '#f0ede8'; }}
                          onPointerLeave={e => { e.currentTarget.style.color = '#8b8ba8'; }}
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(key, 'down')}
                          disabled={idx === sectionOrder.length - 1}
                          className="flex items-center justify-center w-6 h-5 rounded transition-colors disabled:opacity-20"
                          style={{ background: '#12122a', border: '1px solid #2e2e50', color: '#8b8ba8' }}
                          onPointerEnter={e => { if (idx < sectionOrder.length - 1) e.currentTarget.style.color = '#f0ede8'; }}
                          onPointerLeave={e => { e.currentTarget.style.color = '#8b8ba8'; }}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      {/* トグル本体 */}
                      <button
                        type="button"
                        onClick={() => toggleSection(key)}
                        className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
                        style={{
                          background: on ? 'rgba(245,158,11,0.08)' : '#12122a',
                          border: `1.5px solid ${on ? 'rgba(245,158,11,0.3)' : '#2e2e50'}`,
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>{icon}</span>
                        <span className="flex-1 text-sm font-bold" style={{ color: on ? '#f59e0b' : '#6b7280' }}>{label}</span>
                        {count > 0 && <span className="text-xs" style={{ color: '#4b4b70' }}>{count}p</span>}
                        <div className="w-12 h-6 rounded-full relative transition-all shrink-0" style={{ background: on ? '#f59e0b' : '#2e2e50' }}>
                          <div className="w-5 h-5 rounded-full absolute top-0.5 transition-all" style={{ background: '#fff', left: on ? '26px' : '2px' }} />
                        </div>
                      </button>
                    </div>
                  );
                });
              })()}
            </div>

            {/* プリセットボタン */}
            <div className="px-4 pb-4 pt-1 flex gap-2 flex-wrap">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.value)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                  style={{ background: '#12122a', border: '1px solid #2e2e50', color: '#8b8ba8' }}
                  onPointerEnter={e => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.color = '#f59e0b'; }}
                  onPointerLeave={e => { e.currentTarget.style.borderColor = '#2e2e50'; e.currentTarget.style.color = '#8b8ba8'; }}
                >
                  <span style={{ fontSize: '12px' }}>{p.icon}</span> {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`pdf-container-wrapper w-full ${isPrinting ? 'block' : 'flex flex-col items-center gap-8'}`}>

        {/* 全セクションOFF時のメッセージ */}
        {!isPrinting && totalPages === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 no-print">
            <FileDown className="w-10 h-10" style={{ color: '#2e2e50' }} />
            <p className="text-sm font-bold" style={{ color: '#8b8ba8' }}>出力するセクションを選択してください</p>
          </div>
        )}

        {sectionOrder.flatMap(secKey => { switch (secKey) {

        // ① 表紙
        case 'cover': {
          if (!sections.cover) return [];
          return [(
          <div key="cover" style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
          <div className={`pdf-page bg-white text-black overflow-hidden ${isPrinting ? "" : "absolute top-0 left-0 origin-top-left"}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX}px`, transform: isPrinting ? 'none' : `scale(${scale})`, position: 'relative' }}>

            {/* ── メインコンテンツ (タイトル + フィールド) ── */}
            {/* 下部会社情報エリア26mmを除いた領域で縦中央 */}
            <div style={{ position: 'absolute', top: 0, bottom: isPrinting ? '26mm' : '98px', left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: isPrinting ? '10mm' : '38px', paddingBottom: isPrinting ? '4mm' : '15px' }}>

              {/* タイトルブロック */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: isPrinting ? '16mm' : '60px' }}>
                <h1 style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '32pt' : '42px', fontWeight: '900', letterSpacing: '0.20em', textAlign: 'center', color: '#111', margin: 0, lineHeight: 1.15 }}>工事写真報告書</h1>
                {/* 黒のアクセントライン — 1本 */}
                <div style={{ width: isPrinting ? '95mm' : '359px', height: isPrinting ? '0.7mm' : '2.5px', background: '#2a2a2a', borderRadius: '1px', marginTop: isPrinting ? '5mm' : '19px' }} />
              </div>

              {/* フィールドリスト */}
              <div style={{ width: isPrinting ? '168mm' : '635px', display: 'flex', flexDirection: 'column', gap: isPrinting ? '10mm' : '38px' }}>
                {COVER_FIELDS.map((item, idx) => {
                  let value = String(project[item.key] ?? '　');
                  if (item.key === 'contractorName' && companyName) value = companyName;
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', borderBottom: `${isPrinting ? '0.2mm' : '1px'} solid #ebebeb`, paddingBottom: isPrinting ? '4mm' : '15px', paddingTop: isPrinting ? '2mm' : '8px' }}>
                      <div style={{ width: isPrinting ? '52mm' : '197px', flexShrink: 0, paddingRight: isPrinting ? '6mm' : '23px', fontFamily: JP_FONT, fontSize: isPrinting ? '10.5pt' : '14px', fontWeight: 'bold', color: '#555', lineHeight: 1.4, letterSpacing: '-0.01em', textAlign: 'justify', textAlignLast: 'justify' }}>
                        {item.label}
                      </div>
                      <div style={{ flex: 1, fontFamily: JP_FONT, fontSize: isPrinting ? '14pt' : '18px', fontWeight: 'bold', wordBreak: 'break-all', color: '#0d0d0d', lineHeight: 1.4 }}>{value}</div>
                    </div>
                  );
                })}
              </div>

              {/* 施工保証セクション（値がある場合のみ表示） */}
              {(project.warrantyYears || project.warrantyStartDate || project.warrantyNote) && (
                <div style={{ width: isPrinting ? '168mm' : '635px', marginTop: isPrinting ? '8mm' : '30px' }}>
                  {/* セパレーター + ラベル */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: isPrinting ? '3mm' : '11px', marginBottom: isPrinting ? '5mm' : '19px' }}>
                    <div style={{ flex: 1, height: isPrinting ? '0.3mm' : '1px', background: '#e0e0e0' }} />
                    <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '8pt' : '11px', fontWeight: 'bold', color: '#999', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>施工保証</div>
                    <div style={{ flex: 1, height: isPrinting ? '0.3mm' : '1px', background: '#e0e0e0' }} />
                  </div>
                  {/* 保証フィールド */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: isPrinting ? '8mm' : '30px' }}>
                    {project.warrantyYears && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', borderBottom: `${isPrinting ? '0.2mm' : '1px'} solid #ebebeb`, paddingBottom: isPrinting ? '4mm' : '15px', paddingTop: isPrinting ? '2mm' : '8px' }}>
                        <div style={{ width: isPrinting ? '52mm' : '197px', flexShrink: 0, paddingRight: isPrinting ? '6mm' : '23px', fontFamily: JP_FONT, fontSize: isPrinting ? '10.5pt' : '14px', fontWeight: 'bold', color: '#555', lineHeight: 1.4, letterSpacing: '-0.01em', textAlign: 'justify', textAlignLast: 'justify' }}>
                          保証期間
                        </div>
                        <div style={{ flex: 1, fontFamily: JP_FONT, fontSize: isPrinting ? '14pt' : '18px', fontWeight: 'bold', wordBreak: 'break-all', color: '#0d0d0d', lineHeight: 1.4 }}>{project.warrantyYears}</div>
                      </div>
                    )}
                    {project.warrantyStartDate && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', borderBottom: `${isPrinting ? '0.2mm' : '1px'} solid #ebebeb`, paddingBottom: isPrinting ? '4mm' : '15px', paddingTop: isPrinting ? '2mm' : '8px' }}>
                        <div style={{ width: isPrinting ? '52mm' : '197px', flexShrink: 0, paddingRight: isPrinting ? '6mm' : '23px', fontFamily: JP_FONT, fontSize: isPrinting ? '10.5pt' : '14px', fontWeight: 'bold', color: '#555', lineHeight: 1.4, letterSpacing: '-0.01em', textAlign: 'justify', textAlignLast: 'justify' }}>
                          保証開始日
                        </div>
                        <div style={{ flex: 1, fontFamily: JP_FONT, fontSize: isPrinting ? '14pt' : '18px', fontWeight: 'bold', wordBreak: 'break-all', color: '#0d0d0d', lineHeight: 1.4 }}>{project.warrantyStartDate}</div>
                      </div>
                    )}
                    {project.warrantyNote && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', borderBottom: `${isPrinting ? '0.2mm' : '1px'} solid #ebebeb`, paddingBottom: isPrinting ? '4mm' : '15px', paddingTop: isPrinting ? '2mm' : '8px' }}>
                        <div style={{ width: isPrinting ? '52mm' : '197px', flexShrink: 0, paddingRight: isPrinting ? '6mm' : '23px', fontFamily: JP_FONT, fontSize: isPrinting ? '10.5pt' : '14px', fontWeight: 'bold', color: '#555', lineHeight: 1.4, letterSpacing: '-0.01em', textAlign: 'justify', textAlignLast: 'justify' }}>
                          補足事項
                        </div>
                        <div style={{ flex: 1, fontFamily: JP_FONT, fontSize: isPrinting ? '14pt' : '18px', fontWeight: 'bold', wordBreak: 'break-all', color: '#0d0d0d', lineHeight: 1.4 }}>{project.warrantyNote}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* ── 下部: ロゴ + 会社情報 + ページ番号 ── */}
            {/* ロゴwidth : 情報width ≈ 1 : φ の黄金比配置 */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: isPrinting ? '26mm' : '98px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isPrinting ? '0 21mm' : '0 79px', borderTop: `${isPrinting ? '0.2mm' : '1px'} solid #eeeeee` }}>

              {/* ロゴ + 縦セパレーター + 会社情報 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: isPrinting ? '5mm' : '19px', minWidth: 0 }}>
                {/* ロゴ: maxWidth ≈ 28mm → 会社情報エリア ≈ 28×φ≈45mm (黄金比) */}
                {logoUrl ? (
                  <img src={proxyUrl(logoUrl, `logo_${sessionId}`)} data-original-src={logoUrl} alt="自社ロゴ" style={{ height: isPrinting ? '12mm' : '45px', width: 'auto', maxWidth: isPrinting ? '28mm' : '106px', objectFit: 'contain', flexShrink: 0 }} crossOrigin="anonymous" />
                ) : (
                  <img src={kawaraLogo} data-original-src={kawaraLogo} alt="標準ロゴ" style={{ height: isPrinting ? '10mm' : '38px', width: 'auto', maxWidth: isPrinting ? '25mm' : '95px', objectFit: 'contain', flexShrink: 0, filter: 'grayscale(1)' }} crossOrigin="anonymous" />
                )}
                {userSettings && (companyName || address || phone) && (<>
                  {/* 縦セパレーター */}
                  <div style={{ width: isPrinting ? '0.3mm' : '1px', height: isPrinting ? '10mm' : '38px', background: '#d0d0d0', flexShrink: 0 }} />
                  {/* 会社情報: flex-1 でロゴとの比率が自然な黄金比に */}
                  <div style={{ lineHeight: 1.45, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    {companyName && <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '10pt' : '13px', fontWeight: 'bold', color: '#222', whiteSpace: 'nowrap', overflow: 'hidden' }}>{companyName}</div>}
                    {address && <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '7.5pt' : '10px', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden' }}>{address}</div>}
                    {phone && <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '7.5pt' : '10px', color: '#666', whiteSpace: 'nowrap' }}>TEL: {phone}</div>}
                  </div>
                </>)}
              </div>

              {/* ページ番号 */}
              <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '8.5pt' : '11px', fontWeight: 'normal', color: '#aaa', whiteSpace: 'nowrap', flexShrink: 0, paddingLeft: isPrinting ? '5mm' : '19px' }}>- 1 / {totalPages} -</div>

            </div>
          </div>
        </div>
        )]; }

        case 'map': {
          if (!sections.map) return [];
          return mapUrlsToRender.map((u, mapIndex) => {
          const userRotation = project.mapRotations?.[mapIndex] ?? 0;
          const totalRotation = userRotation % 360;

          const transform = project.mapTransforms?.[mapIndex] || { scale: 1, x: 0, y: 0 };
          const layout = project.mapLayouts?.[mapIndex] || { title: '位置図', x: 15, y: 10, rotation: 0 };

          const whiteoutBoxesForMap = (project.whiteoutBoxes ?? []).filter((b: WhiteoutBox) => b.mapIndex === mapIndex);

          const mapOverlays = (
            <>
              {/* ★ タイトル札 */}
              <div style={{
                position: 'absolute',
                left: `${layout.x ?? 15}%`,
                top: `${layout.y ?? 10}%`,
                transform: `translate(-50%, -50%) rotate(${layout.rotation || 0}deg) scale(${1 / transform.scale})`,
                zIndex: 60,
                background: 'rgba(255,255,255,0.95)',
                padding: '6px 16px',
                borderRadius: '4px',
                fontWeight: 'bold',
                fontSize: '24px',
                color: '#111',
                border: '2px solid #333',
                whiteSpace: 'nowrap'
              }}>
                {layout.title}{mapCount > 1 ? ` (${mapIndex + 1}/${mapCount})` : ''}
              </div>

              {(project.mapPins ?? []).filter(p => p.mapIndex === mapIndex).map(pin => {
                const visualScale = (pin.size ?? 1) / transform.scale;
                return (
                  <div key={pin.id} style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: `translate(-50%, -50%) scale(${visualScale})`, zIndex: 10 }} className="absolute">
                    <div style={{ transform: `rotate(${pin.textRotation ?? 0}deg)` }}>
                      {pin.type === 'arrow' ? (
                        <div className="flex items-center gap-1 px-1 rounded bg-white/70 border border-red-200"><span className="font-bold text-[24px] text-red-600" style={{ transform: `rotate(${pin.rotation ?? 0}deg)` }}>➡</span><span className="font-bold text-[20px] text-red-600">{pin.label}</span></div>
                      ) : (
                        <div className="relative flex items-center justify-center"><div className="w-[14mm] h-[14mm] rounded-full border-[4px] border-red-600 bg-red-600/10" /><span className="absolute font-bold text-[18px] px-1 rounded text-red-600 bg-white/70">{pin.label}</span></div>
                      )}
                    </div>
                  </div>
                );
              })}
              {(project.mapLines ?? []).filter(l => l.mapIndex === mapIndex).map((line: MapLine) => (
                <div key={`line-${line.id}`} className="absolute" style={{ left: safeStyleLine(line.x, '%'), top: safeStyleLine(line.y, '%'), width: safeStyleLine(line.length, '%'), height: safeStyleLine(line.thickness, 'px'), backgroundColor: line.color || '#000000', transform: `translate(-50%, -50%) rotate(${line.rotation ?? 0}deg)`, transformOrigin: 'center center', zIndex: 15 }} />
              ))}
              {(project.mapDimensionLines ?? []).filter(l => (l.mapIndex || 0) === mapIndex).map((line) => {
                const color = line.color || "#FFFFFF";
                const thickness = Number(line.size || 2);
                const midX = (line.start.x + line.end.x) / 2;
                const midY = (line.start.y + line.end.y) / 2;
                const dynamicFontSize = 14 + (thickness - 2) * 4;
                return (
                  <div key={line.id} className="absolute inset-0 z-20 pointer-events-none w-full h-full" style={{ overflow: 'visible' }}>
                    <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
                      <defs>
                        <marker id={`cad-tick-pdf-map-${line.id}`} markerWidth="16" markerHeight="16" refX="8" refY="8" orient="auto" markerUnits="userSpaceOnUse">
                          <line x1="0" y1="8" x2="16" y2="8" stroke={color} strokeWidth={thickness} />
                          <line x1="4" y1="12" x2="12" y2="4" stroke={color} strokeWidth={thickness * 1.5} />
                        </marker>
                      </defs>
                      <line x1={`${line.start.x}%`} y1={`${line.start.y}%`} x2={`${line.end.x}%`} y2={`${line.end.y}%`} stroke={color} strokeWidth={thickness} fill="none" markerStart={`url(#cad-tick-pdf-map-${line.id})`} markerEnd={`url(#cad-tick-pdf-map-${line.id})`} />
                    </svg>
                    {line.text && (
                      <div style={{ left: `${midX}%`, top: `${midY}%`, color, backgroundColor: 'rgba(0,0,0,0.5)', fontSize: `${dynamicFontSize}px`, transform: `translate(-50%,-50%) rotate(${line.textRotation ?? 0}deg) scale(${1 / transform.scale})` }} className="absolute z-20 font-bold px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap">
                        {line.text}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 白塗りは全オーバーレイの最後 = 最前面に描画。
                  SVG rect を使うことでブラウザPDF出力時も確実に白く塗られる。
                  overflow:visible な寸法線SVGより後に置くことで必ず上に重なる。 */}
              {whiteoutBoxesForMap.length > 0 && (
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', zIndex: 50, pointerEvents: 'none' }}>
                  {whiteoutBoxesForMap.map((box: WhiteoutBox) => (
                    <rect
                      key={box.id}
                      x={`${box.x - box.width / 2}%`}
                      y={`${box.y - box.height / 2}%`}
                      width={`${box.width}%`}
                      height={`${box.height}%`}
                      fill="white"
                    />
                  ))}
                </svg>
              )}
            </>
          );

          if (!showLegendTable) {
            return (
              <div key={`map-page-${mapIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
                <div
                  className={`pdf-page pdf-map-fullbleed w-full h-full bg-white text-black ${isPrinting ? "" : "absolute top-0 left-0 origin-top-left"}`}
                  style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX}px`, padding: 0, transform: isPrinting ? 'none' : `scale(${scale})` }}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {u ? (
                      <div style={{ position: 'relative', aspectRatio: '175/255', height: '100%', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, transform: `translate(${transform.x}%, ${transform.y}%) scale(${transform.scale}) rotate(${totalRotation}deg)`, transformOrigin: 'center center' }}>
                          <img
                            src={proxyUrl(u, `map_${mapIndex}_${sessionId}`)}
                            data-original-src={u}
                            crossOrigin="anonymous"
                            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
                            alt=""
                          />
                          {mapOverlays}
                        </div>
                      </div>
                    ) : (
                      <span className="font-bold text-gray-400 absolute inset-0 flex items-center justify-center">位置図未登録</span>
                    )}
                    <div style={{ position: 'absolute', bottom: '5mm', right: '8mm', zIndex: 50, fontSize: '12px', fontWeight: 'bold', color: '#555' }}>
                      - {pageOffset('map') + mapIndex + 1} / {totalPages} -
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={`map-page-${mapIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
              <div className={`pdf-page w-full h-full flex flex-col bg-white text-black ${isPrinting ? "" : "absolute top-0 left-0 origin-top-left"}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX}px`, padding: isPrinting ? '8mm' : '15mm', transform: isPrinting ? 'none' : `scale(${scale})` }}>
                <div className="w-full h-full flex flex-col border-[3px] border-gray-800 print:border-black p-6 print:p-2">

                  {/* aspectRatio must match MapPage legend container (194/120) exactly.
                      width:100% fills the flex-1 area; height is derived from aspect-ratio.
                      Do NOT use height:100% here — landscape 194/120 would overflow the flex-row
                      parent width, and browsers differ in how they resolve that conflict. */}
                  <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-gray-50 print:bg-white p-2 border border-gray-400 print:border-gray-500">
                    {u ? (
                      <div style={{ position: 'relative', aspectRatio: '194/120', width: '100%', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, transform: `translate(${transform.x}%, ${transform.y}%) scale(${transform.scale}) rotate(${totalRotation}deg)`, transformOrigin: 'center center' }}>
                          <img
                            src={proxyUrl(u, `map_${mapIndex}_${sessionId}`)}
                            data-original-src={u}
                            crossOrigin="anonymous"
                            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
                            alt=""
                          />
                          {mapOverlays}
                        </div>
                      </div>
                    ) : <span className="font-bold text-gray-400">位置図未登録</span>}
                  </div>
                  <div className="mt-4 shrink-0">
                    <div className="flex justify-between items-end mb-2"><div className="text-base font-bold">項目欄</div></div>
                    <div className="border-2 border-gray-800 print:border-black">
                      <div className="grid grid-cols-12 text-base font-bold border-b-2 border-gray-800 bg-gray-100 print:bg-gray-50 print:border-black">
                        <div className="col-span-1 py-2 text-center flex justify-center items-center border-r-2 border-gray-800 print:border-black">符号</div><div className="col-span-2 py-2 text-center flex justify-center items-center border-r-2 border-gray-800 print:border-black">部位</div><div className="col-span-2 py-2 text-center flex justify-center items-center border-r-2 border-gray-800 print:border-black">写真NO</div><div className="col-span-7 py-2 text-center flex justify-center items-center">備考</div>
                      </div>
                      {(() => {
                        const rows: MapRow[] = project.mapRows ?? [];
                        const currentRows = rows.filter((r) => r.mapIndex === mapIndex || (r.mapIndex === undefined && mapIndex === 0));
                        const displayRows: MapRow[] = currentRows.length > 0 ? currentRows.slice(0, 6) : Array.from({ length: 6 }, (_, i) => ({ id: -(i + 1), symbol: '　', part: '　', photoNo: '　', remarks: '　' }));
                        return displayRows.map((row) => (
                          <div key={row.id} className="grid grid-cols-12 text-base border-b border-gray-400 print:border-black">
                            <div className="col-span-1 py-2 font-bold text-center flex justify-center items-center border-r border-gray-400 text-red-700 print:border-black">{row.symbol ?? '　'}</div><div className="col-span-2 px-2 py-2 flex items-center overflow-hidden border-r border-gray-400 print:border-black">{row.part ?? '　'}</div><div className="col-span-2 py-2 text-center flex justify-center items-center overflow-hidden border-r border-gray-400 print:border-black">{row.photoNo ?? row.relatedPhotoNumber ?? '　'}</div><div className="col-span-7 px-2 py-2 flex items-center overflow-hidden">{row.remarks ?? '　'}</div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-[10mm] print:bottom-[5mm] right-[15mm] print:right-[8mm] text-xs font-bold text-gray-500 shrink-0">- {pageOffset('map') + mapIndex + 1} / {totalPages} -</div>
              </div>
            </div>
          );
        });}

        case 'photo': {
          if (!sections.photo) return [];
          return photoPages.map((chunk, pageIndex) => (
          <div key={`photo-page-${pageIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div className={`pdf-page w-full h-full flex flex-col bg-white text-black ${isPrinting ? "" : "absolute top-0 left-0 origin-top-left"}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX}px`, padding: isPrinting ? '8mm' : '15mm', transform: isPrinting ? 'none' : `scale(${scale})` }}>
              <div className="flex-1 w-full h-full flex flex-col justify-evenly p-1.5 border-[3px] border-gray-800 bg-white min-h-0 overflow-hidden print:border-black">
                {chunk.map((p, i) => {
                  const isRotated = (Number(p.rotation) || 0) % 180 !== 0;
                  const maxImgWidth = isRotated ? '78mm' : '100%';
                  const maxImgHeight = isRotated ? '120mm' : '78mm';

                  return (
                    <div key={i} className="h-[30%] shrink-0 flex gap-2 p-1.5 rounded border border-gray-500 bg-white print:border-black">
                      <div className="w-[60%] h-full flex items-center justify-center overflow-hidden relative border border-gray-400 bg-gray-50 shrink-0 print:bg-white print:border-gray-500">
                        {p.image ? (
                          <div className="relative" style={{ display: 'inline-block', transform: `rotate(${Number(p.rotation) || 0}deg)` }}>
                            <img
                              src={proxyUrl(p.image, `photo_${p.id}_${sessionId}`)}
                              data-original-src={p.image}
                              crossOrigin="anonymous"
                              style={{
                                display: 'block',
                                width: 'auto',
                                height: 'auto',
                                maxWidth: maxImgWidth,
                                maxHeight: maxImgHeight,
                                objectFit: 'contain',
                              }}
                              alt=""
                            />

                            {(p.circles ?? []).map((circle) => {
                              const size = Number(circle.size || 20);
                              return (
                                <div
                                  key={circle.id}
                                  className="absolute aspect-square rounded-full border-[3px] border-red-500 print:border-[2px]"
                                  style={{
                                    left: `${circle.x}%`,
                                    top: `${circle.y}%`,
                                    width: `${size}%`,
                                    transform: 'translate(-50%, -50%)'
                                  }}
                                />
                              );
                            })}

                            {(p.dimensionLines ?? []).map((line) => {
                              const color = line.color || "#FFFFFF";
                              const thickness = Number(line.size || 2);
                              const midX = (line.start.x + line.end.x) / 2;
                              const midY = (line.start.y + line.end.y) / 2;
                              const dynamicFontSize = 10 + (thickness - 2) * 2.5;

                              return (
                                <div key={line.id} className="absolute inset-0 z-20 pointer-events-none w-full h-full" style={{ overflow: 'visible' }}>
                                  <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
                                    <defs>
                                      <marker id={`cad-tick-pdf-${line.id}`} markerWidth="16" markerHeight="16" refX="8" refY="8" orient="auto" markerUnits="userSpaceOnUse">
                                        <line x1="0" y1="8" x2="16" y2="8" stroke={color} strokeWidth={thickness} />
                                        <line x1="4" y1="12" x2="12" y2="4" stroke={color} strokeWidth={thickness * 1.5} />
                                      </marker>
                                    </defs>
                                    <line
                                      x1={`${line.start.x}%`} y1={`${line.start.y}%`}
                                      x2={`${line.end.x}%`} y2={`${line.end.y}%`}
                                      stroke={color} strokeWidth={thickness} fill="none"
                                      markerStart={`url(#cad-tick-pdf-${line.id})`}
                                      markerEnd={`url(#cad-tick-pdf-${line.id})`}
                                    />
                                  </svg>
                                  {line.text && (
                                    <div
                                      style={{
                                        left: `${midX}%`,
                                        top: `${midY}%`,
                                        color: color,
                                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                                        backdropFilter: 'blur(2px)',
                                        fontSize: `${dynamicFontSize}px`,
                                        transform: `translate(-50%, -50%) rotate(${line.textRotation ?? 0}deg)`
                                      }}
                                      className="absolute z-20 font-bold px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap"
                                    >
                                      {line.text}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : <span className="font-bold text-gray-400">写真未登録</span>}
                      </div>
                      <div className="w-[40%] h-full flex flex-col text-[13px] border border-gray-400 bg-white shrink-0 print:border-black">
                        <div className="flex flex-1 min-h-0 border-b border-gray-400 shrink-0 print:border-black"><div className="w-20 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">写真NO</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden whitespace-nowrap">{p.photoNumber || '　'}</div></div>
                        <div className="flex flex-1 min-h-0 border-b border-gray-400 shrink-0 print:border-black"><div className="w-20 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">撮影日</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden whitespace-nowrap">{p.shootingDate || '　'}</div></div>
                        <div className="flex flex-1 min-h-0 border-b border-gray-400 shrink-0 print:border-black"><div className="w-20 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">位置図</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden text-red-700 whitespace-nowrap">{p.locationMap || '　'}</div></div>
                        <div className="flex flex-1 min-h-0 border-b border-gray-400 shrink-0 print:border-black"><div className="w-20 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">工程</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden whitespace-nowrap">{p.process || '　'}</div></div>
                        <div className="flex-[2] flex min-h-0"><div className="w-20 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">説明</div><div className="p-2 flex-1 overflow-hidden font-bold leading-snug flex items-start break-words whitespace-pre-wrap">{p.description || '　'}</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="absolute bottom-[10mm] print:bottom-[5mm] right-[15mm] print:right-[8mm] text-xs font-bold text-gray-500 shrink-0">- {pageOffset('photo') + pageIndex + 1} / {totalPages} -</div>
            </div>
          </div>
        ));}

        case 'beforeAfter': {
          if (!sections.beforeAfter) return [];
          return beforeAfterPages.map((chunk, pageIndex) => (
          <div key={`ba-page-${pageIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div className={`pdf-page bg-white text-black overflow-hidden ${isPrinting ? '' : 'absolute top-0 left-0 origin-top-left'}`}
              style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX}px`, padding: isPrinting ? '8mm' : '15mm', transform: isPrinting ? 'none' : `scale(${scale})`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {/* ページタイトル */}
              <h2 style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '14pt' : '18px', fontWeight: '900', borderBottom: '2px solid #111', paddingBottom: isPrinting ? '2mm' : '6px', marginBottom: isPrinting ? '4mm' : '12px', flexShrink: 0, color: '#111' }}>施工前後比較</h2>
              {/* ペア一覧（1ページ最大2ペア） */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isPrinting ? '5mm' : '16px', minHeight: 0 }}>
                {chunk.map((pair, pairIdx) => {
                  const beforePhoto = (project.photos ?? []).find(p => p.id === pair.beforePhotoId);
                  const afterPhoto = (project.photos ?? []).find(p => p.id === pair.afterPhotoId);
                  return (
                    <div key={pairIdx} style={{ flex: 1, border: '1.5px solid #ccc', borderRadius: '4px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      {/* 部位・説明ヘッダー */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: isPrinting ? '4mm' : '12px', padding: isPrinting ? '2mm 4mm' : '6px 12px', background: '#f5f5f5', borderBottom: '1px solid #ccc', flexShrink: 0 }}>
                        {pair.part && (
                          <span style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '9pt' : '12px', fontWeight: 'bold', background: '#111', color: '#fff', padding: '2px 8px', borderRadius: '2px', whiteSpace: 'nowrap' }}>{pair.part}</span>
                        )}
                        {pair.description && (
                          <span style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '9pt' : '12px', color: '#555', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{pair.description}</span>
                        )}
                      </div>
                      {/* 左右写真エリア */}
                      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                        {/* 施工前 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #ccc', minWidth: 0 }}>
                          <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '8pt' : '11px', fontWeight: 'bold', textAlign: 'center', padding: isPrinting ? '1mm 0' : '4px 0', background: '#e8e8e8', borderBottom: '1px solid #ccc', flexShrink: 0, color: '#555' }}>施工前</div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#f9f9f9' }}>
                            {beforePhoto?.image ? (
                              <img
                                src={proxyUrl(beforePhoto.image, `ba_before_${pair.id}_${sessionId}`)}
                                data-original-src={beforePhoto.image}
                                crossOrigin="anonymous"
                                alt="施工前"
                                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', transform: `rotate(${beforePhoto.rotation ?? 0}deg)` }}
                              />
                            ) : (
                              <span style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '8pt' : '11px', color: '#999' }}>写真なし</span>
                            )}
                          </div>
                        </div>
                        {/* 施工後 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '8pt' : '11px', fontWeight: 'bold', textAlign: 'center', padding: isPrinting ? '1mm 0' : '4px 0', background: '#dceeff', borderBottom: '1px solid #ccc', flexShrink: 0, color: '#2563eb' }}>施工後</div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#f9f9f9' }}>
                            {afterPhoto?.image ? (
                              <img
                                src={proxyUrl(afterPhoto.image, `ba_after_${pair.id}_${sessionId}`)}
                                data-original-src={afterPhoto.image}
                                crossOrigin="anonymous"
                                alt="施工後"
                                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', transform: `rotate(${afterPhoto.rotation ?? 0}deg)` }}
                              />
                            ) : (
                              <span style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '8pt' : '11px', color: '#999' }}>写真なし</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="absolute bottom-[10mm] print:bottom-[5mm] right-[15mm] print:right-[8mm] text-xs font-bold text-gray-500 shrink-0">- {pageOffset('beforeAfter') + pageIndex + 1} / {totalPages} -</div>
            </div>
          </div>
        ));}

        case 'completion': {
          if (!sections.completion) return [];
          // 主要写真3枚を自動選択（施工前→施工中→施工後、なければ先頭/中間/末尾）
          const withImg = (project.photos ?? []).filter(p => p.image);
          const findByKeyword = (kw: string) => withImg.find(p => p.process?.includes(kw) || p.description?.includes(kw));
          const p0 = findByKeyword('前') ?? withImg[0];
          const p1 = findByKeyword('中') ?? withImg[Math.floor(withImg.length / 2)];
          const p2 = findByKeyword('後') ?? withImg[withImg.length - 1];
          const keyPhotos = [p0, p1, p2].filter(Boolean) as typeof withImg;

          const topMaterials = (project.materials ?? []).filter(m => m.name).slice(0, 4);

          return [(
            <div key="completion" style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
              <div className={`pdf-page bg-white text-black overflow-hidden ${isPrinting ? '' : 'absolute top-0 left-0 origin-top-left'}`}
                style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX}px`, padding: isPrinting ? '8mm 10mm' : '30px 38px', transform: isPrinting ? 'none' : `scale(${scale})`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: isPrinting ? '4mm' : '14px', position: 'relative' }}>

                {/* ヘッダー */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: isPrinting ? '3mm' : '10px', flexShrink: 0 }}>
                  <h2 style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '16pt' : '21px', fontWeight: '900', color: '#111', margin: 0 }}>完了報告書</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: isPrinting ? '3mm' : '10px' }}>
                    {logoUrl ? (
                      <img src={proxyUrl(logoUrl, `logo_cr_${sessionId}`)} data-original-src={logoUrl} crossOrigin="anonymous" alt="logo" style={{ height: isPrinting ? '8mm' : '30px', width: 'auto', objectFit: 'contain' }} />
                    ) : (
                      <img src={kawaraLogo} data-original-src={kawaraLogo} alt="logo" crossOrigin="anonymous" style={{ height: isPrinting ? '7mm' : '26px', width: 'auto', objectFit: 'contain', filter: 'grayscale(1)' }} />
                    )}
                    {companyName && (
                      <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '8pt' : '11px', color: '#555', lineHeight: 1.4 }}>
                        <div style={{ fontWeight: 'bold', color: '#222' }}>{companyName}</div>
                        {address && <div>{address}</div>}
                        {phone && <div>TEL: {phone}</div>}
                      </div>
                    )}
                  </div>
                </div>

                {/* 工事情報テーブル */}
                <div style={{ flexShrink: 0, border: '1px solid #ccc', borderRadius: '3px', overflow: 'hidden' }}>
                  {([
                    ['工事件名', project.projectName],
                    ['工事場所', project.projectLocation],
                    ['工　　期', project.constructionPeriod],
                    ['作成年月日', project.creationDate],
                  ] as [string, string][]).map(([label, value], i) => (
                    <div key={i} style={{ display: 'flex', borderBottom: i < 3 ? '1px solid #e0e0e0' : 'none' }}>
                      <div style={{ width: isPrinting ? '28mm' : '106px', flexShrink: 0, fontFamily: JP_FONT, fontSize: isPrinting ? '8pt' : '11px', fontWeight: 'bold', color: '#666', background: '#f5f5f5', padding: isPrinting ? '1.5mm 3mm' : '5px 10px', display: 'flex', alignItems: 'center', borderRight: '1px solid #e0e0e0' }}>{label}</div>
                      <div style={{ flex: 1, fontFamily: JP_FONT, fontSize: isPrinting ? '8.5pt' : '12px', color: '#111', padding: isPrinting ? '1.5mm 3mm' : '5px 10px', display: 'flex', alignItems: 'center' }}>{value || '　'}</div>
                    </div>
                  ))}
                </div>

                {/* 主要写真3枚 */}
                {keyPhotos.length > 0 && (
                  <div style={{ flex: keyPhotos.length > 0 ? '1 1 0' : '0', display: 'flex', gap: isPrinting ? '3mm' : '10px', minHeight: 0 }}>
                    {keyPhotos.map((p, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #ccc', borderRadius: '3px', overflow: 'hidden', minWidth: 0 }}>
                        <div style={{ flex: 1, overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <img
                            src={proxyUrl(p.image!, `cr_photo_${p.id}_${sessionId}`)}
                            data-original-src={p.image!}
                            crossOrigin="anonymous"
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: `rotate(${p.rotation ?? 0}deg)` }}
                          />
                        </div>
                        <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '7pt' : '10px', color: '#555', padding: isPrinting ? '1mm 2mm' : '3px 6px', background: '#f9f9f9', borderTop: '1px solid #e8e8e8', flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {p.process || p.description || `写真${i + 1}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 使用材料テーブル */}
                {topMaterials.length > 0 && (
                  <div style={{ flexShrink: 0, border: '1px solid #ccc', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', background: '#f0f0f0', borderBottom: '1px solid #ccc' }}>
                      {(['品名', 'メーカー', '規格・数量', '備考'] as const).map(h => (
                        <div key={h} style={{ flex: 1, fontFamily: JP_FONT, fontSize: isPrinting ? '7pt' : '10px', fontWeight: 'bold', color: '#555', padding: isPrinting ? '1mm 2mm' : '4px 6px', borderRight: '1px solid #ddd', textAlign: 'center' }}>{h}</div>
                      ))}
                    </div>
                    {topMaterials.map((m, i) => (
                      <div key={i} style={{ display: 'flex', borderBottom: i < topMaterials.length - 1 ? '1px solid #ebebeb' : 'none' }}>
                        {[m.name, m.manufacturer, m.specification, m.remarks].map((v, j) => (
                          <div key={j} style={{ flex: 1, fontFamily: JP_FONT, fontSize: isPrinting ? '7.5pt' : '10px', color: '#333', padding: isPrinting ? '1mm 2mm' : '4px 6px', borderRight: '1px solid #ebebeb', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{v || '　'}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* 施工保証ボックス */}
                {(project.warrantyYears || project.warrantyStartDate || project.warrantyNote) && (
                  <div style={{ flexShrink: 0, border: '1.5px solid #555', borderRadius: '4px', padding: isPrinting ? '2mm 4mm' : '8px 14px', background: '#fafafa' }}>
                    <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '8pt' : '11px', fontWeight: 'bold', color: '#333', marginBottom: isPrinting ? '1.5mm' : '5px' }}>■ 施工保証</div>
                    <div style={{ display: 'flex', gap: isPrinting ? '6mm' : '20px', flexWrap: 'wrap' }}>
                      {project.warrantyYears && <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '8pt' : '11px', color: '#444' }}><span style={{ color: '#888' }}>保証期間：</span>{project.warrantyYears}</div>}
                      {project.warrantyStartDate && <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '8pt' : '11px', color: '#444' }}><span style={{ color: '#888' }}>開始日：</span>{project.warrantyStartDate}</div>}
                      {project.warrantyNote && <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '8pt' : '11px', color: '#555', fontStyle: 'italic' }}>{project.warrantyNote}</div>}
                    </div>
                  </div>
                )}

                {/* 署名欄 */}
                <div style={{ flexShrink: 0, display: 'flex', gap: isPrinting ? '5mm' : '18px', marginTop: 'auto' }}>
                  {(['施工業者', '施主確認'] as const).map(label => (
                    <div key={label} style={{ flex: 1, border: '1px solid #ccc', borderRadius: '3px', padding: isPrinting ? '2mm 3mm' : '8px 10px' }}>
                      <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '7pt' : '10px', fontWeight: 'bold', color: '#888', marginBottom: isPrinting ? '5mm' : '18px' }}>{label}</div>
                      <div style={{ borderBottom: '1px solid #bbb', height: isPrinting ? '8mm' : '30px' }} />
                    </div>
                  ))}
                </div>

                <div className="absolute bottom-[10mm] print:bottom-[5mm] right-[15mm] print:right-[8mm] text-xs font-bold text-gray-500">- {pageOffset('completion') + 1} / {totalPages} -</div>
              </div>
            </div>
          )];
        }

        case 'material': {
          if (!sections.material) return [];
          return materialPages.map((chunk, pageIndex) => (
          <div key={`material-page-${pageIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div className={`pdf-page w-full h-full flex flex-col bg-white text-black ${isPrinting ? "" : "absolute top-0 left-0 origin-top-left"}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX}px`, padding: isPrinting ? '8mm' : '15mm', transform: isPrinting ? 'none' : `scale(${scale})` }}>
              <h2 className="text-xl font-bold pb-1 mb-2 border-b-2 border-gray-800 shrink-0 print:border-black print:pb-0 print:mb-1">使用材料表</h2>
              <div className="flex-1 w-full h-full flex flex-col justify-evenly p-1.5 border-[3px] border-gray-800 bg-white min-h-0 overflow-hidden print:border-black">
                {chunk.map((m, i) => {
                  const isRotated = (Number(m.rotation) || 0) % 180 !== 0;
                  const maxImgWidth = isRotated ? '78mm' : '100%';
                  const maxImgHeight = isRotated ? '120mm' : '78mm';

                  return (
                    <div key={i} className="h-[30%] shrink-0 flex gap-2 p-1.5 rounded border border-gray-500 bg-white print:border-black">
                      <div className="w-[60%] h-full flex items-center justify-center overflow-hidden relative border border-gray-400 bg-gray-50 shrink-0 print:bg-white print:border-gray-500">
                        {m.image ? (
                          <div className="relative" style={{ display: 'inline-block' }}>
                            <img
                              src={proxyUrl(m.image, `material_${m.id}_${sessionId}`)}
                              data-original-src={m.image}
                              crossOrigin="anonymous"
                              style={{
                                display: 'block',
                                width: 'auto',
                                height: 'auto',
                                maxWidth: maxImgWidth,
                                maxHeight: maxImgHeight,
                                objectFit: 'contain',
                                transform: `rotate(${Number(m.rotation) || 0}deg)`
                              }}
                              alt=""
                            />
                          </div>
                        ) : <span className="font-bold text-gray-400">写真未登録</span>}
                      </div>
                      <div className="w-[40%] h-full flex flex-col text-[13px] border border-gray-400 bg-white shrink-0 print:border-black">
                        <div className="flex flex-1 min-h-0 border-b border-gray-400 shrink-0 print:border-black"><div className="w-24 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">品名</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden break-words whitespace-pre-wrap">{m.name || '　'}</div></div>
                        <div className="flex flex-1 min-h-0 border-b border-gray-400 shrink-0 print:border-black"><div className="w-24 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">メーカー</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden break-words whitespace-pre-wrap">{m.manufacturer || '　'}</div></div>
                        <div className="flex flex-[1.5] min-h-0 border-b border-gray-400 shrink-0 print:border-black"><div className="w-24 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-tight print:bg-gray-50 print:border-black">規格・寸法<br />数量</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden text-red-700 leading-snug break-words whitespace-pre-wrap">{m.specification || '　'}</div></div>
                        <div className="flex flex-1 min-h-0"><div className="w-24 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">備考</div><div className="p-2 flex-1 overflow-hidden font-bold flex items-start leading-snug break-words whitespace-pre-wrap">{m.remarks || '　'}</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="absolute bottom-[10mm] print:bottom-[5mm] right-[15mm] print:right-[8mm] text-xs font-bold text-gray-500 shrink-0">- {pageOffset('material') + pageIndex + 1} / {totalPages} -</div>
            </div>
          </div>
        ));}

        case 'appendix': {
          if (!sections.appendix) return [];
          return appendixPages.map((src, pageIndex) => (
          <div key={`appendix-${pageIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `auto` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div className={`pdf-page bg-white overflow-hidden ${isPrinting ? '' : 'absolute top-0 left-0 origin-top-left'}`}
              style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? 'auto' : `${A4_HEIGHT_PX}px`, transform: isPrinting ? 'none' : `scale(${scale})`, padding: 0 }}>
              <img src={src} alt={`添付資料 ${pageIndex + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              <div className="absolute bottom-[10mm] print:bottom-[5mm] right-[15mm] print:right-[8mm] text-xs font-bold text-gray-500">
                - {pageOffset('appendix') + pageIndex + 1} / {totalPages} -
              </div>
            </div>
          </div>
          ));}

        default: return [];
        }})}
      </div>
    </div>
  );
}
