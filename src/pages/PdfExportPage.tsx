import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Circle, MapRow, MapLine, Photo, Project, Material } from '../types';
import kawaraLogo from '../assets/kawara-logo.png';
import { A4_HEIGHT_PX, A4_WIDTH_PX, getPreviewScale, proxyUrl } from '../shared/utils';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';

// ★ BIZ UDPゴシックを最優先指定（ブラウザ印刷でそのままベクター文字として出力されます）
const JP_FONT = "'BIZ UDPGothic', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', Meiryo, sans-serif";

function safeStyleLine(val: string | number | undefined | null, defaultUnit: string): string {
  if (val == null || val === '') return `0${defaultUnit}`;
  if (typeof val === 'number') return `${val}${defaultUnit}`;
  return String(val);
}

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
  return { id: Math.random(), image: null, photoNumber: '', shootingDate: '', locationMap: '', process: '', description: '', circles: [] };
}

function createEmptyMaterial(): Material {
  return { id: Math.random(), image: null, name: '', manufacturer: '', specification: '', remarks: '', rotation: 0 };
}

function PdfLineLegend() {
  return (
    <div className="flex gap-x-4 gap-y-1 flex-wrap text-xs font-medium rounded-lg p-2 shadow-sm border border-gray-300 bg-white print:border-gray-800">
      {LINE_TYPES.map((type) => (
        <div key={type.label} className="flex items-center gap-1.5">
          <div style={{ backgroundColor: type.color }} className="w-6 h-[2px] rounded-full print:border print:border-black print:h-[3px]" />
          <span className="text-gray-700 print:text-black">{type.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function PdfExportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [userSettings, setUserSettings] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [scale, setScale] = useState(1);
  const [sessionId] = useState(() => Date.now().toString());
  const [isPrinting, setIsPrinting] = useState(false);

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
          if (s.exists()) setUserSettings(s.data() as Record<string, unknown>);
        }
      } catch { setError('データの読み込みに失敗しました。'); }
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    const updateScale = () => setScale(getPreviewScale(32));
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // ★ 印刷が終わったら元のスケールに戻すための監視イベント
  useEffect(() => {
    const handleAfterPrint = () => setIsPrinting(false);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

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
      const promises = activePhotos.map(async (p) => {
        if (!p.image) return;
        try {
          const response = await fetch(p.image);
          const blob = await response.blob();
          const processName = p.process ? `_${p.process}` : '';
          const filename = `${p.photoNumber.padStart(2, '0')}${processName}.jpg`;
          imgFolder.file(filename, blob);
        } catch { /* ignore */ }
      });
      await Promise.all(promises);
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${folderName}.zip`);
    } catch { setError('Zipファイルの作成に失敗しました。'); } finally { setIsZipping(false); }
  };

  // ★ 作戦B：ブラウザの標準印刷機能を呼び出す
  const handlePrint = () => {
    if (!project) return;
    setIsPrinting(true);
    // 画面の再描画を待ってから印刷ダイアログを開く
    setTimeout(() => {
      window.print();
    }, 500);
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

  const activeMaterials = (project.materials ?? []).filter(m => m.image || m.name || m.manufacturer || m.specification || m.remarks);
  const materialPages: Material[][] = [];
  if (activeMaterials.length > 0) {
    for (let i = 0; i < Math.max(activeMaterials.length, 3); i += 3) {
      const chunk = activeMaterials.slice(i, i + 3);
      while (chunk.length < 3) chunk.push(createEmptyMaterial());
      materialPages.push(chunk);
    }
  }

  const totalPages = 1 + mapCount + photoPages.length + materialPages.length;
  
  return (
    <div className={`min-h-screen font-sans flex flex-col items-center pb-12 overflow-x-hidden w-full relative ${isPrinting ? 'bg-white p-0' : 'bg-gray-200 p-4 sm:p-6'}`}>
      
      {/* ★ 印刷時(PDF化時)の専用CSSスタイル。ここでA4の余白を完全にゼロにする */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap');
        .pdf-container-wrapper * { font-family: ${JP_FONT} !important; }
        
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white; margin: 0; padding: 0; }
          /* 印刷時はヘッダーや戻るボタンを消す */
          .no-print { display: none !important; }
          /* 印刷時はスケールを100%に戻し、影を消す */
          .pdf-page-wrapper { transform: none !important; box-shadow: none !important; margin: 0 !important; width: ${A4_WIDTH_PX}px !important; height: ${A4_HEIGHT_PX}px !important; page-break-after: always; }
          .pdf-page { transform: none !important; }
        }
      `}</style>

      {/* 画面上部のボタン類（印刷時には消える） */}
      <div className={`w-full max-w-2xl mb-6 flex justify-between items-center flex-wrap gap-2 no-print ${isPrinting ? 'hidden' : ''}`}>
        <button type="button" onClick={() => navigate(`/project/${id}`)} className="text-blue-500 font-bold flex items-center gap-2 text-lg"><ArrowLeft className="w-6 h-6" /> もどる</button>
        <div className="flex gap-2 sm:gap-4">
          <button type="button" onClick={handleZipExport} disabled={isZipping || isPrinting} className="flex items-center gap-2 bg-green-600 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-xl font-bold shadow-lg hover:bg-green-700 disabled:opacity-50"><Download className="w-5 h-5" />写真のみ(Zip)</button>
          <button type="button" onClick={handlePrint} disabled={isZipping || isPrinting} className="flex items-center gap-2 bg-black text-white px-5 sm:px-8 py-3 sm:py-4 rounded-xl font-bold shadow-lg hover:bg-gray-800 disabled:opacity-50"><Printer className="w-5 h-5" /> {isPrinting ? '準備中...' : 'PDF作成・印刷'}</button>
        </div>
      </div>

      {error && <div className="w-full max-w-2xl mb-4 no-print"><ErrorMessage message={error} onDismiss={() => setError(null)} /></div>}

      <div className={`pdf-container-wrapper flex flex-col items-center w-full ${isPrinting ? 'gap-0' : 'gap-8'}`}>
        
        {/* ① 表紙ページ */}
        {/* ★ 印刷時はスケールを無視して原寸大(scale: 1)にする */}
        <div style={{ width: isPrinting ? `${A4_WIDTH_PX}px` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `${A4_HEIGHT_PX}px` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
          <div className="pdf-page absolute top-0 left-0 flex flex-col items-center origin-top-left bg-white text-black" style={{ width: `${A4_WIDTH_PX}px`, height: `${A4_HEIGHT_PX}px`, padding: '15mm', transform: isPrinting ? 'scale(1)' : `scale(${scale})` }}>
            <div className="flex flex-col items-center w-full" style={{ marginTop: '19px', marginBottom: '106px' }}>
              <div className="shrink-0 flex justify-center mb-6">
                {logoUrl ? <img src={proxyUrl(logoUrl, `logo_${sessionId}`)} data-original-src={logoUrl} alt="自社ロゴ" className="block h-auto object-contain" style={{ width: '151px' }} crossOrigin="anonymous" /> : <img src={kawaraLogo} data-original-src={kawaraLogo} alt="標準ロゴ" className="block h-auto object-contain grayscale" style={{ width: '121px' }} crossOrigin="anonymous" />}
              </div>
              <div className="flex flex-col items-center">
                <h1 className="text-[48px] font-bold tracking-[0.3em] mb-4 text-center">工事写真報告書</h1>
                <div className="w-[160mm] border-b-[4px] border-black" />
                <div className="w-[160mm] border-b-[1px] border-black mt-1.5" />
              </div>
            </div>
            <div className="w-[150mm] flex flex-col gap-y-[12mm]">
              {COVER_FIELDS.map((item, idx) => {
                let value = String(project[item.key] ?? '　');
                if (item.key === 'contractorName' && companyName) value = companyName;
                return (
                  <div key={idx} className="flex items-end pb-2 border-b-2 border-black">
                    <div className="w-[45mm] flex-shrink-0 flex justify-between text-[22px] font-bold pr-8 leading-none">{item.label.split('').map((c: string, i: number) => <span key={i} className="block leading-none">{c}</span>)}</div>
                    <div className="flex-1 text-[26px] font-bold whitespace-nowrap overflow-hidden pl-4 leading-none pb-[2px]">{value}</div>
                  </div>
                );
              })}
            </div>
            {userSettings && (address || phone) && (
              <div className="absolute bottom-[16mm] right-[15mm] text-right flex flex-col items-end pl-4 py-1 bg-white">
                {companyName && <div className="text-[18px] font-bold mb-1 text-black">{companyName}</div>}
                {address && <div className="text-[14px] font-bold text-gray-800">{address}</div>}
                {phone && <div className="text-[14px] font-bold text-gray-800">TEL: {phone}</div>}
              </div>
            )}
            <div className="absolute bottom-[10mm] right-[15mm] text-[16px] font-bold text-black">- 1 / {totalPages} -</div>
          </div>
        </div>

        {/* ② 位置図ページ */}
        {mapUrlsToRender.map((u, mapIndex) => (
          <div key={`map-page-${mapIndex}`} style={{ width: isPrinting ? `${A4_WIDTH_PX}px` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `${A4_HEIGHT_PX}px` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div className="pdf-page absolute top-0 left-0 flex flex-col origin-top-left bg-white text-black" style={{ width: `${A4_WIDTH_PX}px`, height: `${A4_HEIGHT_PX}px`, padding: '15mm', transform: isPrinting ? 'scale(1)' : `scale(${scale})` }}>
              <div className="w-full h-full p-6 flex flex-col border-[3px] border-gray-800 print:border-black">
                <h2 className="text-2xl font-bold mb-4 pb-2 border-b-2 border-gray-800 print:border-black">位置図 {mapCount > 1 ? `(${mapIndex + 1}/${mapCount})` : ''}</h2>
                <div className="p-2 flex-1 flex items-center justify-center overflow-hidden min-h-0 border border-gray-400 bg-gray-50 print:bg-white print:border-gray-500">
                  {u ? (
                    <div className="flex items-center justify-center w-full h-full">
                      <div className="relative inline-block">
                        <img src={proxyUrl(u, `map_${mapIndex}_${sessionId}`)} data-original-src={u} crossOrigin="anonymous" className="block w-auto h-auto max-w-full" style={{ maxHeight: '150mm' }} alt="" />
                        {(project.mapPins ?? []).filter(p => p.mapIndex === mapIndex).map(pin => (
                            <div key={pin.id} style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: `translate(-50%, -50%) scale(${pin.size ?? 1})`, zIndex: 10 }} className="absolute">
                              {pin.type === 'arrow' ? (
                                <div className="flex items-center gap-1 px-1 rounded bg-white/70 border border-red-200"><span className="font-bold text-[24px] text-red-600" style={{ transform: `rotate(${pin.rotation ?? 0}deg)` }}>➡</span><span className="font-bold text-[20px] text-red-600">{pin.label}</span></div>
                              ) : (
                                <div className="relative flex items-center justify-center"><div className="w-[14mm] h-[14mm] rounded-full border-[4px] border-red-600 bg-red-600/10" /><span className="absolute font-bold text-[18px] px-1 rounded text-red-600 bg-white/70">{pin.label}</span></div>
                              )}
                            </div>
                        ))}
                        {(project.mapLines ?? []).filter(l => l.mapIndex === mapIndex).map((line: MapLine) => (
                            <div key={`line-${line.id}`} className="absolute" style={{ left: safeStyleLine(line.x, '%'), top: safeStyleLine(line.y, '%'), width: safeStyleLine(line.length, '%'), height: safeStyleLine(line.thickness, 'px'), backgroundColor: line.color || '#000000', transform: `translate(-50%, -50%) rotate(${line.rotation ?? 0}deg)`, transformOrigin: 'center center', zIndex: 15 }} />
                          ))}
                      </div>
                    </div>
                  ) : <span className="font-bold text-gray-400">位置図未登録</span>}
                </div>
                <div className="mt-4">
                  <div className="flex justify-between items-end mb-2"><div className="text-base font-bold">項目欄</div><PdfLineLegend /></div>
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
              <div className="absolute bottom-[10mm] right-[15mm] text-xs font-bold text-gray-500">- {2 + mapIndex} / {totalPages} -</div>
            </div>
          </div>
        ))}

        {/* ③ 写真ページ */}
        {photoPages.map((chunk, pageIndex) => (
          <div key={`photo-page-${pageIndex}`} style={{ width: isPrinting ? `${A4_WIDTH_PX}px` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `${A4_HEIGHT_PX}px` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div className="pdf-page absolute top-0 left-0 flex flex-col origin-top-left bg-white text-black" style={{ width: `${A4_WIDTH_PX}px`, height: `${A4_HEIGHT_PX}px`, padding: '15mm', transform: isPrinting ? 'scale(1)' : `scale(${scale})` }}>
              <div className="flex-1 flex flex-col gap-2 p-1.5 border-[3px] border-gray-800 bg-white min-h-0 overflow-hidden print:border-black">
                {chunk.map((p, i) => {
                  const isRotated = (Number(p.rotation) || 0) % 180 !== 0;
                  const imgMaxWidth = isRotated ? '230px' : '390px';
                  const imgMaxHeight = isRotated ? '390px' : '230px';
                  
                  return (
                    <div key={i} className="flex gap-2 h-[calc((100%-1rem)/3)] p-1.5 rounded border border-gray-500 bg-white min-h-0 shrink-0 print:border-black">
                      <div className="w-[60%] flex items-center justify-center overflow-hidden relative min-h-0 border border-gray-400 bg-gray-50 shrink-0 print:bg-white print:border-gray-500">
                        {p.image ? (
                          <div className="relative inline-block flex items-center justify-center">
                            <img 
                              src={proxyUrl(p.image, `photo_${p.id}_${sessionId}`)} 
                              data-original-src={p.image} 
                              crossOrigin="anonymous" 
                              className="block w-auto h-auto" 
                              style={{ 
                                transform: `rotate(${Number(p.rotation) || 0}deg)`, 
                                maxWidth: imgMaxWidth, 
                                maxHeight: imgMaxHeight,
                                objectFit: 'contain'
                              }} 
                              alt="" 
                            />
                            {(p.circles ?? []).map((circle) => (
                              <div key={circle.id} className="absolute aspect-square rounded-full border-[3px] border-red-600" style={{ left: `${circle.x}%`, top: `${circle.y}%`, width: `${circle.size}%`, transform: 'translate(-50%, -50%)' }} />
                            ))}
                          </div>
                        ) : <span className="font-bold text-gray-400">写真未登録</span>}
                      </div>
                      <div className="w-[40%] flex flex-col text-[13px] border border-gray-400 bg-white shrink-0 min-h-0 print:border-black">
                        <div className="flex min-h-[30px] border-b border-gray-400 shrink-0 print:border-black"><div className="w-20 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">写真NO</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden whitespace-nowrap">{p.photoNumber || '　'}</div></div>
                        <div className="flex min-h-[30px] border-b border-gray-400 shrink-0 print:border-black"><div className="w-20 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">撮影日</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden whitespace-nowrap">{p.shootingDate || '　'}</div></div>
                        <div className="flex min-h-[30px] border-b border-gray-400 shrink-0 print:border-black"><div className="w-20 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">位置図</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden text-red-700 whitespace-nowrap">{p.locationMap || '　'}</div></div>
                        <div className="flex min-h-[30px] border-b border-gray-400 shrink-0 print:border-black"><div className="w-20 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">工程</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden whitespace-nowrap">{p.process || '　'}</div></div>
                        <div className="flex-1 flex min-h-0"><div className="w-20 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">説明</div><div className="p-2 flex-1 overflow-hidden font-bold leading-snug flex items-start break-words whitespace-pre-wrap">{p.description || '　'}</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="absolute bottom-[10mm] right-[15mm] text-xs font-bold text-gray-500 shrink-0">- {2 + mapCount + pageIndex} / {totalPages} -</div>
            </div>
          </div>
        ))}

        {/* ④ 使用材料表 */}
        {materialPages.map((chunk, pageIndex) => (
          <div key={`material-page-${pageIndex}`} style={{ width: isPrinting ? `${A4_WIDTH_PX}px` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `${A4_HEIGHT_PX}px` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div className="pdf-page absolute top-0 left-0 flex flex-col origin-top-left bg-white text-black" style={{ width: `${A4_WIDTH_PX}px`, height: `${A4_HEIGHT_PX}px`, padding: '15mm', transform: isPrinting ? 'scale(1)' : `scale(${scale})` }}>
              <h2 className="text-xl font-bold pb-1 mb-2 border-b-2 border-gray-800 shrink-0 print:border-black">使用材料表</h2>
              <div className="flex-1 flex flex-col gap-2 p-1.5 border-[3px] border-gray-800 bg-white min-h-0 overflow-hidden print:border-black">
                {chunk.map((m, i) => {
                  const isRotated = (Number(m.rotation) || 0) % 180 !== 0;
                  const imgMaxWidth = isRotated ? '230px' : '390px';
                  const imgMaxHeight = isRotated ? '390px' : '230px';
                  
                  return (
                    <div key={i} className="flex gap-2 h-[calc((100%-1rem)/3)] p-1.5 rounded border border-gray-500 bg-white min-h-0 shrink-0 print:border-black">
                      <div className="w-[60%] flex items-center justify-center overflow-hidden relative min-h-0 border border-gray-400 bg-gray-50 shrink-0 print:bg-white print:border-gray-500">
                        {m.image ? (
                          <div className="relative inline-block flex items-center justify-center">
                            <img 
                              src={proxyUrl(m.image, `material_${m.id}_${sessionId}`)} 
                              data-original-src={m.image} 
                              crossOrigin="anonymous" 
                              className="block w-auto h-auto" 
                              style={{ 
                                transform: `rotate(${Number(m.rotation) || 0}deg)`, 
                                maxWidth: imgMaxWidth, 
                                maxHeight: imgMaxHeight,
                                objectFit: 'contain'
                              }} 
                              alt="" 
                            />
                          </div>
                        ) : <span className="font-bold text-gray-400">写真未登録</span>}
                      </div>
                      <div className="w-[40%] flex flex-col text-[13px] border border-gray-400 bg-white shrink-0 min-h-0 print:border-black">
                        <div className="flex min-h-[32px] border-b border-gray-400 shrink-0 print:border-black"><div className="w-24 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">品名</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden break-words whitespace-pre-wrap">{m.name || '　'}</div></div>
                        <div className="flex min-h-[32px] border-b border-gray-400 shrink-0 print:border-black"><div className="w-24 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">メーカー</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden break-words whitespace-pre-wrap">{m.manufacturer || '　'}</div></div>
                        <div className="flex min-h-[44px] border-b border-gray-400 shrink-0 print:border-black"><div className="w-24 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-tight print:bg-gray-50 print:border-black">規格・寸法<br />数量</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden text-red-700 leading-snug break-words whitespace-pre-wrap">{m.specification || '　'}</div></div>
                        <div className="flex-1 flex min-h-0"><div className="w-24 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">備考</div><div className="p-2 flex-1 overflow-hidden font-bold flex items-start leading-snug break-words whitespace-pre-wrap">{m.remarks || '　'}</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="absolute bottom-[10mm] right-[15mm] text-xs font-bold text-gray-500 shrink-0">- {2 + mapCount + photoPages.length + pageIndex} / {totalPages} -</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}