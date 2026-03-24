import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Circle, MapRow, MapLine, Photo, Project, Material } from '../types';
import kawaraLogo from '../assets/kawara-logo.png';
import {
  A4_HEIGHT_PX,
  A4_WIDTH_PX,
  getPreviewScale,
  proxyUrl,
} from '../shared/utils';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

const PDF_GENERATE_URL = 'https://generatepdf-ld4b4dsi5q-an.a.run.app';

// ★追加：絶対に綺麗なゴシック体を強制するフォント指定
const GOTHIC_FONT = '"Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif';

function safeStyleLine(
  val: string | number | undefined | null,
  defaultUnit: string,
): string {
  if (val == null || val === '') return `0${defaultUnit}`;
  if (typeof val === 'number') return `${val}${defaultUnit}`;
  return String(val);
}

function pdfEndpointCandidates(): string[] {
  const env = (import.meta.env.VITE_PDF_GENERATE_URL as string | undefined)?.trim();
  const isLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  if (env) {
    if (!isLocal && env.includes('run.app')) {
      return ['/api/generatePdf'];
    }
    return [env];
  }

  if (!isLocal) {
    return ['/api/generatePdf'];
  }
  return [PDF_GENERATE_URL, '/api/generatePdf'];
}

async function responseToPdfBlob(response: Response): Promise<Blob> {
  const buf = await response.arrayBuffer();
  const u8 = new Uint8Array(buf);
  const isPdf =
    u8.length >= 4 &&
    u8[0] === 0x25 &&
    u8[1] === 0x50 &&
    u8[2] === 0x44 &&
    u8[3] === 0x46;
  if (isPdf) {
    return new Blob([buf], { type: 'application/pdf' });
  }
  const text = new TextDecoder().decode(buf);
  try {
    const data = JSON.parse(text) as { pdfBase64?: string };
    if (data.pdfBase64) {
      const binary = atob(data.pdfBase64);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
      }
      return new Blob([out], { type: 'application/pdf' });
    }
  } catch {
    /* ignore */
  }
  throw new Error('有効なPDFデータが返りませんでした');
}

type ProjectWithOptionals = Project;

const LINE_TYPES = [
  { label: '流れ壁', color: '#3b82f6' },
  { label: '平行壁', color: '#eab308' },
  { label: '棟', color: '#22c55e' },
  { label: '軒先', color: '#f97316' },
  { label: '袖', color: '#ec4899' },
  { label: 'その他', color: '#ef4444' },
];

const COVER_FIELDS: { label: string; key: keyof Project }[] = [
  { label: '工事件名', key: 'projectName' },
  { label: '工事場所', key: 'projectLocation' },
  { label: '工期', key: 'constructionPeriod' },
  { label: '施工業者', key: 'contractorName' },
  { label: '作成年月日', key: 'creationDate' },
];

function createEmptyPhoto(): Photo & { circles?: Circle[] } {
  return {
    id: Math.random(),
    image: null,
    photoNumber: '',
    shootingDate: '',
    locationMap: '',
    process: '',
    description: '',
    circles: [],
  };
}

function createEmptyMaterial(): Material {
  return {
    id: Math.random(),
    image: null,
    name: '',
    manufacturer: '',
    specification: '',
    remarks: '',
    rotation: 0,
  };
}

function PdfLineLegend() {
  return (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', fontWeight: 'bold', padding: '8px', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: '#ffffff', fontFamily: GOTHIC_FONT }}>
      {LINE_TYPES.map((type) => (
        <div key={type.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ backgroundColor: type.color, width: '24px', height: '2px', borderRadius: '9999px' }} />
          <span style={{ color: '#374151' }}>{type.label}</span>
        </div>
      ))}
    </div>
  );
}

function downloadPdfBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 10000);
}

export default function PdfExportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectWithOptionals | null>(null);
  const [userSettings, setUserSettings] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [scale, setScale] = useState(1);
  const [sessionId] = useState(() => Date.now().toString());

  useEffect(() => {
    if (!id) return;
    setError(null);
    const fetchData = async () => {
      try {
        const d = await getDoc(doc(db, 'projects', id));
        if (d.exists()) setProject(d.data() as ProjectWithOptionals);
        const user = auth.currentUser;
        if (user) {
          const s = await getDoc(doc(db, 'users', user.uid));
          if (s.exists()) setUserSettings(s.data() as Record<string, unknown>);
        }
      } catch {
        setError('データの読み込みに失敗しました。');
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

  const handleZipExport = async () => {
    if (!project) return;
    try {
      setIsZipping(true);
      setError(null);
      await new Promise((r) => setTimeout(r, 100));

      const zip = new JSZip();
      const folderName = project.projectName || '現場写真';
      const imgFolder = zip.folder(folderName);
      if (!imgFolder) throw new Error('フォルダ作成失敗');

      const activePhotos = (project.photos ?? []).filter((p) => p.image);
      if (activePhotos.length === 0) {
        setError('ダウンロードする写真がありません。');
        setIsZipping(false);
        return;
      }

      const promises = activePhotos.map(async (p) => {
        if (!p.image) return;
        try {
          const response = await fetch(p.image);
          const blob = await response.blob();
          const processName = p.process ? `_${p.process}` : '';
          const filename = `${p.photoNumber.padStart(2, '0')}${processName}.jpg`;
          imgFolder.file(filename, blob);
        } catch {
          /* ignore */
        }
      });

      await Promise.all(promises);
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${folderName}.zip`);
    } catch {
      setError('Zipファイルの作成に失敗しました。');
    } finally {
      setIsZipping(false);
    }
  };

  const handleExport = async () => {
    if (!project) return;
    setIsExporting(true);
    setError(null);

    const pdfName = `${project.projectName || '現場報告書'}_${new Date().getTime()}.pdf`;

    const buildServerHtmlPayload = (): string => {
      const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map((styleEl) => styleEl.outerHTML)
        .join('');

      const container = document.querySelector('.pdf-container-wrapper');
      if (!container) throw new Error('データが見つかりません');
      const clone = container.cloneNode(true) as HTMLElement;

      const wrappers = clone.querySelectorAll('.pdf-page-wrapper');
      wrappers.forEach((w: Element) => {
        const el = w as HTMLElement;
        el.style.width = '794px';
        el.style.height = '1123px';
        el.style.pageBreakAfter = 'always';
        el.style.margin = '0';
        el.style.boxShadow = 'none';
      });

      const pages = clone.querySelectorAll('.pdf-page');
      pages.forEach((p: Element) => {
        const el = p as HTMLElement;
        el.style.transform = 'none';
        el.style.position = 'relative';
        el.style.width = '794px';
        el.style.height = '1123px';
      });

      // ★追加：body に強制的にゴシック体を指定
      return `<!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            ${styles}
            <style>
              @page { margin: 0; size: A4 portrait; }
              body { 
                margin: 0; 
                padding: 0; 
                background-color: #ffffff; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
                font-family: ${GOTHIC_FONT};
              }
              * { font-family: inherit; }
            </style>
          </head>
          <body>
            ${clone.innerHTML}
          </body>
          </html>`;
    };

    const exportPdfClientSide = async () => {
      const pages = document.querySelectorAll('.pdf-page');
      if (pages.length === 0) throw new Error('PDFページが見つかりません');
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 500));
      if (document.fonts?.ready) await document.fonts.ready;

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement;
        pageEl.scrollIntoView({ behavior: 'instant', block: 'center' });
        await new Promise((r) => setTimeout(r, 600));

        const currentTransform = pageEl.style.transform;
        pageEl.style.transform = 'scale(1)';

        const dataUrl = await toJpeg(pageEl, {
          cacheBust: true,
          quality: 0.95,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
        });

        pageEl.style.transform = currentTransform;

        const pdfHeight = (pageEl.offsetHeight * pdfWidth) / pageEl.offsetWidth;
        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }
      pdf.save(pdfName);
    };

    try {
      const htmlPayload = buildServerHtmlPayload();
      const body = JSON.stringify({ html: htmlPayload });
      let serverOk = false;
      let lastServerErr: unknown;

      for (const url of pdfEndpointCandidates()) {
        try {
          const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
          if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`サーバーエラー: ${response.status}${errText ? ` ${errText.slice(0, 200)}` : ''}`);
          }
          const blob = await responseToPdfBlob(response);
          if (blob.size === 0) throw new Error('PDFデータが空です');
          downloadPdfBlob(blob, pdfName);
          serverOk = true;
          break;
        } catch (e) {
          lastServerErr = e;
        }
      }

      if (!serverOk) {
        console.warn('サーバーPDFに失敗、ブラウザで生成します', lastServerErr);
        try {
          await exportPdfClientSide();
        } catch (clientErr) {
          console.error(clientErr);
          setError('PDFの保存に失敗しました。');
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setError('PDF作成中にエラーが発生しました。');
    } finally {
      setIsExporting(false);
    }
  };

  if (!project) return <LoadingSpinner />;

  const logoUrl = typeof userSettings?.logoUrl === 'string' ? userSettings.logoUrl : undefined;
  const companyName = typeof userSettings?.companyName === 'string' ? userSettings.companyName : undefined;
  const address = typeof userSettings?.address === 'string' ? userSettings.address : undefined;
  const phone = typeof userSettings?.phone === 'string' ? userSettings.phone : undefined;

  const mapUrlsToRender = project.mapUrls?.length ? project.mapUrls.slice(0, 3) : [''];
  const mapCount = mapUrlsToRender.length;

  const activePhotos = (project.photos ?? []).filter((p) => p.image || p.process || p.description);
  const photoPages: (Photo & { circles?: Circle[] })[][] = [];
  for (let i = 0; i < Math.max(activePhotos.length, 3); i += 3) {
    const chunk = activePhotos.slice(i, i + 3);
    while (chunk.length < 3) chunk.push(createEmptyPhoto());
    photoPages.push(chunk);
  }

  const activeMaterials = (project.materials ?? []).filter(
    (m) => m.image || m.name || m.manufacturer || m.specification || m.remarks,
  );
  const materialPages: Material[][] = [];
  if (activeMaterials.length > 0) {
    for (let i = 0; i < Math.max(activeMaterials.length, 3); i += 3) {
      const chunk = activeMaterials.slice(i, i + 3);
      while (chunk.length < 3) chunk.push(createEmptyMaterial());
      materialPages.push(chunk);
    }
  }

  const totalPages = 1 + mapCount + photoPages.length + materialPages.length;
  
  const wrapperStyle = {
    width: `${A4_WIDTH_PX * scale}px`,
    height: `${A4_HEIGHT_PX * scale}px`,
    overflow: 'hidden',
    position: 'relative' as const,
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    flexShrink: 0
  };

  // ★追加：ページ全体にゴシック体を強制
  const pageStyle = {
    width: `${A4_WIDTH_PX}px`,
    height: `${A4_HEIGHT_PX}px`,
    padding: '15mm',
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    backgroundColor: '#ffffff',
    color: '#000000',
    fontFamily: GOTHIC_FONT, // ★ここ！！
    boxSizing: 'border-box' as const,
    position: 'absolute' as const,
    top: 0,
    left: 0,
    display: 'flex',
    flexDirection: 'column' as const
  };

  return (
    <div className="min-h-screen bg-gray-200 p-4 sm:p-6 font-sans flex flex-col items-center pb-12 overflow-x-hidden w-full relative">
      
      {/* 操作パネル */}
      <div className="w-full max-w-2xl mb-6 flex justify-between items-center flex-wrap gap-2">
        <button type="button" onClick={() => navigate(`/project/${id}`)} className="text-blue-500 font-bold flex items-center gap-2 text-lg">
          <ArrowLeft className="w-6 h-6" /> もどる
        </button>
        <div className="flex gap-2 sm:gap-4">
          <button type="button" onClick={handleZipExport} disabled={isExporting || isZipping} className="flex items-center gap-2 bg-green-600 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-xl font-bold shadow-lg text-sm sm:text-base hover:bg-green-700 disabled:opacity-50">
            <Download className="w-5 h-5" /> 写真のみ(Zip)
          </button>
          <button type="button" onClick={handleExport} disabled={isExporting || isZipping} className="flex items-center gap-2 bg-black text-white px-5 sm:px-8 py-3 sm:py-4 rounded-xl font-bold shadow-lg text-base sm:text-lg hover:bg-gray-800 disabled:opacity-50">
            {isExporting ? 'PDF出力中...' : 'PDF出力'}
          </button>
        </div>
      </div>

      {error && <div className="w-full max-w-2xl mb-4"><ErrorMessage message={error} onDismiss={() => setError(null)} /></div>}

      {/* PDFコンテナ */}
      <div className="pdf-container-wrapper flex flex-col gap-8 items-center w-full">
        
        {/* =========================================
            ① 表紙ページ
        ========================================= */}
        <div style={wrapperStyle} className="pdf-page-wrapper">
          <div className="pdf-page" style={{ ...pageStyle, alignItems: 'center' }}>
            <div style={{ marginTop: '10mm', marginBottom: '30mm', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
                {logoUrl ? (
                  <img src={proxyUrl(logoUrl, `logo_${sessionId}`)} alt="自社ロゴ" style={{ width: '40mm', height: 'auto', objectFit: 'contain' }} crossOrigin="anonymous" />
                ) : (
                  <img src={kawaraLogo} alt="標準ロゴ" style={{ width: '32mm', height: 'auto', objectFit: 'contain', filter: 'grayscale(100%)' }} crossOrigin="anonymous" />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h1 style={{ fontSize: '48px', fontWeight: '900', letterSpacing: '0.3em', marginBottom: '16px', whiteSpace: 'nowrap', textAlign: 'center' }}>工事写真報告書</h1>
                <div style={{ width: '160mm', borderBottom: '4px solid #000000' }} />
                <div style={{ width: '160mm', borderBottom: '1px solid #000000', marginTop: '6px' }} />
              </div>
            </div>

            <div style={{ width: '150mm', display: 'flex', flexDirection: 'column', gap: '12mm', margin: '0 auto' }}>
              {COVER_FIELDS.map((item, idx) => {
                let value = String(project[item.key] ?? '　');
                if (item.key === 'contractorName' && companyName) value = companyName;
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '8px', borderBottom: '2px solid #000000' }}>
                    <div style={{ width: '45mm', flexShrink: 0, display: 'flex', justifyContent: 'space-between', fontSize: '22px', fontWeight: 'bold', paddingRight: '32px', lineHeight: 1 }}>
                      {item.label.split('').map((c: string, i: number) => (
                        <span key={i} style={{ display: 'block', lineHeight: 1 }}>{c}</span>
                      ))}
                    </div>
                    <div style={{ flex: 1, fontSize: '26px', fontWeight: '900', whiteSpace: 'nowrap', overflow: 'hidden', paddingLeft: '16px', lineHeight: 1, paddingBottom: '2px' }}>{value}</div>
                  </div>
                );
              })}
            </div>

            {userSettings && (address || phone) && (
              <div style={{ position: 'absolute', bottom: '16mm', right: '15mm', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', padding: '4px 0', backgroundColor: '#ffffff' }}>
                {companyName && <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#000000', marginBottom: '4px' }}>{companyName}</div>}
                {address && <div style={{ fontSize: '14px', color: '#1f2937' }}>{address}</div>}
                {phone && <div style={{ fontSize: '14px', color: '#1f2937' }}>TEL: {phone}</div>}
              </div>
            )}
            <div style={{ position: 'absolute', bottom: '10mm', right: '15mm', fontSize: '16px', fontWeight: 'bold', color: '#000000' }}>
              - 1 / {totalPages} -
            </div>
          </div>
        </div>

        {/* =========================================
            ② 位置図ページ
        ========================================= */}
        {mapUrlsToRender.map((u, mapIndex) => (
          <div key={`map-page-${mapIndex}`} style={wrapperStyle} className="pdf-page-wrapper">
            <div className="pdf-page" style={pageStyle}>
              <div style={{ width: '100%', height: '100%', padding: '24px', display: 'flex', flexDirection: 'column', border: '3px solid #1f2937', boxSizing: 'border-box' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px', paddingBottom: '8px', borderBottom: '2px solid #1f2937' }}>
                  位置図 {mapCount > 1 ? `(${mapIndex + 1}/${mapCount})` : ''}
                </h2>
                <div style={{ padding: '8px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #9ca3af', backgroundColor: '#f9fafb' }}>
                  {u ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img src={proxyUrl(u, `map_${mapIndex}_${sessionId}`)} crossOrigin="anonymous" style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '150mm' }} alt="" />
                        
                        {(project.mapPins ?? []).filter((p) => p.mapIndex === mapIndex).map((pin) => (
                            <div key={pin.id} style={{ position: 'absolute', left: `${pin.x}%`, top: `${pin.y}%`, transform: `translate(-50%, -50%) scale(${pin.size ?? 1})`, zIndex: 10 }}>
                              {pin.type === 'arrow' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 4px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.7)', border: '1px solid #fecaca' }}>
                                  <span style={{ fontSize: '24px', fontWeight: '900', color: '#dc2626', transform: `rotate(${pin.rotation ?? 0}deg)` }}>➡</span>
                                  <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#dc2626' }}>{pin.label}</span>
                                </div>
                              ) : (
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <div style={{ width: '14mm', height: '14mm', borderRadius: '50%', border: '4px solid #dc2626', backgroundColor: 'rgba(220,38,38,0.1)' }} />
                                  <span style={{ position: 'absolute', fontSize: '18px', fontWeight: 'bold', padding: '0 4px', borderRadius: '4px', color: '#dc2626', backgroundColor: 'rgba(255,255,255,0.7)' }}>{pin.label}</span>
                                </div>
                              )}
                            </div>
                        ))}

                        {(project.mapLines ?? [])
                          .filter((l) => l.mapIndex === mapIndex)
                          .map((line: MapLine) => (
                            <div
                              key={`line-${line.id}`}
                              style={{
                                position: 'absolute',
                                left: safeStyleLine(line.x, '%'),
                                top: safeStyleLine(line.y, '%'),
                                width: safeStyleLine(line.length, '%'),
                                height: safeStyleLine(line.thickness, 'px'),
                                backgroundColor: line.color || '#000000',
                                transform: `translate(-50%, -50%) rotate(${line.rotation ?? 0}deg)`,
                                transformOrigin: 'center center',
                                zIndex: 15,
                                WebkitPrintColorAdjust: 'exact',
                                printColorAdjust: 'exact',
                              }}
                            />
                          ))}
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontWeight: 'bold', color: '#9ca3af' }}>位置図未登録</span>
                  )}
                </div>
                
                <div style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 'bold' }}>項目欄</div>
                    <PdfLineLegend />
                  </div>
                  <div style={{ border: '2px solid #1f2937' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', fontSize: '16px', fontWeight: 'bold', borderBottom: '2px solid #1f2937', backgroundColor: '#f3f4f6' }}>
                      <div style={{ gridColumn: 'span 1 / span 1', padding: '8px 0', textAlign: 'center', borderRight: '2px solid #1f2937' }}>符号</div>
                      <div style={{ gridColumn: 'span 2 / span 2', padding: '8px 0', textAlign: 'center', borderRight: '2px solid #1f2937' }}>部位</div>
                      <div style={{ gridColumn: 'span 2 / span 2', padding: '8px 0', textAlign: 'center', fontSize: '14px', borderRight: '2px solid #1f2937' }}>写真NO</div>
                      <div style={{ gridColumn: 'span 7 / span 7', padding: '8px 0', textAlign: 'center' }}>備考</div>
                    </div>
                    {(() => {
                      const rows: MapRow[] = project.mapRows ?? [];
                      const currentRows = rows.filter((r) => r.mapIndex === mapIndex || (r.mapIndex === undefined && mapIndex === 0));
                      const displayRows: MapRow[] = currentRows.length > 0 ? currentRows.slice(0, 6) : Array.from({ length: 6 }, (_, i) => ({ id: -(i + 1), symbol: '　', part: '　', photoNo: '　', remarks: '　' }));
                      return displayRows.map((row) => (
                        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', fontSize: '16px', borderBottom: '1px solid #9ca3af' }}>
                          <div style={{ gridColumn: 'span 1 / span 1', padding: '8px 0', fontWeight: 'bold', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid #9ca3af', color: '#b91c1c' }}>{row.symbol ?? '　'}</div>
                          <div style={{ gridColumn: 'span 2 / span 2', padding: '8px', display: 'flex', alignItems: 'center', overflow: 'hidden', borderRight: '1px solid #9ca3af' }}>{row.part ?? '　'}</div>
                          <div style={{ gridColumn: 'span 2 / span 2', padding: '8px 0', textAlign: 'center', fontSize: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderRight: '1px solid #9ca3af' }}>{row.photoNo ?? row.relatedPhotoNumber ?? '　'}</div>
                          <div style={{ gridColumn: 'span 7 / span 7', padding: '8px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>{row.remarks ?? '　'}</div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
              <div style={{ position: 'absolute', bottom: '10mm', right: '15mm', fontSize: '12px', fontFamily: 'serif', color: '#9ca3af' }}>
                - {2 + mapIndex} / {totalPages} -
              </div>
            </div>
          </div>
        ))}

        {/* =========================================
            ③ 写真ページ
        ========================================= */}
        {photoPages.map((chunk, pageIndex) => (
          <div key={`photo-page-${pageIndex}`} style={wrapperStyle} className="pdf-page-wrapper">
            <div className="pdf-page" style={pageStyle}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '8px', border: '3px solid #1f2937' }}>
                {chunk.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', height: '32%', padding: '8px', borderRadius: '4px', border: '1px solid #6b7280' }}>
                    <div style={{ width: '60%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative', minHeight: 0, border: '2px solid #374151', backgroundColor: '#f9fafb' }}>
                      {p.image ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                          <div style={{ position: 'relative', display: 'inline-block', transform: `rotate(${(p as Photo).rotation ?? 0}deg)`, transformOrigin: 'center center' }}>
                            <img src={proxyUrl(p.image, `photo_${p.id}_${sessionId}`)} crossOrigin="anonymous" style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '88mm' }} alt="" />
                            {(p.circles ?? []).map((circle) => (
                              <div key={circle.id} style={{ position: 'absolute', left: `${circle.x}%`, top: `${circle.y}%`, width: `${circle.size}%`, aspectRatio: '1/1', transform: 'translate(-50%, -50%)', borderRadius: '50%', border: '3px solid #dc2626' }} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontWeight: 'bold', color: '#9ca3af' }}>写真未登録</span>
                      )}
                    </div>

                    <div style={{ width: '40%', display: 'flex', flexDirection: 'column', fontSize: '14px', border: '2px solid #374151', backgroundColor: '#ffffff' }}>
                      <div style={{ display: 'flex', minHeight: '36px', borderBottom: '1px solid #9ca3af' }}>
                        <div style={{ width: '80px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: '12px', backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>写真NO</div>
                        <div style={{ padding: '0 12px', flex: 1, fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center' }}>{p.photoNumber || '　'}</div>
                      </div>
                      <div style={{ display: 'flex', minHeight: '36px', borderBottom: '1px solid #9ca3af' }}>
                        <div style={{ width: '80px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>撮影日</div>
                        <div style={{ padding: '0 12px', flex: 1, display: 'flex', alignItems: 'center', fontWeight: '500' }}>{p.shootingDate || '　'}</div>
                      </div>
                      <div style={{ display: 'flex', minHeight: '36px', borderBottom: '1px solid #9ca3af' }}>
                        <div style={{ width: '80px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>位置図</div>
                        <div style={{ padding: '0 12px', flex: 1, fontWeight: 'bold', display: 'flex', alignItems: 'center', color: '#b91c1c' }}>{p.locationMap || '　'}</div>
                      </div>
                      <div style={{ display: 'flex', minHeight: '36px', borderBottom: '1px solid #9ca3af' }}>
                        <div style={{ width: '80px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>工程</div>
                        <div style={{ padding: '0 12px', flex: 1, display: 'flex', alignItems: 'center', fontWeight: '500' }}>{p.process || '　'}</div>
                      </div>
                      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                        <div style={{ width: '80px', padding: '8px 0', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>説明</div>
                        <div style={{ padding: '12px', flex: 1, whiteSpace: 'pre-wrap', overflow: 'hidden', fontWeight: '500', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start' }}>{p.description || '　'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ position: 'absolute', bottom: '10mm', right: '15mm', fontSize: '12px', fontFamily: 'serif', color: '#9ca3af' }}>
                - {2 + mapCount + pageIndex} / {totalPages} -
              </div>
            </div>
          </div>
        ))}

        {/* =========================================
            ④ 使用材料表
        ========================================= */}
        {materialPages.map((chunk, pageIndex) => (
          <div key={`material-page-${pageIndex}`} style={wrapperStyle} className="pdf-page-wrapper">
            <div className="pdf-page" style={pageStyle}>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 'bold', paddingBottom: '4px', borderBottom: '2px solid #1f2937' }}>使用材料表</h2>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '8px', border: '3px solid #1f2937' }}>
                {chunk.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', height: '32%', padding: '8px', borderRadius: '4px', border: '1px solid #6b7280' }}>
                    <div style={{ width: '60%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative', minHeight: 0, border: '2px solid #374151', backgroundColor: '#f9fafb' }}>
                      {m.image ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                          <div style={{ position: 'relative', display: 'inline-block', transform: `rotate(${m.rotation ?? 0}deg)`, transformOrigin: 'center center' }}>
                            <img src={proxyUrl(m.image, `material_${m.id}_${sessionId}`)} crossOrigin="anonymous" style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '85mm' }} alt="" />
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontWeight: 'bold', color: '#9ca3af' }}>写真未登録</span>
                      )}
                    </div>

                    <div style={{ width: '40%', display: 'flex', flexDirection: 'column', fontSize: '14px', border: '2px solid #374151', backgroundColor: '#ffffff' }}>
                      <div style={{ display: 'flex', minHeight: '36px', borderBottom: '1px solid #9ca3af' }}>
                        <div style={{ width: '96px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>品名</div>
                        <div style={{ padding: '0 12px', flex: 1, fontWeight: 'bold', fontSize: '16px', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>{m.name || '　'}</div>
                      </div>
                      <div style={{ display: 'flex', minHeight: '36px', borderBottom: '1px solid #9ca3af' }}>
                        <div style={{ width: '96px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>メーカー</div>
                        <div style={{ padding: '0 12px', flex: 1, overflow: 'hidden', fontWeight: '500', display: 'flex', alignItems: 'center' }}>{m.manufacturer || '　'}</div>
                      </div>
                      <div style={{ display: 'flex', minHeight: '48px', borderBottom: '1px solid #9ca3af' }}>
                        <div style={{ width: '96px', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.2, padding: '4px 0', backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>規格・寸法<br />数量</div>
                        <div style={{ padding: '0 12px', flex: 1, fontWeight: 'bold', overflow: 'hidden', display: 'flex', alignItems: 'center', color: '#b91c1c' }}>{m.specification || '　'}</div>
                      </div>
                      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                        <div style={{ width: '96px', padding: '8px 0', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>備考</div>
                        <div style={{ padding: '12px', flex: 1, whiteSpace: 'pre-wrap', overflow: 'hidden', fontWeight: '500', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start' }}>{m.remarks || '　'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ position: 'absolute', bottom: '10mm', right: '15mm', fontSize: '12px', fontFamily: 'serif', color: '#9ca3af' }}>
                - {2 + mapCount + photoPages.length + pageIndex} / {totalPages} -
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}