import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { toJpeg } from 'html-to-image';

import { db } from '../firebase';
import type { Circle, MapPin, Photo, Project } from '../types';
import { proxyUrl } from '../shared/utils';

interface ProjectWithAll extends Omit<Project, 'photos' | 'mapPins'> {
  photos: (Photo & { circles?: Circle[] })[];
  mapPins: MapPin[];
}

export function PdfExportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectWithAll | null>(null);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'projects', id)).then((d) => {
      if (d.exists()) {
        const data = d.data() as ProjectWithAll;
        data.photos = data.photos || [];
        data.mapPins = data.mapPins || [];
        setProject(data);
      }
    });
  }, [id]);

  const handleExport = async () => {
    if (!project) return;
    try {
      const pages = document.querySelectorAll('.pdf-page');
      if (pages.length === 0) return;

      alert(
        'PDF作成中...スマホの画面をそのままにして少しお待ちください\n（写真が多い場合は10秒ほどかかります）',
      );

      // ★修正：真っ白バグ防止のため、一番上にスクロールしてから少し長めに待機
      window.scrollTo(0, 0);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();

      for (let i = 0; i < pages.length; i += 1) {
        const pageEl = pages[i] as HTMLElement;

        // ★修正：真っ白バグ防止のため、該当ページを画面内にスクロールして確実に表示させる
        pageEl.scrollIntoView({ behavior: 'instant', block: 'center' });
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 600));

        // eslint-disable-next-line no-await-in-loop
        await toJpeg(pageEl, { cacheBust: true });
        // eslint-disable-next-line no-await-in-loop
        const dataUrl = await toJpeg(pageEl, {
          quality: 0.95,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
        });
        const pdfHeight = (pageEl.offsetHeight * pdfWidth) / pageEl.offsetWidth;

        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }

      pdf.save(`${project.projectName || '写真台帳'}.pdf`);
    } catch (error: any) {
      alert(`エラー: ${error.message}`);
    }
  };

  if (!project) return null;

  const mapUrlsToRender =
    project.mapUrls && project.mapUrls.length > 0 ? project.mapUrls : [''];
  const mapCount = mapUrlsToRender.length;

  const activePhotos =
    project.photos?.filter(
      (p: Photo) => p.image || p.process || p.description,
    ) || [];
  const photoPages: (Photo & { circles?: Circle[] })[][] = [];
  for (let i = 0; i < (activePhotos.length || 3); i += 3) {
    const chunk = activePhotos.slice(i, i + 3);
    // eslint-disable-next-line no-loop-func
    while (chunk.length < 3) {
      chunk.push({
        id: Math.random(),
        image: null,
        photoNumber: '',
        shootingDate: '',
        locationMap: '',
        process: '',
        description: '',
        circles: [],
      });
    }
    photoPages.push(chunk);
  }

  const totalPages = 1 + mapCount + photoPages.length;

  return (
    <div className="min-h-screen bg-gray-200 p-6 font-sans flex flex-col items-center pb-12 overflow-x-hidden">
      <div className="w-full max-w-2xl mb-6 flex justify-between items-center">
        <button
          onClick={() => navigate(`/project/${id}`)}
          className="text-blue-500 font-bold flex items-center gap-2 text-lg"
        >
          <ArrowLeft className="w-6 h-6" /> もどる
        </button>
        <button
          onClick={handleExport}
          className="bg-orange-500 text-white px-8 py-4 rounded-xl font-bold shadow-lg text-lg"
        >
          ダウンロード
        </button>
      </div>
      <div className="overflow-auto w-full max-w-2xl bg-gray-300 p-4 rounded-xl flex flex-col gap-8">
        {/* 表紙 */}
        <div
          className="pdf-page bg-white relative shadow-md flex flex-col"
          style={{ width: '210mm', height: '297mm', padding: '20mm' }}
        >
          <div className="w-full h-full border-[3px] border-gray-800 p-12 flex flex-col relative">
            <div className="mt-[30mm] mb-[40mm] text-center">
              <h1 className="text-4xl font-serif tracking-[0.5em] font-bold mb-4">
                工事写真報告書
              </h1>
              <div className="w-[110mm] mx-auto border-b-[2px] border-gray-800" />
              <div className="w-[110mm] mx-auto border-b-[1px] border-gray-800 mt-1" />
            </div>
            <div className="flex-1 px-4 space-y-14">
              {[
                { label: '工事件名', value: project.projectName },
                { label: '工事場所', value: project.projectLocation },
                { label: '工期', value: project.constructionPeriod },
                { label: '施工業者', value: project.contractorName },
                { label: '作成年月日', value: project.creationDate },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-baseline border-b-2 border-gray-800 pb-1"
                >
                  <div className="w-[50mm] flex-shrink-0 flex justify-between text-[20px] font-bold pr-16">
                    {item.label.split('').map((c, i) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <span key={i}>{c}</span>
                    ))}
                  </div>
                  <div className="flex-1 text-[20px] font-medium whitespace-nowrap overflow-hidden">
                    {item.value || '　'}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">
            - 1 / {totalPages} -
          </div>
        </div>

        {/* 位置図（PDF出力） */}
        {mapUrlsToRender.map((u, mapIndex) => (
          <div
            key={`map-page-${mapIndex}`}
            className="pdf-page bg-white relative shadow-md flex flex-col"
            style={{ width: '210mm', height: '297mm', padding: '15mm' }}
          >
            <div className="w-full h-full border-[3px] border-gray-800 p-6 flex flex-col">
              <h2 className="text-2xl font-bold mb-4 border-b-2 border-gray-800 pb-2">
                位置図{' '}
                {mapCount > 1 ? `(${mapIndex + 1}/${mapCount})` : ''}
              </h2>

              <div className="border border-gray-400 p-2 bg-gray-50 flex-1 flex items-center justify-center overflow-hidden">
                {u ? (
                  <div
                    className="relative inline-block"
                    style={{ maxWidth: '100%', maxHeight: '100%' }}
                  >
                    {/* ★修正：真っ白バグ防止のID付きURL */}
                    <img
                      src={proxyUrl(u, mapIndex)}
                      crossOrigin="anonymous"
                      className="block w-auto h-auto"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '180mm',
                        objectFit: 'contain',
                      }}
                    />

                    {/* PDF用マーカー */}
                    {(project.mapPins || [])
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
                                  transform: `rotate(${pin.rotation || 0}deg)`,
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
                ) : (
                  <span className="text-gray-400 font-bold">
                    位置図未登録
                  </span>
                )}
              </div>
            </div>
            <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">
              - {2 + mapIndex} / {totalPages} -
            </div>
          </div>
        ))}

        {/* 写真（PDF出力） */}
        {photoPages.map((chunk, pageIndex) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={pageIndex}
            className="pdf-page bg-white relative shadow-md flex flex-col"
            style={{ width: '210mm', height: '297mm', padding: '15mm' }}
          >
            <div className="flex-1 flex flex-col justify-between border-[3px] border-gray-800 p-2">
              {chunk.map((p, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div
                  key={i}
                  className="flex gap-2 h-[32%] border border-gray-400 p-2 rounded"
                >
                  <div className="w-[45%] border border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden relative">
                    {p.image && (
                      <div
                        className="relative inline-block"
                        style={{ maxWidth: '100%', maxHeight: '100%' }}
                      >
                        {/* ★修正：真っ白バグ防止のID付きURL */}
                        <img
                          src={proxyUrl(p.image, p.id)}
                          crossOrigin="anonymous"
                          className="block max-w-full max-h-[80mm] object-contain"
                        />
                        {/* ★修正：PDFでも赤丸がズレない設定 */}
                        {(p.circles || []).map((circle) => (
                          <div
                            key={circle.id}
                            style={{
                              left: `${circle.x}%`,
                              top: `${circle.y}%`,
                              width: `${circle.size}%`,
                              transform: 'translate(-50%, -50%)',
                            }}
                            className="absolute aspect-square rounded-full border-[3px] border-red-600 bg-red-600/10"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="w-[55%] flex flex-col text-sm border border-gray-300 bg-white">
                    <div className="flex border-b border-gray-300">
                      <div className="w-20 bg-gray-100 p-1 border-r">
                        写真NO
                      </div>
                      <div className="p-1 flex-1 font-bold">
                        {p.photoNumber}
                      </div>
                    </div>
                    <div className="flex border-b border-gray-300">
                      <div className="w-20 bg-gray-100 p-1 border-r">
                        撮影日
                      </div>
                      <div className="p-1 flex-1">{p.shootingDate}</div>
                    </div>
                    <div className="flex border-b border-gray-300">
                      <div className="w-20 bg-gray-100 p-1 border-r">
                        位置図
                      </div>
                      <div className="p-1 flex-1 font-bold text-red-700">
                        {p.locationMap}
                      </div>
                    </div>
                    <div className="flex border-b border-gray-300">
                      <div className="w-20 bg-gray-100 p-1 border-r">
                        工程
                      </div>
                      <div className="p-1 flex-1">{p.process}</div>
                    </div>
                    <div className="flex-1 flex">
                      <div className="w-20 bg-gray-100 p-1 border-r">
                        説明
                      </div>
                      <div className="p-1 flex-1 text-xs">
                        {p.description}
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
        ))}
      </div>
    </div>
  );
}

