import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { Circle, MapPin, Photo, Project } from '../types';
import { A4_HEIGHT_PX, A4_WIDTH_PX, getPreviewScale, proxyUrl } from '../shared/utils';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';

interface ProjectWithOptionals extends Project {
  photos?: Photo[];
  mapPins?: MapPin[];
  mapUrls?: string[];
}

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

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement;
        pageEl.scrollIntoView({ behavior: 'instant', block: 'center' });
        await new Promise((r) => setTimeout(r, 600));

        const currentTransform = pageEl.style.transform;
        pageEl.style.transform = 'scale(1)';

        await toJpeg(pageEl, { cacheBust: true });
        const dataUrl = await toJpeg(pageEl, {
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
      const message = err instanceof Error ? err.message : 'PDFの作成に失敗しました。';
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
  const wrapperStyle = { width: `${A4_WIDTH_PX * scale}px`, height: `${A4_HEIGHT_PX * scale}px` };
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
            <div className="w-full h-full border-[3px] border-gray-800 p-12 flex flex-col relative">
              <div className="mt-[30mm] mb-[40mm] text-center">
                <h1 className="text-4xl font-serif tracking-[0.5em] font-bold mb-4">工事写真報告書</h1>
                <div className="w-[110mm] mx-auto border-b-[2px] border-gray-800" />
                <div className="w-[110mm] mx-auto border-b-[1px] border-gray-800 mt-1" />
              </div>
              <div className="flex-1 px-4 space-y-14">
                {COVER_FIELDS.map((item, idx) => (
                  <div key={idx} className="flex items-baseline border-b-2 border-gray-800 pb-1">
                    <div className="w-[50mm] flex-shrink-0 flex justify-between text-[20px] font-bold pr-16">
                      {item.label.split('').map((c, i) => (
                        <span key={i}>{c}</span>
                      ))}
                    </div>
                    <div className="flex-1 text-[20px] font-medium whitespace-nowrap overflow-hidden">
                      {String(project[item.key] ?? '　')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">
              - 1 / {totalPages} -
            </div>
          </div>
        </div>

        {/* 位置図 */}
        {mapUrlsToRender.map((u, mapIndex) => (
          <div key={`map-page-${mapIndex}`} style={wrapperStyle} className="relative bg-white shadow-md shrink-0">
            <div className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left" style={pageStyle}>
              <div className="w-full h-full border-[3px] border-gray-800 p-6 flex flex-col">
                <h2 className="text-2xl font-bold mb-4 border-b-2 border-gray-800 pb-2">
                  位置図 {mapCount > 1 ? `(${mapIndex + 1}/${mapCount})` : ''}
                </h2>
                <div className="border border-gray-400 p-2 bg-gray-50 flex-1 flex items-center justify-center overflow-hidden">
                  {u ? (
                    <div className="relative inline-block" style={{ maxWidth: '100%', maxHeight: '100%' }}>
                      <img
                        src={proxyUrl(u, mapIndex)}
                        crossOrigin="anonymous"
                        className="block w-auto h-auto"
                        style={{ maxWidth: '100%', maxHeight: '180mm', objectFit: 'contain' }}
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
                                  style={{ transform: `rotate(${pin.rotation ?? 0}deg)` }}
                                >
                                  ➡
                                </span>
                                <span className="text-red-600 font-bold text-[20px]">{pin.label}</span>
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
                  ) : (
                    <span className="text-gray-400 font-bold">位置図未登録</span>
                  )}
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
          <div key={pageIndex} style={wrapperStyle} className="relative bg-white shadow-md shrink-0">
            <div className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left" style={pageStyle}>
              <div className="flex-1 flex flex-col justify-between border-[3px] border-gray-800 p-2">
                {chunk.map((p, i) => (
                  <div key={i} className="flex gap-2 h-[32%] border border-gray-400 p-2 rounded">
                    <div className="w-[45%] border border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden relative">
                      {p.image && (
                        <div className="relative inline-block" style={{ maxWidth: '100%', maxHeight: '100%' }}>
                          <img
                            src={proxyUrl(p.image, p.id)}
                            crossOrigin="anonymous"
                            className="block max-w-full max-h-[80mm] object-contain"
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
                      )}
                    </div>
                    <div className="w-[55%] flex flex-col text-sm border border-gray-300 bg-white">
                      <div className="flex border-b border-gray-300">
                        <div className="w-20 bg-gray-100 p-1 border-r">写真NO</div>
                        <div className="p-1 flex-1 font-bold">{p.photoNumber}</div>
                      </div>
                      <div className="flex border-b border-gray-300">
                        <div className="w-20 bg-gray-100 p-1 border-r">撮影日</div>
                        <div className="p-1 flex-1">{p.shootingDate}</div>
                      </div>
                      <div className="flex border-b border-gray-300">
                        <div className="w-20 bg-gray-100 p-1 border-r">位置図</div>
                        <div className="p-1 flex-1 font-bold text-red-700">{p.locationMap}</div>
                      </div>
                      <div className="flex border-b border-gray-300">
                        <div className="w-20 bg-gray-100 p-1 border-r">工程</div>
                        <div className="p-1 flex-1">{p.process}</div>
                      </div>
                      <div className="flex-1 flex">
                        <div className="w-20 bg-gray-100 p-1 border-r">説明</div>
                        <div className="p-1 flex-1 text-xs">{p.description}</div>
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
