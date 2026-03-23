import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { Circle, MapRow, Photo, Project } from '../types';
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

export default function PdfExportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectWithOptionals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!id) return;
    setError(null);
    getDoc(doc(db, 'projects', id))
      .then((d) => {
        if (d.exists()) setProject(d.data() as ProjectWithOptionals);
      })
      .catch(() => setError('データの読み込みに失敗しました。'));
  }, [id]);

  useEffect(() => {
    const updateScale = () => setScale(getPreviewScale(32));
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const handleExport = async () => {
    if (!project) return;
    try {
      const pages = document.querySelectorAll('.pdf-page');
      if (pages.length === 0) return;
      setIsExporting(true);
      setError(null);
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 500));
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

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

      pdf.save(`${project.projectName || '写真台帳'}.pdf`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'PDFの作成に失敗しました。';
      setError(message);
    } finally {
      setIsExporting(false);
    }
  };

  if (error && !project) {
    return (
      <div className="min-h-screen bg-gray-200 p-6 font-sans flex flex-col items-center justify-center">
        <ErrorMessage message={error} onDismiss={() => setError(null)} />
        <button
          type="button"
          onClick={() => navigate(`/project/${id}`)}
          className="mt-4 text-blue-500 font-bold flex items-center gap-2"
        >
          <ArrowLeft className="w-5 h-5" /> もどる
        </button>
      </div>
    );
  }

  if (!project) return <LoadingSpinner />;

  const mapUrlsToRender = project.mapUrls?.length ? project.mapUrls : [''];
  const mapCount = mapUrlsToRender.length;
  const activePhotos = (project.photos ?? []).filter(
    (p) => p.image || p.process || p.description
  );
  const photoPages: (Photo & { circles?: Circle[] })[][] = [];
  for (let i = 0; i < Math.max(activePhotos.length, 3); i += 3) {
    const chunk = activePhotos.slice(i, i + 3);
    while (chunk.length < 3) chunk.push(createEmptyPhoto());
    photoPages.push(chunk);
  }
  const totalPages = 1 + mapCount + photoPages.length;
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
    <div className="min-h-screen bg-gray-200 p-4 sm:p-6 font-sans flex flex-col items-center pb-12 overflow-x-hidden w-full">
      <div className="w-full max-w-2xl mb-6 flex justify-between items-center flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigate(`/project/${id}`)}
          className="text-blue-500 font-bold flex items-center gap-2 text-lg"
          aria-label="現場メニューにもどる"
        >
          <ArrowLeft className="w-6 h-6" /> もどる
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="bg-orange-500 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-bold shadow-lg text-base sm:text-lg disabled:opacity-60 disabled:cursor-not-allowed"
          aria-busy={isExporting}
        >
          {isExporting ? 'PDF作成中...' : 'ダウンロード'}
        </button>
      </div>

      {error && (
        <div className="w-full max-w-2xl mb-4">
          <ErrorMessage message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      <div className="flex flex-col gap-8 items-center w-full">
        {/* 表紙 */}
        <div style={wrapperStyle} className="relative bg-white shadow-md shrink-0">
          <div
            className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left"
            style={{ ...pageStyle, padding: '20mm' }}
          >
            <div className="w-full h-full border-[2px] border-gray-900 px-[16mm] pt-[14mm] pb-[12mm] flex flex-col relative overflow-hidden">
              {/* ロゴ透かし（背景）: “存在感はあるが邪魔しない” */}
              <div className="absolute inset-0 pointer-events-none">
                <img
                  src={kawaraLogo}
                  alt=""
                  className="absolute left-[6mm] bottom-[-30mm] w-[190mm] h-[190mm] object-contain opacity-[0.035]"
                  style={{ transform: 'rotate(-6deg)' }}
                  crossOrigin="anonymous"
                />
              </div>

              {/* 上段：タイトル / ロゴ（同一行で整列） */}
              <div className="relative flex items-start justify-between">
                <div className="pt-[2mm]">
                  <h1 className="text-[42px] leading-[1.06] font-extrabold tracking-[0.08em] text-gray-950">
                    工事写真報告書
                  </h1>
                  <div className="mt-3">
                    <div className="h-[2px] w-[92mm] bg-gray-900" />
                    <div className="mt-[2mm] h-[1px] w-[58mm] bg-gray-900/60" />
                  </div>
                </div>

                <div className="shrink-0">
                  <img
                    src={kawaraLogo}
                    alt=""
                    className="block w-[22mm] h-[22mm] object-contain"
                    crossOrigin="anonymous"
                  />
                </div>
              </div>

              {/* 本文（項目は変更しない） */}
              <div className="relative mt-[20mm] flex-1 flex items-start justify-center">
                <div className="w-full max-w-[165mm] rounded-[16px] border-[1.5px] border-gray-900 bg-white px-8 py-7">
                  <div className="space-y-5">
                    {COVER_FIELDS.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-6">
                        <div className="w-[34mm] flex-shrink-0">
                          <div className="text-[11px] font-bold tracking-[0.18em] text-gray-700 whitespace-nowrap">
                            {item.label}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 border-b border-gray-300 pb-2">
                          <div className="text-[21px] font-bold text-gray-950 whitespace-nowrap overflow-hidden text-ellipsis">
                            {String(project[item.key] ?? '　')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* さりげないフッターライン（文字なし） */}
              <div className="relative mt-auto pt-[8mm]">
                <div className="h-[1px] w-full bg-gray-900/25" />
              </div>
            </div>
            <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">
              - 1 / {totalPages} -
            </div>
          </div>
        </div>

        {/* 位置図 */}
        {mapUrlsToRender.map((u, mapIndex) => (
          <div
            key={`map-page-${mapIndex}`}
            style={wrapperStyle}
            className="relative bg-white shadow-md shrink-0"
          >
            <div
              className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left"
              style={pageStyle}
            >
              <div className="w-full h-full border-[3px] border-gray-800 p-6 flex flex-col">
                <h2 className="text-2xl font-bold mb-4 border-b-2 border-gray-800 pb-2">
                  位置図{' '}
                  {mapCount > 1 ? `(${mapIndex + 1}/${mapCount})` : ''}
                </h2>
                <div className="border border-gray-400 p-2 bg-gray-50 flex-1 flex items-center justify-center overflow-hidden min-h-0">
                  {u ? (
                    <div className="flex items-center justify-center w-full h-full">
                      <div className="relative inline-block">
                        <img
                          src={proxyUrl(u, mapIndex)}
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
                                transform: 'translate(-50%, -50%)',
                              }}
                              className="absolute z-10"
                            >
                              {pin.type === 'arrow' ? (
                                <div className="flex items-center gap-1 bg-white/70 px-1 rounded border border-red-200">
                                  <span
                                    className="text-red-600 font-black text-[24px]"
                                    style={{
                                      transform: `rotate(${pin.rotation ?? 0}deg)`,
                                    }}
                                  >
                                    ➡
                                  </span>
                                  <span className="text-red-600 font-bold text-[20px]">
                                    {pin.label}
                                  </span>
                                </div>
                              ) : (
                                <div className="relative flex items-center justify-center">
                                  <div className="w-[14mm] h-[14mm] rounded-full border-[4px] border-red-600 bg-red-600/10" />
                                  <span className="absolute text-red-600 font-bold text-[18px] bg-white/70 px-1 rounded">
                                    {pin.label}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400 font-bold">
                      位置図未登録
                    </span>
                  )}
                </div>

                {/* 項目欄（説明表） */}
                <div className="mt-4">
                  <div className="text-base font-bold mb-2">項目欄</div>
                  <div className="border-2 border-gray-800">
                    <div className="grid grid-cols-12 border-b-2 border-gray-800 bg-gray-100 text-sm font-bold">
                      <div className="col-span-1 border-r-2 border-gray-800 p-2">
                        符号
                      </div>
                      <div className="col-span-2 border-r-2 border-gray-800 p-2">
                        部位
                      </div>
                      <div className="col-span-2 border-r-2 border-gray-800 p-2">
                        写真NO
                      </div>
                      <div className="col-span-7 p-2">備考</div>
                    </div>
                    {(() => {
                      const rows: MapRow[] = project.mapRows ?? [];
                      const currentRows = rows.filter(
                        (r) =>
                          r.mapIndex === mapIndex ||
                          (r.mapIndex === undefined && mapIndex === 0),
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
                      return displayRows.map((row, idx: number) => (
                        <div
                          key={row.id ?? idx}
                          className="grid grid-cols-12 border-b border-gray-400 text-sm"
                        >
                          <div className="col-span-1 border-r border-gray-400 p-2 font-bold text-red-700 whitespace-nowrap overflow-hidden">
                            {row.symbol ?? '　'}
                          </div>
                          <div className="col-span-2 border-r border-gray-400 p-2 whitespace-nowrap overflow-hidden">
                            {row.part ?? '　'}
                          </div>
                          <div className="col-span-2 border-r border-gray-400 p-2 whitespace-nowrap overflow-hidden">
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
              <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">
                - {2 + mapIndex} / {totalPages} -
              </div>
            </div>
          </div>
        ))}

        {/* 写真 */}
        {photoPages.map((chunk, pageIndex) => (
          <div
            key={pageIndex}
            style={wrapperStyle}
            className="relative bg-white shadow-md shrink-0"
          >
            <div
              className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left"
              style={pageStyle}
            >
              <div className="flex-1 flex flex-col justify-between border-[3px] border-gray-800 p-2">
                {chunk.map((p, i) => (
                  <div
                    key={i}
                    className="flex gap-2 h-[32%] border border-gray-500 p-2 rounded"
                  >
                    {/* 写真（拡大） */}
                    <div className="w-[60%] border-2 border-gray-700 flex items-center justify-center bg-gray-50 overflow-hidden relative min-h-0">
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
                              src={proxyUrl(p.image, p.id)}
                              crossOrigin="anonymous"
                              className="block w-auto h-auto max-w-full max-h-[88mm]"
                              alt=""
                            />
                            {(p.circles ?? []).map((circle) => (
                              <div
                                key={circle.id}
                                style={{
                                  left: `${circle.x}%`,
                                  top: `${circle.y}%`,
                                  width: `${circle.size}%`,
                                  transform: 'translate(-50%, -50%)',
                                }}
                                className="absolute aspect-square rounded-full border-[3px] border-red-600"
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 font-bold">
                          写真未登録
                        </span>
                      )}
                    </div>

                    {/* 説明欄（少し縮小） */}
                    <div className="w-[40%] flex flex-col text-xs border-2 border-gray-700 bg-white">
                      <div className="flex border-b border-gray-400">
                        <div className="w-16 bg-gray-100 p-1.5 border-r border-gray-400 font-bold">
                          写真NO
                        </div>
                        <div className="p-1.5 flex-1 font-bold text-sm">
                          {p.photoNumber || '　'}
                        </div>
                      </div>
                      <div className="flex border-b border-gray-400">
                        <div className="w-16 bg-gray-100 p-1.5 border-r border-gray-400 font-bold">
                          撮影日
                        </div>
                        <div className="p-1.5 flex-1">
                          {p.shootingDate || '　'}
                        </div>
                      </div>
                      <div className="flex border-b border-gray-400">
                        <div className="w-16 bg-gray-100 p-1.5 border-r border-gray-400 font-bold">
                          位置図
                        </div>
                        <div className="p-1.5 flex-1 font-bold text-red-700">
                          {p.locationMap || '　'}
                        </div>
                      </div>
                      <div className="flex border-b border-gray-400">
                        <div className="w-16 bg-gray-100 p-1.5 border-r border-gray-400 font-bold">
                          工程
                        </div>
                        <div className="p-1.5 flex-1">{p.process || '　'}</div>
                      </div>
                      <div className="flex-1 flex min-h-0">
                        <div className="w-16 bg-gray-100 p-1.5 border-r border-gray-400 font-bold">
                          説明
                        </div>
                        <div className="p-1.5 flex-1 whitespace-pre-wrap overflow-hidden">
                          {p.description || '　'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">
                - {2 + mapCount + pageIndex} / {totalPages} -
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
