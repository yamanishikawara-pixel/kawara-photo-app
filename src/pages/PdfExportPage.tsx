import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, ShieldCheck } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
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

function isIOSDevice() {
  const ua = window.navigator.userAgent;
  const platform = window.navigator.platform;

  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForImagesInElement(element: HTMLElement) {
  const images = Array.from(element.querySelectorAll('img'));

  await Promise.all(
    images.map(async (img) => {
      if (!img.src) return;

      if (img.complete && img.naturalWidth > 0) {
        if (typeof img.decode === 'function') {
          try {
            await img.decode();
          } catch {}
        }
        return;
      }

      await new Promise<void>((resolve) => {
        let finished = false;

        const done = () => {
          if (finished) return;
          finished = true;
          img.removeEventListener('load', done);
          img.removeEventListener('error', done);
          window.clearTimeout(timer);
          resolve();
        };

        const timer = window.setTimeout(done, 15000);

        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });

      if (typeof img.decode === 'function') {
        try {
          await img.decode();
        } catch {}
      }
    })
  );
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

async function renderElementCanvas(
  element: HTMLElement,
  scale: number,
  backgroundColor: string | null = '#ffffff'
) {
  await waitForImagesInElement(element);

  return await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: false,
    backgroundColor,
    logging: false,
    imageTimeout: 15000,
    removeContainer: true,
  });
}

function ProfessionalLoader() {
  return (
    <div className="relative flex flex-col items-center justify-center p-8 mb-4">
      <div className="relative flex items-center justify-center w-28 h-28">
        <div className="absolute inset-0 border-4 border-gray-800 border-t-red-600 rounded-full animate-spin shadow-[0_0_20px_rgba(220,38,38,0.3)]"></div>
        <div className="absolute inset-2 border-4 border-gray-800 border-b-red-800 rounded-full animate-[spin_2s_linear_infinite_reverse]"></div>
        <ShieldCheck className="w-10 h-10 text-red-500 animate-pulse" />
      </div>
    </div>
  );
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

export default function PdfExportPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectWithOptionals | null>(null);
  const [userSettings, setUserSettings] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'pdf' | 'zip' | null>(null);
  const [scale, setScale] = useState(1);
  const [sessionId] = useState(() => Date.now().toString());

  useEffect(() => {
    if (!id) return;

    setError(null);

    const fetchData = async () => {
      try {
        const d = await getDoc(doc(db, 'projects', id));
        if (d.exists()) {
          setProject(d.data() as ProjectWithOptionals);
        }

        const user = auth.currentUser;
        if (user) {
          const s = await getDoc(doc(db, 'users', user.uid));
          if (s.exists()) {
            setUserSettings(s.data());
          }
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
      setLoadingMode('zip');
      setIsZipping(true);
      setError(null);

      await sleep(100);

      const zip = new JSZip();
      const folderName = project.projectName || '現場写真';
      const imgFolder = zip.folder(folderName);

      if (!imgFolder) throw new Error('フォルダ作成失敗');

      const activePhotos = (project.photos ?? []).filter((p) => p.image);
      if (activePhotos.length === 0) {
        setError('ダウンロードする写真がありません。');
        setIsZipping(false);
        setLoadingMode(null);
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
        } catch {}
      });

      await Promise.all(promises);

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${folderName}.zip`);
    } catch {
      setError('Zipファイルの作成に失敗しました。');
    } finally {
      setIsZipping(false);
      setLoadingMode(null);
    }
  };

  const handleExport = async () => {
    if (!project) return;

    try {
      const pages = Array.from(document.querySelectorAll<HTMLElement>('.pdf-page'));
      if (pages.length === 0) return;

      setLoadingMode('pdf');
      setIsExporting(true);
      setError(null);

      window.scrollTo({ top: 0, behavior: 'auto' });

      const isIOS = isIOSDevice();

      // ページ全体は軽め
      const baseScale = isIOS ? 1 : 1.6;

      // 写真部分だけ高解像度で上から重ねる
      const hiresScale = isIOS ? 2.5 : 3;

      await sleep(isIOS ? 300 : 500);

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i];

        if (i > 0) {
          pdf.addPage();
        }

        pageEl.scrollIntoView({ behavior: 'auto', block: 'center' });
        await waitForImagesInElement(pageEl);
        await sleep(isIOS ? 150 : 250);

        const currentTransform = pageEl.style.transform;
        pageEl.style.transform = 'none';

        try {
          // 1) まずページ全体を描画
          const baseCanvas = await renderElementCanvas(pageEl, baseScale, '#ffffff');
          const baseDataUrl = baseCanvas.toDataURL(
            'image/jpeg',
            isIOS ? 0.93 : 0.97
          );

          pdf.addImage(
            baseDataUrl,
            'JPEG',
            0,
            0,
            pdfWidth,
            pdfHeight,
            undefined,
            'SLOW'
          );

          releaseCanvas(baseCanvas);

          if (isIOS) {
            await sleep(40);
          }

          // 2) 写真部分だけ高解像度で重ねる
          const hiresBlocks = Array.from(
            pageEl.querySelectorAll<HTMLElement>(
              '[data-pdf-hires="true"][data-pdf-has-image="true"]'
            )
          );

          if (hiresBlocks.length > 0) {
            const pageRect = pageEl.getBoundingClientRect();

            for (const block of hiresBlocks) {
              await waitForImagesInElement(block);
              await sleep(isIOS ? 60 : 0);

              const blockRect = block.getBoundingClientRect();
              if (blockRect.width < 4 || blockRect.height < 4) continue;

              const blockCanvas = await renderElementCanvas(
                block,
                hiresScale,
                '#ffffff'
              );
              const blockDataUrl = blockCanvas.toDataURL('image/png');

              const x = ((blockRect.left - pageRect.left) / pageRect.width) * pdfWidth;
              const y = ((blockRect.top - pageRect.top) / pageRect.height) * pdfHeight;
              const w = (blockRect.width / pageRect.width) * pdfWidth;
              const h = (blockRect.height / pageRect.height) * pdfHeight;

              pdf.addImage(blockDataUrl, 'PNG', x, y, w, h);

              releaseCanvas(blockCanvas);

              if (isIOS) {
                await sleep(30);
              }
            }
          }
        } finally {
          pageEl.style.transform = currentTransform;
        }
      }

      pdf.save(`${project.projectName || '写真台帳'}.pdf`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'PDFの作成に失敗しました。';
      setError(message);
    } finally {
      setIsExporting(false);
      setLoadingMode(null);
    }
  };

  if (!project) return <LoadingSpinner />;

  const mapUrlsToRender = project.mapUrls?.length ? project.mapUrls.slice(0, 3) : [''];
  const mapCount = mapUrlsToRender.length;

  const activePhotos = (project.photos ?? []).filter(
    (p) => p.image || p.process || p.description
  );

  const photoPages: (Photo & { circles?: Circle[] })[][] = [];
  for (let i = 0; i < Math.max(activePhotos.length, 3); i += 3) {
    const chunk = activePhotos.slice(i, i + 3);
    while (chunk.length < 3) {
      chunk.push(createEmptyPhoto());
    }
    photoPages.push(chunk);
  }

  const activeMaterials = (project.materials ?? []).filter(
    (m) => m.image || m.name || m.manufacturer || m.specification || m.remarks
  );

  const materialPages: Material[][] = [];
  if (activeMaterials.length > 0) {
    for (let i = 0; i < Math.max(activeMaterials.length, 3); i += 3) {
      const chunk = activeMaterials.slice(i, i + 3);
      while (chunk.length < 3) {
        chunk.push(createEmptyMaterial());
      }
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
      {loadingMode && (
        <div className="fixed inset-0 z-50 bg-gray-950/98 flex flex-col items-center justify-center text-white p-6 backdrop-blur-lg transition-all duration-300">
          <div className="mb-4">
            <ProfessionalLoader />
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-[0.2em] mb-4 animate-pulse">
            見えない仕事に、見える安心。
          </h2>

          <p className="text-gray-400 font-medium text-lg text-center leading-relaxed">
            {loadingMode === 'pdf'
              ? '超高画質なPDF写真台帳を生成しています。'
              : '全写真を1つのZipファイルにまとめています。'}
            <br />
            少々お待ちください。
          </p>

          <div className="w-full max-w-sm mt-12 bg-gray-800 h-1.5 rounded-full overflow-hidden shadow-inner">
            <div className="bg-red-600 h-full w-[60%] animate-[pulse_1.5s_infinite] rounded-full"></div>
          </div>
        </div>
      )}

      <div className="w-full max-w-2xl mb-6 flex justify-between items-center flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigate(`/project/${id}`)}
          className="text-blue-500 font-bold flex items-center gap-2 text-lg"
        >
          <ArrowLeft className="w-6 h-6" />
          もどる
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
            PDF出力
          </button>
        </div>
      </div>

      {error && (
        <div className="w-full max-w-2xl mb-4">
          <ErrorMessage message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      <div className="flex flex-col gap-8 items-center w-full">
        {/* ① 表紙 */}
        <div style={wrapperStyle} className="relative bg-white shadow-md shrink-0">
          <div
            className="pdf-page absolute top-0 left-0 flex flex-col items-center origin-top-left"
            style={{ ...pageStyle, backgroundColor: '#ffffff', color: '#000000' }}
          >
            <div className="mt-[5mm] mb-[30mm] flex flex-col items-center w-full">
              <div className="shrink-0 flex justify-center mb-6">
                {userSettings?.logoUrl ? (
                  <img
                    src={proxyUrl(userSettings.logoUrl, `logo_${sessionId}`)}
                    alt="自社ロゴ"
                    className="block w-[40mm] h-auto object-contain"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <img
                    src={kawaraLogo}
                    alt="標準ロゴ"
                    className="block w-[32mm] h-auto object-contain grayscale"
                    crossOrigin="anonymous"
                  />
                )}
              </div>

              <div className="flex flex-col items-center">
                <h1 className="text-[52px] font-black tracking-[0.4em] mb-4 text-center">
                  工事写真報告書
                </h1>
                <div style={{ width: '160mm', borderBottom: '4px solid #000000' }}></div>
                <div
                  style={{
                    width: '160mm',
                    borderBottom: '1px solid #000000',
                    marginTop: '6px',
                  }}
                ></div>
              </div>
            </div>

            <div className="w-[150mm] space-y-[14mm]">
              {COVER_FIELDS.map((item, idx) => {
                let value = String(project[item.key] ?? '　');
                if (item.key === 'contractorName' && userSettings?.companyName) {
                  value = userSettings.companyName;
                }

                return (
                  <div
                    key={idx}
                    className="flex items-baseline pb-2"
                    style={{ borderBottom: '2px solid #000000' }}
                  >
                    <div className="w-[45mm] flex-shrink-0 flex justify-between text-[24px] font-bold pr-8">
                      {item.label.split('').map((c: string, i: number) => (
                        <span key={i}>{c}</span>
                      ))}
                    </div>
                    <div className="flex-1 text-[32px] font-black whitespace-nowrap overflow-hidden">
                      {value}
                    </div>
                  </div>
                );
              })}
            </div>

            {userSettings && (userSettings.address || userSettings.phone) && (
              <div
                className="absolute bottom-[16mm] right-[15mm] text-right flex flex-col items-end pl-4 py-1"
                style={{ backgroundColor: '#ffffff' }}
              >
                {userSettings.companyName && (
                  <div
                    className="text-[18px] font-bold mb-1"
                    style={{ color: '#000000' }}
                  >
                    {userSettings.companyName}
                  </div>
                )}
                {userSettings.address && (
                  <div className="text-[14px]" style={{ color: '#1f2937' }}>
                    {userSettings.address}
                  </div>
                )}
                {userSettings.phone && (
                  <div className="text-[14px]" style={{ color: '#1f2937' }}>
                    TEL: {userSettings.phone}
                  </div>
                )}
              </div>
            )}

            <div
              className="absolute bottom-[10mm] right-[15mm] text-[16px] font-bold"
              style={{ color: '#000000' }}
            >
              - 1 / {totalPages} -
            </div>
          </div>
        </div>

        {/* ② 位置図 */}
        {mapUrlsToRender.map((u, mapIndex) => (
          <div
            key={`map-page-${mapIndex}`}
            style={wrapperStyle}
            className="relative bg-white shadow-md shrink-0"
          >
            <div
              className="pdf-page absolute top-0 left-0 flex flex-col origin-top-left"
              style={{ ...pageStyle, backgroundColor: '#ffffff', color: '#000000' }}
            >
              <div className="w-full h-full p-6 flex flex-col" style={{ border: '3px solid #1f2937' }}>
                <h2
                  className="text-2xl font-bold mb-4 pb-2"
                  style={{ borderBottom: '2px solid #1f2937' }}
                >
                  位置図 {mapCount > 1 ? `(${mapIndex + 1}/${mapCount})` : ''}
                </h2>

                <div
                  className="p-2 flex-1 flex items-center justify-center overflow-hidden min-h-0"
                  style={{ border: '1px solid #9ca3af', backgroundColor: '#f9fafb' }}
                >
                  {u ? (
                    <div className="flex items-center justify-center w-full h-full">
                      <div className="relative inline-block">
                        <img
                          src={proxyUrl(u, `map_${mapIndex}_${sessionId}`)}
                          crossOrigin="anonymous"
                          className="block w-auto h-auto max-w-full max-h-[150mm]"
                          alt=""
                        />

                        {(project.mapPins ?? [])
                          .filter((p) => p.mapIndex === mapIndex)
                          .map((pin) => (
                            <div
                              key={pin.id}
                              style={{
                                left: `${pin.x}%`,
                                top: `${pin.y}%`,
                                transform: `translate(-50%, -50%) scale(${pin.size || 1})`,
                              }}
                              className="absolute z-10"
                            >
                              {pin.type === 'arrow' ? (
                                <div
                                  className="flex items-center gap-1 px-1 rounded"
                                  style={{
                                    backgroundColor: 'rgba(255,255,255,0.7)',
                                    border: '1px solid #fecaca',
                                  }}
                                >
                                  <span
                                    className="font-black text-[24px]"
                                    style={{
                                      color: '#dc2626',
                                      transform: `rotate(${pin.rotation ?? 0}deg)`,
                                    }}
                                  >
                                    ➡
                                  </span>
                                  <span
                                    className="font-bold text-[20px]"
                                    style={{ color: '#dc2626' }}
                                  >
                                    {pin.label}
                                  </span>
                                </div>
                              ) : (
                                <div className="relative flex items-center justify-center">
                                  <div
                                    className="w-[14mm] h-[14mm] rounded-full"
                                    style={{
                                      border: '4px solid #dc2626',
                                      backgroundColor: 'rgba(220,38,38,0.1)',
                                    }}
                                  />
                                  <span
                                    className="absolute font-bold text-[18px] px-1 rounded"
                                    style={{
                                      color: '#dc2626',
                                      backgroundColor: 'rgba(255,255,255,0.7)',
                                    }}
                                  >
                                    {pin.label}
                                  </span>
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
                                left: `${line.x}%`,
                                top: `${line.y}%`,
                                width: `${line.length}%`,
                                height: `${line.thickness}px`,
                                backgroundColor: line.color,
                                transform: `translate(-50%, -50%) rotate(${line.rotation}deg)`,
                                transformOrigin: 'center center',
                                zIndex: 5,
                              }}
                            />
                          ))}
                      </div>
                    </div>
                  ) : (
                    <span className="font-bold" style={{ color: '#9ca3af' }}>
                      位置図未登録
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  <div className="flex justify-between items-end mb-2">
                    <div className="text-base font-bold">項目欄</div>
                    <PdfLineLegend />
                  </div>

                  <div style={{ border: '2px solid #1f2937' }}>
                    <div
                      className="grid grid-cols-12 text-base font-bold"
                      style={{
                        borderBottom: '2px solid #1f2937',
                        backgroundColor: '#f3f4f6',
                      }}
                    >
                      <div
                        className="col-span-1 p-2 text-center"
                        style={{ borderRight: '2px solid #1f2937' }}
                      >
                        符号
                      </div>
                      <div
                        className="col-span-2 p-2 text-center"
                        style={{ borderRight: '2px solid #1f2937' }}
                      >
                        部位
                      </div>
                      <div
                        className="col-span-2 p-2 text-center text-sm"
                        style={{ borderRight: '2px solid #1f2937' }}
                      >
                        写真NO
                      </div>
                      <div className="col-span-7 p-2 text-center">備考</div>
                    </div>

                    {(() => {
                      const rows: MapRow[] = project.mapRows ?? [];
                      const currentRows = rows.filter(
                        (r) => r.mapIndex === mapIndex || (r.mapIndex === undefined && mapIndex === 0)
                      );

                      const displayRows =
                        currentRows.length > 0
                          ? currentRows.slice(0, 6)
                          : Array.from({ length: 6 }, () => ({
                              symbol: '　',
                              part: '　',
                              photoNo: '　',
                              remarks: '　',
                            }));

                      return displayRows.map((row: any, idx: number) => (
                        <div
                          key={row.id ?? idx}
                          className="grid grid-cols-12 text-base"
                          style={{ borderBottom: '1px solid #9ca3af' }}
                        >
                          <div
                            className="col-span-1 p-2 font-bold whitespace-nowrap overflow-hidden text-center"
                            style={{ borderRight: '1px solid #9ca3af', color: '#b91c1c' }}
                          >
                            {row.symbol ?? '　'}
                          </div>
                          <div
                            className="col-span-2 p-2 whitespace-nowrap overflow-hidden"
                            style={{ borderRight: '1px solid #9ca3af' }}
                          >
                            {row.part ?? '　'}
                          </div>
                          <div
                            className="col-span-2 p-2 whitespace-nowrap overflow-hidden text-center text-sm"
                            style={{ borderRight: '1px solid #9ca3af' }}
                          >
                            {row.photoNo ?? row.relatedPhotoNumber ?? '　'}
                          </div>
                          <div className="col-span-7 p-2 overflow-hidden">
                            {row.remarks ?? '　'}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>

              <div
                className="absolute bottom-[10mm] right-[15mm] text-xs font-serif"
                style={{ color: '#9ca3af' }}
              >
                - {2 + mapIndex} / {totalPages} -
              </div>
            </div>
          </div>
        ))}

        {/* ③ 写真ページ */}
        {photoPages.map((chunk, pageIndex) => (
          <div
            key={`photo-page-${pageIndex}`}
            style={wrapperStyle}
            className="relative bg-white shadow-md shrink-0"
          >
            <div
              className="pdf-page absolute top-0 left-0 flex flex-col origin-top-left"
              style={{ ...pageStyle, backgroundColor: '#ffffff', color: '#000000' }}
            >
              <div className="flex-1 flex flex-col justify-between p-2" style={{ border: '3px solid #1f2937' }}>
                {chunk.map((p, i) => (
                  <div
                    key={i}
                    className="flex gap-2 h-[32%] p-2 rounded"
                    style={{ border: '1px solid #6b7280' }}
                  >
                    <div
                      className="w-[60%] flex items-center justify-center overflow-hidden relative min-h-0"
                      data-pdf-hires="true"
                      data-pdf-has-image={p.image ? 'true' : 'false'}
                      style={{ border: '2px solid #374151', backgroundColor: '#f9fafb' }}
                    >
                      {p.image ? (
                        <div className="flex items-center justify-center w-full h-full">
                          <div
                            className="relative inline-block"
                            style={{
                              transform: `rotate(${(p as Photo).rotation ?? 0}deg)`,
                              transformOrigin: 'center center',
                            }}
                          >
                            <img
                              src={proxyUrl(p.image, `photo_${p.id}_${sessionId}`)}
                              crossOrigin="anonymous"
                              className="block w-auto h-auto max-w-full max-h-[88mm]"
                              alt=""
                            />

                            {(p.circles ?? []).map((circle) => (
                              <div
                                key={circle.id}
                                className="absolute aspect-square rounded-full"
                                style={{
                                  left: `${circle.x}%`,
                                  top: `${circle.y}%`,
                                  width: `${circle.size}%`,
                                  transform: 'translate(-50%, -50%)',
                                  border: '3px solid #dc2626',
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="font-bold" style={{ color: '#9ca3af' }}>
                          写真未登録
                        </span>
                      )}
                    </div>

                    <div
                      className="w-[40%] flex flex-col text-sm"
                      style={{ border: '2px solid #374151', backgroundColor: '#ffffff' }}
                    >
                      <div className="flex" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div
                          className="w-16 p-2 font-bold flex items-center justify-center text-xs"
                          style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}
                        >
                          写真NO
                        </div>
                        <div className="p-2 flex-1 font-bold text-sm flex items-center">
                          {p.photoNumber || '　'}
                        </div>
                      </div>

                      <div className="flex" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div
                          className="w-16 p-2 font-bold flex items-center justify-center"
                          style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}
                        >
                          撮影日
                        </div>
                        <div className="p-2 flex-1 flex items-center font-medium">
                          {p.shootingDate || '　'}
                        </div>
                      </div>

                      <div className="flex" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div
                          className="w-16 p-2 font-bold flex items-center justify-center"
                          style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}
                        >
                          位置図
                        </div>
                        <div className="p-2 flex-1 font-bold flex items-center" style={{ color: '#b91c1c' }}>
                          {p.locationMap || '　'}
                        </div>
                      </div>

                      <div className="flex" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div
                          className="w-16 p-2 font-bold flex items-center justify-center"
                          style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}
                        >
                          工程
                        </div>
                        <div className="p-2 flex-1 flex items-center font-medium">
                          {p.process || '　'}
                        </div>
                      </div>

                      <div className="flex-1 flex min-h-0">
                        <div
                          className="w-16 p-2 font-bold flex items-center justify-center"
                          style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}
                        >
                          説明
                        </div>
                        <div className="p-2 flex-1 whitespace-pre-wrap overflow-hidden font-medium leading-relaxed">
                          {p.description || '　'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="absolute bottom-[10mm] right-[15mm] text-xs font-serif"
                style={{ color: '#9ca3af' }}
              >
                - {2 + mapCount + pageIndex} / {totalPages} -
              </div>
            </div>
          </div>
        ))}

        {/* ④ 使用材料表 */}
        {materialPages.map((chunk, pageIndex) => (
          <div
            key={`material-page-${pageIndex}`}
            style={wrapperStyle}
            className="relative bg-white shadow-md shrink-0"
          >
            <div
              className="pdf-page absolute top-0 left-0 flex flex-col origin-top-left"
              style={{ ...pageStyle, backgroundColor: '#ffffff', color: '#000000' }}
            >
              <div className="w-full flex justify-between items-end mb-2">
                <h2
                  className="text-2xl font-bold pb-1"
                  style={{ borderBottom: '2px solid #1f2937' }}
                >
                  使用材料表
                </h2>
              </div>

              <div className="flex-1 flex flex-col justify-between p-2" style={{ border: '3px solid #1f2937' }}>
                {chunk.map((m, i) => (
                  <div
                    key={i}
                    className="flex gap-2 h-[32%] p-2 rounded"
                    style={{ border: '1px solid #6b7280' }}
                  >
                    <div
                      className="w-[60%] flex items-center justify-center overflow-hidden relative min-h-0"
                      data-pdf-hires="true"
                      data-pdf-has-image={m.image ? 'true' : 'false'}
                      style={{ border: '2px solid #374151', backgroundColor: '#f9fafb' }}
                    >
                      {m.image ? (
                        <div className="flex items-center justify-center w-full h-full">
                          <div
                            className="relative inline-block"
                            style={{
                              transform: `rotate(${m.rotation ?? 0}deg)`,
                              transformOrigin: 'center center',
                            }}
                          >
                            <img
                              src={proxyUrl(m.image, `material_${m.id}_${sessionId}`)}
                              crossOrigin="anonymous"
                              className="block w-auto h-auto max-w-full max-h-[85mm]"
                              alt=""
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="font-bold" style={{ color: '#9ca3af' }}>
                          写真未登録
                        </span>
                      )}
                    </div>

                    <div
                      className="w-[40%] flex flex-col text-sm"
                      style={{ border: '2px solid #374151', backgroundColor: '#ffffff' }}
                    >
                      <div className="flex" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div
                          className="w-24 p-2 font-bold flex items-center justify-center text-center"
                          style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}
                        >
                          品名
                        </div>
                        <div className="p-2 flex-1 font-bold text-base overflow-hidden flex items-center">
                          {m.name || '　'}
                        </div>
                      </div>

                      <div className="flex" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div
                          className="w-24 p-2 font-bold flex items-center justify-center text-center"
                          style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}
                        >
                          メーカー
                        </div>
                        <div className="p-2 flex-1 overflow-hidden font-medium flex items-center">
                          {m.manufacturer || '　'}
                        </div>
                      </div>

                      <div className="flex" style={{ borderBottom: '1px solid #9ca3af' }}>
                        <div
                          className="w-24 p-2 font-bold text-xs flex items-center justify-center text-center leading-tight"
                          style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}
                        >
                          規格・寸法
                          <br />
                          数量
                        </div>
                        <div className="p-2 flex-1 font-bold overflow-hidden flex items-center" style={{ color: '#b91c1c' }}>
                          {m.specification || '　'}
                        </div>
                      </div>

                      <div className="flex-1 flex min-h-0">
                        <div
                          className="w-24 p-2 font-bold flex items-center justify-center text-center"
                          style={{ backgroundColor: '#f3f4f6', borderRight: '1px solid #9ca3af' }}
                        >
                          備考
                        </div>
                        <div className="p-2 flex-1 whitespace-pre-wrap overflow-hidden font-medium leading-relaxed">
                          {m.remarks || '　'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="absolute bottom-[10mm] right-[15mm] text-xs font-serif"
                style={{ color: '#9ca3af' }}
              >
                - {2 + mapCount + photoPages.length + pageIndex} / {totalPages} -
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}