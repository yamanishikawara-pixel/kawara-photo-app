import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

// ★外部ファイルが消えても動くように、必要なものをすべて内部で定義！
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const getPreviewScale = (paddingPx: number) => Math.min(1, (window.innerWidth - paddingPx) / A4_WIDTH_PX);
const proxyUrl = (url: string, id: string | number) => url ? `${url}${url.includes('?') ? '&' : '?'}cb=${id}` : '';

export default function PdfExportPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        if (!id) return;
        const docSnap = await getDoc(doc(db, "projects", id));
        if (docSnap.exists()) {
          setProject(docSnap.data());
        } else {
          setError("現場データが見つかりません。");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [id]);

  useEffect(() => {
    const handleResize = () => setScale(getPreviewScale(32));
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const pages = document.querySelectorAll('.pdf-page');
      if (pages.length === 0) return;

      window.scrollTo(0, 0);
      await new Promise(resolve => setTimeout(resolve, 500));

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement;
        pageEl.scrollIntoView({ behavior: 'instant', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 600));

        const currentTransform = pageEl.style.transform;
        pageEl.style.transform = 'scale(1)';

        await toJpeg(pageEl, { cacheBust: true });
        const dataUrl = await toJpeg(pageEl, { quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff' });

        pageEl.style.transform = currentTransform;

        const pdfHeight = (pageEl.offsetHeight * pdfWidth) / pageEl.offsetWidth;
        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }

      pdf.save(`${project?.projectName || '写真台帳'}.pdf`);
    } catch (err: any) {
      alert("エラー: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) return <div className="p-10 text-center font-bold text-gray-500">読み込み中...</div>;
  if (error) return (
    <div className="p-10 text-center text-red-500 font-bold">
      エラー: {error}<br/>
      <button onClick={() => navigate('/')} className="mt-4 bg-gray-200 text-black px-4 py-2 rounded">もどる</button>
    </div>
  );
  if (!project) return null;

  const mapUrlsToRender = project.mapUrls && project.mapUrls.length > 0 ? project.mapUrls : [''];
  const mapCount = mapUrlsToRender.length;

  const activePhotos = project.photos?.filter((p: any) => p.image || p.process || p.description) || [];
  const photoPages: any[] = [];
  for (let i = 0; i < (activePhotos.length || 3); i += 3) {
    const chunk = activePhotos.slice(i, i + 3);
    while (chunk.length < 3) {
      chunk.push({ id: Math.random(), image: null, photoNumber: "", shootingDate: "", locationMap: "", process: "", description: "", circles: [] });
    }
    photoPages.push(chunk);
  }

  const totalPages = 1 + mapCount + photoPages.length;

  return (
    <div className="min-h-screen bg-gray-200 p-4 sm:p-6 font-sans flex flex-col items-center pb-12 overflow-x-hidden w-full">
      <div className="w-full max-w-2xl mb-6 flex justify-between items-center">
        <button onClick={() => navigate(`/project/${id}`)} className="text-blue-500 font-bold flex items-center gap-2 text-lg">
          <ArrowLeft className="w-6 h-6" /> もどる
        </button>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className={`px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-bold shadow-lg text-base sm:text-lg transition-colors ${isExporting ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-orange-500 text-white hover:bg-orange-600'}`}
        >
          {isExporting ? 'PDF作成中...' : 'ダウンロード'}
        </button>
      </div>

      <div className="flex flex-col gap-8 items-center w-full">
        <div style={{ width: `${A4_WIDTH_PX * scale}px`, height: `${A4_HEIGHT_PX * scale}px` }} className="relative bg-white shadow-md shrink-0">
          <div className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left" style={{ width: `${A4_WIDTH_PX}px`, height: `${A4_HEIGHT_PX}px`, padding: '20mm', transform: `scale(${scale})` }}>
            <div className="w-full h-full border-[3px] border-gray-800 p-12 flex flex-col relative">
              <div className="mt-[30mm] mb-[40mm] text-center">
                <h1 className="text-4xl font-serif tracking-[0.5em] font-bold mb-4">工事写真報告書</h1>
                <div className="w-[110mm] mx-auto border-b-[2px] border-gray-800"></div>
                <div className="w-[110mm] mx-auto border-b-[1px] border-gray-800 mt-1"></div>
              </div>
              <div className="flex-1 px-4 space-y-14">
                {[
                  { label: "工事件名", value: project.projectName },
                  { label: "工事場所", value: project.projectLocation },
                  { label: "工期", value: project.constructionPeriod },
                  { label: "施工業者", value: project.contractorName },
                  { label: "作成年月日", value: project.creationDate }
                ].map((item: any, idx: number) => (
                  <div key={idx} className="flex items-baseline border-b-2 border-gray-800 pb-1">
                    <div className="w-[50mm] flex-shrink-0 flex justify-between text-[20px] font-bold pr-16">{item.label.split('').map((c: string, i: number) => <span key={i}>{c}</span>)}</div>
                    <div className="flex-1 text-[20px] font-medium whitespace-nowrap overflow-hidden">{item.value || "　"}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- 1 / {totalPages} -</div>
          </div>
        </div>

        {mapUrlsToRender.map((u: string, mapIndex: number) => {
          const currentRows = (project.mapRows || []).filter((r: any) => r.mapIndex === mapIndex || (r.mapIndex === undefined && mapIndex === 0));

          return (
            <div key={`map-page-${mapIndex}`} style={{ width: `${A4_WIDTH_PX * scale}px`, height: `${A4_HEIGHT_PX * scale}px` }} className="relative bg-white shadow-md shrink-0">
              <div className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left" style={{ width: `${A4_WIDTH_PX}px`, height: `${A4_HEIGHT_PX}px`, padding: '15mm', transform: `scale(${scale})` }}>
                <div className="w-full h-full border-[3px] border-gray-800 p-6 flex flex-col">
                  <h2 className="text-2xl font-bold mb-4 border-b-2 border-gray-800 pb-2">位置図 {mapCount > 1 ? `(${mapIndex + 1}/${mapCount})` : ''}</h2>
                  <div className="border border-gray-400 p-2 bg-gray-50 flex-1 flex flex-col items-center justify-start overflow-hidden">
                    <div className="relative inline-block w-full flex items-center justify-center min-h-0">
                      {u ? (
                        <div className="relative inline-block flex-shrink-0 min-h-0">
                          <img src={proxyUrl(u, mapIndex)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-[160mm]" />
                          {(project.mapPins || []).filter((p: any) => p.mapIndex === mapIndex).map((pin: any) => (
                            <div key={pin.id} style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: 'translate(-50%, -50%)' }} className="absolute z-10">
                              {pin.type === 'arrow' ? (
                                <div className="flex items-center gap-1 bg-white/70 px-1 rounded border border-red-200">
                                  <span className="text-red-600 font-black text-[24px]" style={{ transform: `rotate(${pin.rotation || 0}deg)` }}>➡</span>
                                  <span className="text-red-600 font-bold text-[20px]">{pin.label}</span>
                                </div>
                              ) : (
                                <div className="relative flex items-center justify-center">
                                  <div className="w-[14mm] h-[14mm] rounded-full border-[4px] border-red-600 bg-red-600/10"></div>
                                  <span className="absolute text-red-600 font-bold text-[18px] bg-white/70 px-1 rounded">{pin.label}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 font-bold">位置図未登録</span>
                      )}
                    </div>

                    {currentRows.length > 0 && (
                      <div className="w-full mt-4 shrink-0">
                        <table className="w-full border-collapse border border-gray-800 text-[12px] bg-white">
                          <thead>
                            <tr className="bg-gray-100 text-center">
                              <th className="border border-gray-800 p-1.5 w-[10%]">番号</th>
                              <th className="border border-gray-800 p-1.5 w-[20%]">部位</th>
                              <th className="border border-gray-800 p-1.5 w-[15%]">写真NO</th>
                              <th className="border border-gray-800 p-1.5 w-[55%]">備考</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentRows.map((row: any, i: number) => (
                              <tr key={i} className="text-center h-8">
                                <td className="border border-gray-800 p-1.5 font-bold">{row.symbol}</td>
                                <td className="border border-gray-800 p-1.5">{row.part}</td>
                                <td className="border border-gray-800 p-1.5">{row.photoNo || row.relatedPhotoNumber}</td>
                                <td className="border border-gray-800 p-1.5 text-left">{row.remarks}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
                <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- {2 + mapIndex} / {totalPages} -</div>
              </div>
            </div>
          );
        })}

        {photoPages.map((chunk: any[], pageIndex: number) => (
          <div key={pageIndex} style={{ width: `${A4_WIDTH_PX * scale}px`, height: `${A4_HEIGHT_PX * scale}px` }} className="relative bg-white shadow-md shrink-0">
            <div className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left" style={{ width: `${A4_WIDTH_PX}px`, height: `${A4_HEIGHT_PX}px`, padding: '15mm', transform: `scale(${scale})` }}>
              <div className="flex-1 flex flex-col justify-between border-[3px] border-gray-800 p-2">
                {chunk.map((p: any, i: number) => (
                  <div key={i} className="flex gap-2 h-[32%] border border-gray-400 p-2 rounded">
                    <div className="w-[45%] border border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden relative">
                      {p.image && (
                        <div className="relative inline-block flex-shrink-0" style={{ maxWidth: '100%', maxHeight: '100%' }}>
                          <img src={proxyUrl(p.image, p.id)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-[80mm]" />
                          {(p.circles || []).map((circle: any) => (
                            <div key={circle.id} style={{ left: `${circle.x}%`, top: `${circle.y}%`, width: `${circle.size}%`, transform: 'translate(-50%, -50%)' }} className="absolute aspect-square rounded-full border-[3px] border-red-600" />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="w-[55%] flex flex-col text-sm border border-gray-300 bg-white">
                      <div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">写真NO</div><div className="p-1 flex-1 font-bold">{p.photoNumber}</div></div>
                      <div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">撮影日</div><div className="p-1 flex-1">{p.shootingDate}</div></div>
                      <div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">位置図</div><div className="p-1 flex-1 font-bold text-red-700">{p.locationMap}</div></div>
                      <div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">工程</div><div className="p-1 flex-1">{p.process}</div></div>
                      <div className="flex-1 flex"><div className="w-20 bg-gray-100 p-1 border-r">説明</div><div className="p-1 flex-1 text-xs">{p.description}</div></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- {2 + mapCount + pageIndex} / {totalPages} -</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}