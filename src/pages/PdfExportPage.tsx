import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Printer, RotateCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Circle, MapRow, MapLine, Photo, Project, Material } from '../types';
import kawaraLogo from '../assets/kawara-logo.png';
import { A4_HEIGHT_PX, A4_WIDTH_PX, getPreviewScale, proxyUrl } from '../shared/utils';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';

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
  const [printProgress, setPrintProgress] = useState('');
  
  const [rotateMap, setRotateMap] = useState(false);

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

  useEffect(() => {
    const handleAfterPrint = () => { setIsPrinting(false); setPrintProgress(''); };
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

  const optimizeImageForPrint = (imgEl: HTMLImageElement): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const MAX_PRINT_PX = 800; 
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
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        canvas.width = 0;
        canvas.height = 0;
        resolve(dataUrl);
      };
      img.onerror = () => resolve(imgEl.src); 
      img.src = imgEl.getAttribute('data-original-src') || imgEl.src;
    });
  };

  const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

  const handlePrint = () => {
    if (!project) return;
    setIsPrinting(true);
    setPrintProgress('準備中...');
    
    setTimeout(async () => {
      try {
        const images = Array.from(document.querySelectorAll('.pdf-page img'));
        const needsConversion = images.filter((img) => {
          const src = img.getAttribute('data-original-src') || img.getAttribute('src');
          return src && !src.startsWith('data:');
        });
        
        const total = needsConversion.length;
        const BATCH_SIZE = 2; 
        
        for (let i = 0; i < total; i += BATCH_SIZE) {
          const batch = needsConversion.slice(i, i + BATCH_SIZE);
          setPrintProgress(`画像を最適化中... (${Math.min(i + BATCH_SIZE, total)}/${total})`);
          
          await Promise.all(batch.map(async (img) => {
            try {
              const dataUrl = await optimizeImageForPrint(img as HTMLImageElement);
              img.setAttribute('src', dataUrl);
              img.removeAttribute('crossorigin');
            } catch (e) { console.warn('画像変換スキップ:', e); }
          }));
          
          await yieldToUI();
        }
        
        setPrintProgress('PDF生成中...');
        
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)));
        });
        
        window.print();
      } catch (err) {
        setError('印刷の準備中にエラーが発生しました。');
        setIsPrinting(false);
      } finally {
        setPrintProgress('');
      }
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
  const showLegendTable = project.showLegendTable !== false;
  
  return (
    <div className={`min-h-screen font-sans pb-12 overflow-x-hidden w-full relative ${isPrinting ? 'bg-white p-0 block' : 'bg-gray-200 p-4 sm:p-6 flex flex-col items-center'}`}>
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap');
        .pdf-container-wrapper * { font-family: ${JP_FONT} !important; }
        
        @media print {
          @page { size: A4 portrait; margin: 0; }
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
            width: 210mm !important; 
            height: auto !important;
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

          .pdf-page { 
            position: relative !important;
            top: auto !important;
            left: auto !important;
            width: 210mm !important; 
            height: 265mm !important; 
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

      <div className={`w-full max-w-2xl mb-6 flex justify-between items-center flex-wrap gap-2 no-print ${isPrinting ? 'hidden' : ''}`}>
        <button type="button" onClick={() => navigate(`/project/${id}`)} className="text-blue-500 font-bold flex items-center gap-2 text-lg"><ArrowLeft className="w-6 h-6" /> もどる</button>
        <div className="flex gap-2 sm:gap-4 flex-wrap justify-end">
          {!showLegendTable && mapCount > 0 && (
             <button type="button" onClick={() => setRotateMap(!rotateMap)} className={`flex items-center gap-2 px-4 py-3 sm:py-4 rounded-xl font-bold shadow-lg transition-all ${rotateMap ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border-2 border-indigo-600'}`}>
               <RotateCw className={`w-5 h-5 transition-transform duration-300 ${rotateMap ? 'rotate-90' : ''}`} /> 
               {rotateMap ? '図面を縦に戻す' : '図面を90°回転して最大化'}
             </button>
          )}
          <button type="button" onClick={handleZipExport} disabled={isZipping || isPrinting} className="flex items-center gap-2 bg-green-600 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-xl font-bold shadow-lg hover:bg-green-700 disabled:opacity-50"><Download className="w-5 h-5" />写真のみ(Zip)</button>
          <button type="button" onClick={handlePrint} disabled={isZipping || isPrinting} className="flex items-center gap-2 bg-black text-white px-5 sm:px-8 py-3 sm:py-4 rounded-xl font-bold shadow-lg hover:bg-gray-800 disabled:opacity-50"><Printer className="w-5 h-5" /> {isPrinting ? (printProgress || '画像処理中...') : 'PDF作成・印刷'}</button>
        </div>
      </div>

      {error && <div className="w-full max-w-2xl mb-4 no-print"><ErrorMessage message={error} onDismiss={() => setError(null)} /></div>}

      <div className={`pdf-container-wrapper w-full ${isPrinting ? 'block' : 'flex flex-col items-center gap-8'}`}>
        
        {/* ① 表紙ページ */}
        <div style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
          <div className={`pdf-page flex flex-col items-center bg-white text-black ${isPrinting ? "" : "absolute top-0 left-0 origin-top-left"}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX}px`, padding: isPrinting ? '8mm' : '15mm', transform: isPrinting ? 'none' : `scale(${scale})` }}>
            <div className="flex flex-col items-center w-full justify-center flex-1">
              <div className="shrink-0 flex justify-center mb-6">
                {logoUrl ? <img src={proxyUrl(logoUrl, `logo_${sessionId}`)} data-original-src={logoUrl} alt="自社ロゴ" className="block h-auto object-contain" style={{ width: '151px' }} crossOrigin="anonymous" /> : <img src={kawaraLogo} data-original-src={kawaraLogo} alt="標準ロゴ" className="block h-auto object-contain grayscale" style={{ width: '121px' }} crossOrigin="anonymous" />}
              </div>
              <div className="flex flex-col items-center mb-12">
                <h1 className="text-[48px] font-bold tracking-[0.3em] mb-4 text-center">工事写真報告書</h1>
                <div className="w-[160mm] border-b-[4px] border-black" />
                <div className="w-[160mm] border-b-[1px] border-black mt-1.5" />
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
            </div>
            {userSettings && (address || phone) && (
              <div className="absolute bottom-[16mm] right-[15mm] text-right flex flex-col items-end pl-4 py-1 bg-white">
                {companyName && <div className="text-[18px] font-bold mb-1 text-black">{companyName}</div>}
                {address && <div className="text-[14px] font-bold text-gray-800">{address}</div>}
                {phone && <div className="text-[14px] font-bold text-gray-800">TEL: {phone}</div>}
              </div>
            )}
            {project.shareToken && (
              <div className="absolute bottom-[18mm] print:bottom-[12mm] left-[15mm] print:left-[8mm] flex flex-col items-center gap-1">
                <QRCodeSVG value={`${window.location.origin}/share/${id}/${project.shareToken}`} size={60} level="M" />
                <span className="text-[9px] text-gray-500">スマホで閲覧</span>
              </div>
            )}
            <div className="absolute bottom-[10mm] print:bottom-[2mm] right-[15mm] print:right-[8mm] text-[16px] font-bold text-black">- 1 / {totalPages} -</div>
          </div>
        </div>

        {/* ② 位置図ページ */}
        {mapUrlsToRender.map((u, mapIndex) => {
          // ★変更：ユーザーが画面上で回した角度（userRotation）は無視し、元の紙の向きで出力する！
          const printRotation = (!showLegendTable && rotateMap) ? 90 : 0;
          const totalRotation = printRotation;
          
          return (
            <div key={`map-page-${mapIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
              <div className={`pdf-page w-full h-full flex flex-col bg-white text-black ${isPrinting ? "" : "absolute top-0 left-0 origin-top-left"}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX}px`, padding: isPrinting ? '8mm' : '15mm', transform: isPrinting ? 'none' : `scale(${scale})` }}>
                
                <div className={`w-full h-full flex flex-col ${showLegendTable ? 'border-[3px] border-gray-800 print:border-black p-6 print:p-2' : 'p-1'}`}>
                  <h2 className={`text-2xl font-bold text-gray-900 shrink-0 ${showLegendTable ? 'border-gray-800 print:border-black mb-4 pb-2 border-b-2 print:mb-2' : 'mb-2'}`}>
                    位置図 {mapCount > 1 ? `(${mapIndex + 1}/${mapCount})` : ''}
                  </h2>
                  
                  <div className={`flex-1 relative flex items-center justify-center overflow-visible bg-gray-50 print:bg-white ${showLegendTable ? 'p-2 border border-gray-400 print:border-gray-500' : 'p-0'}`}>
                    {u ? (
                      <div className="flex items-center justify-center w-full h-full relative">

                        <div
                          style={{
                            display: 'inline-block',
                            position: 'relative',
                            transform: `rotate(${totalRotation}deg)`,
                            transformOrigin: 'center center',
                            flexShrink: 0,
                          }}
                        >
                          <img
                            src={proxyUrl(u, `map_${mapIndex}_${sessionId}`)}
                            data-original-src={u}
                            crossOrigin="anonymous"
                            style={(!showLegendTable && rotateMap) ? {
                              display: 'block',
                              width: 'auto',
                              height: 'auto',
                              maxWidth: '175mm',
                              maxHeight: '255mm',
                            } : {
                              display: 'block',
                              width: 'auto',
                              height: 'auto',
                              maxWidth: '100%',
                              maxHeight: showLegendTable ? (isPrinting ? '130mm' : '150mm') : (isPrinting ? '230mm' : '265mm'),
                            }}
                            alt=""
                          />
                          
                          {/* 白塗りシール */}
                          {((project as any).whiteoutBoxes ?? []).filter((b: any) => b.mapIndex === mapIndex).map((box: any) => (
                            <div key={box.id} className="absolute bg-white" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%`, transform: 'translate(-50%, -50%)', zIndex: 5 }} />
                          ))}

                          {/* ★変更：ピンの文字は図面と一緒に回るので逆回転補正を削除 */}
                          {(project.mapPins ?? []).filter(p => p.mapIndex === mapIndex).map(pin => (
                              <div key={pin.id} style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: `translate(-50%, -50%)`, zIndex: 10 }} className="absolute">
                                <div style={{ transform: `scale(${pin.size ?? 1})` }}>
                                  {pin.type === 'arrow' ? (
                                    <div className="flex items-center gap-1 px-1 rounded bg-white/70 border border-red-200"><span className="font-bold text-[24px] text-red-600" style={{ transform: `rotate(${pin.rotation ?? 0}deg)` }}>➡</span><span className="font-bold text-[20px] text-red-600">{pin.label}</span></div>
                                  ) : (
                                    <div className="relative flex items-center justify-center"><div className="w-[14mm] h-[14mm] rounded-full border-[4px] border-red-600 bg-red-600/10" /><span className="absolute font-bold text-[18px] px-1 rounded text-red-600 bg-white/70">{pin.label}</span></div>
                                  )}
                                </div>
                              </div>
                          ))}
                          
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
                                  <line
                                    x1={`${line.start.x}%`} y1={`${line.start.y}%`}
                                    x2={`${line.end.x}%`} y2={`${line.end.y}%`}
                                    stroke={color} strokeWidth={thickness} fill="none"
                                    markerStart={`url(#cad-tick-pdf-map-${line.id})`}
                                    markerEnd={`url(#cad-tick-pdf-map-${line.id})`}
                                  />
                                </svg>
                                {line.text && (
                                  <div
                                    style={{
                                      left: `${midX}%`,
                                      top: `${midY}%`,
                                      color: color,
                                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
                      </div>
                    ) : <span className="font-bold text-gray-400">位置図未登録</span>}
                  </div>
                  
                  {showLegendTable && (
                    <div className="mt-4 shrink-0">
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
                  )}
                </div>
                <div className="absolute bottom-[10mm] print:bottom-[2mm] right-[15mm] print:right-[8mm] text-xs font-bold text-gray-500 shrink-0">- {2 + mapIndex} / {totalPages} -</div>
              </div>
            </div>
          );
        })}

        {/* ③ 写真ページ */}
        {photoPages.map((chunk, pageIndex) => (
          <div key={`photo-page-${pageIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div className={`pdf-page w-full h-full flex flex-col bg-white text-black ${isPrinting ? "" : "absolute top-0 left-0 origin-top-left"}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX}px`, padding: isPrinting ? '8mm' : '15mm', transform: isPrinting ? 'none' : `scale(${scale})` }}>
              <div className="flex-1 w-full h-full flex flex-col justify-between gap-2 p-1.5 border-[3px] border-gray-800 bg-white min-h-0 overflow-hidden print:border-black print:gap-2">
                {chunk.map((p, i) => {
                  const isRotated = (Number(p.rotation) || 0) % 180 !== 0;
                  const maxImgWidth = isRotated ? '78mm' : '100%';
                  const maxImgHeight = isRotated ? '120mm' : '78mm';

                  return (
                    <div key={i} className="flex-1 flex gap-2 p-1.5 rounded border border-gray-500 bg-white min-h-0 print:border-black">
                      <div className="w-[60%] h-full flex items-center justify-center overflow-hidden relative border border-gray-400 bg-gray-50 shrink-0 print:bg-white print:border-gray-500">
                        {p.image ? (
                          <div className="relative" style={{ display: 'inline-block' }}>
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
                                transform: `rotate(${Number(p.rotation) || 0}deg)`
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
                                        fontSize: `${dynamicFontSize}px`
                                      }}
                                      className="absolute z-20 translate-x-[-50%] translate-y-[-50%] font-bold px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap"
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
              <div className="absolute bottom-[10mm] print:bottom-[2mm] right-[15mm] print:right-[8mm] text-xs font-bold text-gray-500 shrink-0">- {2 + mapCount + pageIndex} / {totalPages} -</div>
            </div>
          </div>
        ))}

        {/* ④ 使用材料表 */}
        {materialPages.map((chunk, pageIndex) => (
          <div key={`material-page-${pageIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div className={`pdf-page w-full h-full flex flex-col bg-white text-black ${isPrinting ? "" : "absolute top-0 left-0 origin-top-left"}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `265mm` : `${A4_HEIGHT_PX}px`, padding: isPrinting ? '8mm' : '15mm', transform: isPrinting ? 'none' : `scale(${scale})` }}>
              <h2 className="text-xl font-bold pb-1 mb-2 border-b-2 border-gray-800 shrink-0 print:border-black print:pb-0 print:mb-1">使用材料表</h2>
              <div className="flex-1 w-full h-full flex flex-col justify-between gap-2 p-1.5 border-[3px] border-gray-800 bg-white min-h-0 overflow-hidden print:border-black print:gap-2">
                {chunk.map((m, i) => {
                  const isRotated = (Number(m.rotation) || 0) % 180 !== 0;
                  const maxImgWidth = isRotated ? '78mm' : '100%';
                  const maxImgHeight = isRotated ? '120mm' : '78mm';

                  return (
                    <div key={i} className="flex-1 flex gap-2 p-1.5 rounded border border-gray-500 bg-white min-h-0 print:border-black">
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
              <div className="absolute bottom-[10mm] print:bottom-[2mm] right-[15mm] print:right-[8mm] text-xs font-bold text-gray-500 shrink-0">- {2 + mapCount + photoPages.length + pageIndex} / {totalPages} -</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}