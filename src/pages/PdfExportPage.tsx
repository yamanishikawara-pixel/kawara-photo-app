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

// ★ルートA（Google裏サーバー）のURL
const PDF_GENERATE_URL = 'https://generatepdf-ld4b4dsi5q-an.a.run.app';

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
    <div
      className="flex gap-x-4 gap-y-1 flex-wrap text-xs font-medium rounded-lg p-2 shadow-sm"
      style={{ border: '1px solid #d1d5db', backgroundColor: '#ffffff' }}
    >
      {LINE_TYPES.map((type) => (
        <div key={type.label} className="flex items-center gap-1.5">
          <div
            style={{
              backgroundColor: type.color,
              width: '1.5rem',
              height: '2px',
              borderRadius: '9999px',
            }}
          />
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
      const styles = Array.from(
        document.querySelectorAll('style, link[rel="stylesheet"]'),
      )
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
              }
            </style>
          </head>
          <body>
            ${clone.innerHTML}
          </body>
          </html>`;
    };

    try {
      const htmlPayload = buildServerHtmlPayload();
      const body = JSON.stringify({ html: htmlPayload });
      let serverOk = false;

      // ★ルートA（サーバー生成）のみを全力で実行！予備システム（ルートB）への逃げ道を遮断！
      for (const url of pdfEndpointCandidates()) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          });
          if (!response.ok) {
            throw new Error(`サーバーエラー: ${response.status}`);
          }
          const blob = await responseToPdfBlob(response);
          if (blob.size === 0) throw new Error('PDFデータが空です');
          downloadPdfBlob(blob, pdfName);
          serverOk = true;
          break;
        } catch (e) {
          console.warn('ルートA生成エラー:', e);
        }
      }

      if (!serverOk) {
        throw new Error('Google専用サーバーでのPDF生成に失敗しました。高画質写真が多すぎる可能性があります。');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'PDF作成中にエラーが発生しました。');
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
  };
  const pageStyle = {
    width: `${A4_WIDTH_PX}px`,
    height: `${A4_HEIGHT_PX}px`,
    padding: '15mm',
    transform: `scale(${scale})`,
  };

  return (
    <div className="min-h-screen bg-gray-200 p-4 sm:p-6 font-sans flex flex-col items-center pb-12 overflow-x-hidden w-full relative">
      
      {/* 画面上部のボタン群 */}
      <div className="w-full max-w-2xl mb-6 flex justify-between items-center flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigate(`/project/${id}`)}
          className="text-blue-500 font-bold flex items-center gap-2 text-lg"
        >
          <ArrowLeft className="w-6 h-6" /> もどる
        </button>
        <div className="flex gap-2 sm:gap-4">
          <button
            type="button"
            onClick={handleZipExport}
            disabled={isExporting || isZipping}
            className="flex items-center gap-2 bg-green-600 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-xl font-bold shadow-lg text-sm sm:text-base hover:bg-green-700 disabled:opacity-50"
          >
            <Download className="w-5 h-5" />
            写真のみ(Zip)
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || isZipping}
            className="flex items-center gap-2 bg-black text-white px-5 sm:px-8 py-3 sm:py-4 rounded-xl font-bold shadow-lg text-base sm:text-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {isExporting ? 'PDF出力中...' : 'PDF出力'}
          </button>
        </div>
      </div>

      {error && (
        <div className="w-full max-w-2xl mb-4">
          <ErrorMessage message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* PDFとして出力される全体枠 */}
      <div className="pdf-container-wrapper flex flex-col gap-8 items-center w-full">
        
        {/* =========================================
            ① 表紙ページ
        ========================================= */}
        <div style={wrapperStyle} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
          <div
            className="pdf-page absolute top-0 left-0 flex flex-col items-center origin-top-left"
            style={{ ...pageStyle, backgroundColor: '#ffffff', color: '#000000' }}
          >
            <div className="mt-[5mm] mb-[28mm] flex flex-col items-center w-full">
              <div className="shrink-0 flex justify-center mb-6">
                {logoUrl ? (
                  <img src={proxyUrl(logoUrl, `logo_${sessionId}`)} alt="自社ロゴ" className="block w-[40mm] h-auto object-contain" crossOrigin="anonymous" />
                ) : (
                  <img src={kawaraLogo} alt="標準ロゴ" className="block w-[32mm] h-auto object-contain grayscale" crossOrigin="anonymous" />
                )}
              </div>
              <div className="flex flex-col items-center">
                <h1 className="text-[48px] font-black tracking-[0.3em] mb-4 text-center">工事写真報告書</h1>
                <div style={{ width: '160mm', borderBottom: '4px solid #000000' }} />
                <div style={{ width: '160mm', borderBottom: '1px solid #000000', marginTop: '6px' }} />
              </div>
            </div>

            <div className="w-[150mm] flex flex-col gap-y-[12mm]">
              {COVER_FIELDS.map((item, idx) => {
                let value = String(project[item.key] ?? '　');
                if (item.key === 'contractorName' && companyName) value = companyName;
                return (
                  <div key={idx} className="flex items-end pb-2" style={{ borderBottom: '2px solid #000000' }}>
                    <div className="w-[45mm] flex-shrink-0 flex justify-between text-[22px] font-bold pr-8 leading-none">
                      {item.label.split('').map((c: string, i: number) => (
                        <span key={i} className="block leading-none">{c}</span>
                      ))}
                    </div>
                    <div className="flex-1 text-[26px] font-black whitespace-nowrap overflow-hidden pl-4 leading-none pb-[2px]">{value}</div>
                  </div>
                );
              })}
            </div>

            {userSettings && (address || phone) && (
              <div className="absolute bottom-[16mm] right-[15mm] text-right flex flex-col items-end pl-4 py-1" style={{ backgroundColor: '#ffffff' }}>
                {companyName && <div className="text-[18px] font-bold mb-1" style={{ color: '#000000' }}>{companyName}</div>}
                {address && <div className="text-[14px]" style={{ color: '#1f2937' }}>{address}</div>}
                {phone && <div className="text-[14px]" style={{ color: '#1f2937' }}>TEL: {phone}</div>}
              </div>
            )}
            <div className="absolute bottom-[10mm] right-[15mm] text-[16px] font-bold" style={{ color: '#000000' }}>
              - 1 / {totalPages} -
            </div>
          </div>
        </div>

        {/* =========================================
            ② 位置図ページ
        ========================================= */}
        {mapUrlsToRender.map((u, mapIndex) => (
          <div key={`map-page-${mapIndex}`} style={wrapperStyle} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div
              className="pdf-page absolute top-0 left-0 flex flex-col origin-top-left"
              style={{ ...pageStyle, backgroundColor: '#ffffff', color: '#000000' }}
            >
              <div className="w-full h-full p-6 flex flex-col" style={{ border: '3px solid #1f2937' }}>
                <h2 className="text-2xl font-bold mb-4 pb-2" style={{ borderBottom: '2px solid #1f2937' }}>
                  位置図 {mapCount > 1 ? `(${mapIndex + 1}/${mapCount})` : ''}
                </h2>
                <div className="p-2 flex-1 flex items-center justify-center overflow-hidden min-h-0" style={{ border: '1px solid #9ca3af', backgroundColor: '#f9fafb' }}>
                  {u ? (
                    <div className="flex items-center justify-center w-full h-full">
                      <div className="relative inline-block">
                        <img src={proxyUrl(u, `map_${mapIndex}_${sessionId}`)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-[150mm]" alt="" />
                        
                        {(project.mapPins ?? []).filter((p) => p.mapIndex === mapIndex).map((pin) => (
                            <div key={pin.id} style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: `translate(-50%, -50%) scale(${pin.size ?? 1})`, zIndex: 10 }} className="absolute">
                              {pin.type === 'arrow' ? (
                                <div className="flex items-center gap-1 px-1 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.7)', border: '1px solid #fecaca' }}>
                                  <span className="font-black text-[24px]" style={{ color: '#dc2626', transform: `rotate(${pin.rotation ?? 0}deg)` }}>➡</span>
                                  <span className="font-bold text-[20px]" style={{ color: '#dc2626' }}>{pin.label}</span>
                                </div>
                              ) : (
                                <div className="relative flex items-center justify-center">
                                  <div className="w-[14mm] h-[14mm] rounded-full" style={{ border: '4px solid #dc2626', backgroundColor: 'rgba(220,38,38,0.1)' }} />
                                  <span className="absolute font-bold text-[18px] px-1 rounded" style={{ color: '#dc2626', backgroundColor: 'rgba(255,255,255,0.7)' }}>{pin.label}</span>
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
                    <span className="font-bold" style={{ color: '#9ca3af' }}>位置図未登録</span>
                  )}
                </div>
                
                <div className="mt-4">
                  <div className="flex justify-between items-end mb-2">
                    <div className="text-base font-bold">項目欄</div>
                    <PdfLineLegend />
                  </div>
                  <div style={{ border: '2px solid #1f2937' }}>
                    <div className="grid grid-cols-12 text-base font-bold" style={{ borderBottom: '2px solid #1f2937', backgroundColor: '#f3f4f6' }}>
                      <div className="col-span-1 py-2 text-center flex justify-center items-center" style={{ borderRight: '2px solid #1f2937' }}>符号</div>
                      <div className="col-span-2 py-2 text-center flex justify-center items-center" style={{ borderRight: '2px solid #1f2937' }}>部位</div>
                      <div className="col-span-2 py-2 text-center text-sm flex justify-center items-center" style={{ borderRight: '2px solid #1f2937' }}>写真NO</div>
                      <div className="col-span-7 py-2 text-center flex justify-center items-center">備考</div>
                    </div>
                    {(() => {
                      const rows: MapRow[] = project.mapRows ?? [];
                      const currentRows = rows.filter((r) => r.mapIndex === mapIndex || (r.mapIndex === undefined && mapIndex === 0));
                      const displayRows: MapRow[] = currentRows.length > 0 ? currentRows.slice(0, 6) : Array.from({ length: 6 }, (_, i) => ({ id: -(i + 1), symbol: '　', part: '　', photoNo: '　', remarks: '　' }));
                      return displayRows.map((row) => (
                        <div key={row.id} className="grid grid-cols-12 text-base" style={{ borderBottom: '1px solid #9ca3af' }}>
                          <div className="col-span-1 py-2 font-bold text-center flex justify-center items-center" style={{ borderRight: '1px solid #9ca3af', color: '#b91c1c' }}>{row.symbol ?? '　'}</div>
                          <div className="col-span-2 px-2 py-2 flex items-center overflow-hidden" style={{ borderRight: '1px solid #9ca3af' }}>{row.part ?? '　'}</div>
                          <div className="col-span-2 py-2 text-center text-sm flex justify-center items-center overflow-hidden" style={{ borderRight: '1px solid #9ca3af' }}>{row.photoNo ?? row.relatedPhotoNumber ?? '　'}</div>
                          <div className="col-span-7 px-2 py-2 flex items-center overflow-hidden">{row.remarks ?? '　'}</div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
              <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif" style={{ color: '#9ca3af' }}>
                - {2 + mapIndex} / {totalPages} -
              </div>
            </div>
          </div>
        ))}

        {/* =========================================
            ③ 写真ページ
        ========================================= */}
        {photoPages.map((chunk, pageIndex) => (
          <div key={`photo-page-${pageIndex}`} style={wrapperStyle} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div
              className="pdf-page absolute top-0 left-0 flex flex-col origin-top-left"
              style={{ ...pageStyle, backgroundColor: '#ffffff', color: '#000000' }}
            >
              <div className="flex-1 flex flex-col justify-between p-2" style={{ border: '3px solid #1f2937' }}>
                {chunk.map((p, i) => (
                  <div key={i} className="flex gap-2 h-[32%] p-2 rounded" style={{ border: '1px solid #6b7280' }}>
                    
                    {/* ★ 元の完璧な黄金比（w-[60%]） */}
                    <div className="w-[60%] flex items-center justify-center overflow-hidden relative min-h-0" style={{ border: '2px solid #374151', backgroundColor: '#f9fafb' }}>
                      {p.image ? (
                        <div className="flex items-center justify-center w-full h-full">
                          <div className="relative inline-block" style={{ transform: `rotate(${(p as Photo).rotation ?? 0}deg)`, transformOrigin: 'center center' }}>
                            <img src={proxyUrl(p.image, `photo_${p.id}_${sessionId}`)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-[88mm]" alt="" />
                            {(p.circles ?? []).map((circle) => (
                              <div key={circle.id} className="absolute aspect-square rounded-full" style={{ left: `${circle.x}%`, top: `${circle.y}%`, width: `${circle.size}%`, transform: 'translate(-50%, -50%)', border: '3px solid #dc2626' }} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="font-bold" style={{ color: '#9ca3af' }}>写真未登録</span>
                      )}
                    </div>

                    {/* ★ 元の完璧な黄金比（w-[40%]） */}
                    <div className="w-[40%] flex flex-col text-sm" style={{ border: '2px solid #374151', backgroundColor: '#ffffff' }}>
                      <div className="flex min-h-[36px]" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div className="w-20 font-bold flex items-center justify-center text-center text-xs" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>写真NO</div>
                        <div className="px-3 flex-1 font-bold text-sm flex items-center">{p.photoNumber || '　'}</div>
                      </div>
                      <div className="flex min-h-[36px]" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div className="w-20 font-bold flex items-center justify-center" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>撮影日</div>
                        <div className="px-3 flex-1 flex items-center font-medium">{p.shootingDate || '　'}</div>
                      </div>
                      <div className="flex min-h-[36px]" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div className="w-20 font-bold flex items-center justify-center" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>位置図</div>
                        <div className="px-3 flex-1 font-bold flex items-center" style={{ color: '#b91c1c' }}>{p.locationMap || '　'}</div>
                      </div>
                      <div className="flex min-h-[36px]" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div className="w-20 font-bold flex items-center justify-center" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>工程</div>
                        <div className="px-3 flex-1 flex items-center font-medium">{p.process || '　'}</div>
                      </div>
                      <div className="flex-1 flex min-h-0">
                        <div className="w-20 py-2 font-bold flex items-center justify-center" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>説明</div>
                        <div className="p-3 flex-1 whitespace-pre-wrap overflow-hidden font-medium leading-relaxed flex items-start">{p.description || '　'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif" style={{ color: '#9ca3af' }}>
                - {2 + mapCount + pageIndex} / {totalPages} -
              </div>
            </div>
          </div>
        ))}

        {/* =========================================
            ④ 使用材料表
        ========================================= */}
        {materialPages.map((chunk, pageIndex) => (
          <div key={`material-page-${pageIndex}`} style={wrapperStyle} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div
              className="pdf-page absolute top-0 left-0 flex flex-col origin-top-left"
              style={{ ...pageStyle, backgroundColor: '#ffffff', color: '#000000' }}
            >
              <div className="w-full flex justify-between items-end mb-2">
                <h2 className="text-2xl font-bold pb-1" style={{ borderBottom: '2px solid #1f2937' }}>使用材料表</h2>
              </div>
              <div className="flex-1 flex flex-col justify-between p-2" style={{ border: '3px solid #1f2937' }}>
                {chunk.map((m, i) => (
                  <div key={i} className="flex gap-2 h-[32%] p-2 rounded" style={{ border: '1px solid #6b7280' }}>
                    
                    <div className="w-[60%] flex items-center justify-center overflow-hidden relative min-h-0" style={{ border: '2px solid #374151', backgroundColor: '#f9fafb' }}>
                      {m.image ? (
                        <div className="flex items-center justify-center w-full h-full">
                          <div className="relative inline-block" style={{ transform: `rotate(${m.rotation ?? 0}deg)`, transformOrigin: 'center center' }}>
                            <img src={proxyUrl(m.image, `material_${m.id}_${sessionId}`)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-[85mm]" alt="" />
                          </div>
                        </div>
                      ) : (
                        <span className="font-bold" style={{ color: '#9ca3af' }}>写真未登録</span>
                      )}
                    </div>

                    <div className="w-[40%] flex flex-col text-sm" style={{ border: '2px solid #374151', backgroundColor: '#ffffff' }}>
                      <div className="flex min-h-[36px]" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div className="w-24 font-bold flex items-center justify-center text-center" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>品名</div>
                        <div className="px-3 flex-1 font-bold text-base overflow-hidden flex items-center">{m.name || '　'}</div>
                      </div>
                      <div className="flex min-h-[36px]" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div className="w-24 font-bold flex items-center justify-center text-center" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>メーカー</div>
                        <div className="px-3 flex-1 overflow-hidden font-medium flex items-center">{m.manufacturer || '　'}</div>
                      </div>
                      <div className="flex min-h-[48px]" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div className="w-24 font-bold text-xs flex items-center justify-center text-center leading-tight py-1" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>規格・寸法<br />数量</div>
                        <div className="px-3 flex-1 font-bold overflow-hidden flex items-center" style={{ color: '#b91c1c' }}>{m.specification || '　'}</div>
                      </div>
                      <div className="flex-1 flex min-h-0">
                        <div className="w-24 py-2 font-bold flex items-center justify-center text-center" style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}>備考</div>
                        <div className="p-3 flex-1 whitespace-pre-wrap overflow-hidden font-medium leading-relaxed flex items-start">{m.remarks || '　'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif" style={{ color: '#9ca3af' }}>
                - {2 + mapCount + photoPages.length + pageIndex} / {totalPages} -
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}