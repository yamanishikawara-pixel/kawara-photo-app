import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Circle, MapRow, Photo, Project, Material } from '../types';
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

// ==========================================
// ★ ロード画面で表示されるランダムTIPS（豆知識）の辞書
// ==========================================
const LOADING_TIPS = [
  "現場の安全第一！今日も一日ご安全に。",
  "高画質な画像データを圧縮・変換しています...",
  "写真がない枠は、自動的にPDFから除外されて綺麗に詰まります。",
  "赤丸はダブルタップ（2回連続タップ）で一瞬で消すことができます。",
  "魔法の言葉（定型文）は、いつでも自由に追加・変更できます。",
  "位置図は最大3枚まで登録可能！現場に合わせて使い分けましょう。",
  "Zipダウンロードを使えば、元請けへ「写真だけ」を爆速で送れます。",
  "オフライン状態でも、現場での写真登録や文字入力は可能です。",
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

export default function PdfExportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectWithOptionals | null>(null);
  const [userSettings, setUserSettings] = useState<any>(null); 
  
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'pdf' | 'zip' | null>(null); // ★ ロード画面の切り替え用
  const [currentTip, setCurrentTip] = useState(LOADING_TIPS[0]); // ★ 現在のTIPS
  
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
          if (s.exists()) setUserSettings(s.data());
        }
      } catch (err) {
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
      // ★ ロード画面をONにして、ランダムなTIPSを選ぶ
      setCurrentTip(LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);
      setLoadingMode('zip');
      setIsZipping(true);
      setError(null);

      // 画面の描画を待つための深呼吸
      await new Promise((r) => setTimeout(r, 100));

      const zip = new JSZip();
      const folderName = project.projectName || '現場写真';
      const imgFolder = zip.folder(folderName);

      if (!imgFolder) throw new Error("フォルダ作成失敗");

      const activePhotos = (project.photos ?? []).filter(p => p.image);

      if (activePhotos.length === 0) {
        setError("ダウンロードする写真がありません。");
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
        } catch (err) {
          console.error(`写真 ${p.photoNumber} の取得に失敗`, err);
        }
      });

      await Promise.all(promises);

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${folderName}.zip`);

    } catch (err) {
      console.error(err);
      setError('Zipファイルの作成に失敗しました。');
    } finally {
      setIsZipping(false);
      setLoadingMode(null);
    }
  };

  const handleExport = async () => {
    if (!project) return;
    try {
      const pages = document.querySelectorAll('.pdf-page');
      if (pages.length === 0) return;
      
      // ★ ロード画面をONにして、ランダムなTIPSを選ぶ
      setCurrentTip(LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);
      setLoadingMode('pdf');
      setIsExporting(true);
      setError(null);
      window.scrollTo(0, 0);

      // Chromeなら待機時間は最小限でOK（ロード画面を出すために少しだけ待つ）
      await new Promise((r) => setTimeout(r, 300));

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement;
        pageEl.scrollIntoView({ behavior: 'instant', block: 'center' });
        
        await new Promise((r) => setTimeout(r, 300)); // スムーズなスクロール待機のみ

        const currentTransform = pageEl.style.transform;
        pageEl.style.transform = 'scale(1)';

        // Chrome専用：一切の制限なく、最高画質（1.5）で一発出力！
        const dataUrl = await toJpeg(pageEl, {
          quality: 0.98,
          pixelRatio: 1.5,
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
    while (chunk.length < 3) chunk.push(createEmptyPhoto());
    photoPages.push(chunk);
  }

  const activeMaterials = (project.materials ?? []).filter(
    (m) => m.image || m.name || m.manufacturer || m.specification || m.remarks
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

  const wrapperStyle = { width: `${A4_WIDTH_PX * scale}px`, height: `${A4_HEIGHT_PX * scale}px` };
  const pageStyle = { width: `${A4_WIDTH_PX}px`, height: `${A4_HEIGHT_PX}px`, padding: '15mm', transform: `scale(${scale})` };

  return (
    <div className="min-h-screen bg-gray-200 p-4 sm:p-6 font-sans flex flex-col items-center pb-12 overflow-x-hidden w-full relative">
      
      {/* ==========================================
          ★ 超カッコいい Now Loading 画面の演出 
         ========================================== */}
      {loadingMode && (
        <div className="fixed inset-0 z-50 bg-gray-900/95 flex flex-col items-center justify-center text-white p-6 backdrop-blur-md transition-all duration-300">
          <div className="w-24 h-24 border-4 border-gray-700 border-t-red-500 rounded-full animate-spin mb-8 shadow-[0_0_30px_rgba(239,68,68,0.5)]"></div>
          <h2 className="text-4xl font-black tracking-[0.2em] mb-4 animate-pulse text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">NOW LOADING...</h2>
          <p className="text-gray-300 font-bold text-xl mb-12">
            {loadingMode === 'pdf' ? '超高画質PDF台帳を生成しています...' : '全写真をZipファイルにまとめています...'}
          </p>
          
          <div className="max-w-lg w-full bg-gray-800 border border-gray-700 p-6 rounded-2xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-red-500"></div>
            <p className="text-red-400 font-bold mb-3 text-sm tracking-wider">💡 現場のTIPS</p>
            <p className="text-white font-medium leading-relaxed text-lg">{currentTip}</p>
          </div>
        </div>
      )}
      {/* ========================================== */}

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
        
        {/* ① 表紙ページ */}
        <div style={wrapperStyle} className="relative bg-white shadow-md shrink-0">
          <div className="pdf-page absolute top-0 left-0 bg-white flex flex-col items-center origin-top-left text-black" style={{ ...pageStyle, padding: '25mm' }}>
            <div className="mt-[5mm] mb-[30mm] flex flex-col items-center w-full">
              
              <div className="shrink-0 flex justify-center mb-6">
                {userSettings?.logoUrl ? (
                  <img src={proxyUrl(userSettings.logoUrl, `logo_${sessionId}`)} alt="自社ロゴ" className="block w-[40mm] h-auto object-contain" crossOrigin="anonymous" />
                ) : (
                  <img src={kawaraLogo} alt="標準ロゴ" className="block w-[32mm] h-auto object-contain grayscale" crossOrigin="anonymous" />
                )}
              </div>
              
              <div className="flex flex-col items-center">
                <h1 className="text-[52px] font-black tracking-[0.4em] mb-4 text-center">工事写真報告書</h1>
                <div className="w-[160mm] border-b-[4px] border-black"></div>
                <div className="w-[160mm] border-b-[1px] border-black mt-1.5"></div>
              </div>
            </div>
            <div className="w-[150mm] space-y-[14mm]">
              {COVER_FIELDS.map((item, idx) => {
                let value = String(project[item.key] ?? '　');
                if (item.key === 'contractorName' && userSettings?.companyName) {
                  value = userSettings.companyName;
                }
                return (
                  <div key={idx} className="flex items-baseline border-b-2 border-black pb-2">
                    <div className="w-[45mm] flex-shrink-0 flex justify-between text-[24px] font-bold pr-8">
                      {item.label.split('').map((c: string, i: number) => <span key={i}>{c}</span>)}
                    </div>
                    <div className="flex-1 text-[32px] font-black whitespace-nowrap overflow-hidden">
                      {value}
                    </div>
                  </div>
                );
              })}
            </div>

            {userSettings && (userSettings.address || userSettings.phone) && (
              <div className="absolute bottom-[16mm] right-[15mm] text-right flex flex-col items-end bg-white pl-4 py-1">
                {userSettings.companyName && <div className="text-[18px] font-bold mb-1">{userSettings.companyName}</div>}
                {userSettings.address && <div className="text-[14px] text-gray-800">{userSettings.address}</div>}
                {userSettings.phone && <div className="text-[14px] text-gray-800">TEL: {userSettings.phone}</div>}
              </div>
            )}

            <div className="absolute bottom-[10mm] right-[15mm] text-[16px] font-bold">- 1 / {totalPages} -</div>
          </div>
        </div>

        {/* ② 位置図ページ */}
        {mapUrlsToRender.map((u, mapIndex) => (
          <div key={`map-page-${mapIndex}`} style={wrapperStyle} className="relative bg-white shadow-md shrink-0">
            <div className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left" style={pageStyle}>
              <div className="w-full h-full border-[3px] border-gray-800 p-6 flex flex-col">
                <h2 className="text-2xl font-bold mb-4 border-b-2 border-gray-800 pb-2">位置図 {mapCount > 1 ? `(${mapIndex + 1}/${mapCount})` : ''}</h2>
                <div className="border border-gray-400 p-2 bg-gray-50 flex-1 flex items-center justify-center overflow-hidden min-h-0">
                  {u ? (
                    <div className="flex items-center justify-center w-full h-full">
                      <div className="relative inline-block">
                        <img src={proxyUrl(u, `map_${mapIndex}_${sessionId}`)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-[150mm]" alt="" />
                        {(project.mapPins ?? []).filter((p) => p.mapIndex === mapIndex).map((pin) => (
                            <div key={pin.id} style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: 'translate(-50%, -50%)' }} className="absolute z-10">
                              {pin.type === 'arrow' ? (
                                <div className="flex items-center gap-1 bg-white/70 px-1 rounded border border-red-200">
                                  <span className="text-red-600 font-black text-[24px]" style={{ transform: `rotate(${pin.rotation ?? 0}deg)` }}>➡</span>
                                  <span className="text-red-600 font-bold text-[20px]">{pin.label}</span>
                                </div>
                              ) : (
                                <div className="relative flex items-center justify-center">
                                  <div className="w-[14mm] h-[14mm] rounded-full border-[4px] border-red-600 bg-red-600/10" />
                                  <span className="absolute text-red-600 font-bold text-[18px] bg-white/70 px-1 rounded">{pin.label}</span>
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400 font-bold">位置図未登録</span>
                  )}
                </div>
                <div className="mt-4">
                  <div className="text-base font-bold mb-2">項目欄</div>
                  <div className="border-2 border-gray-800">
                    <div className="grid grid-cols-12 border-b-2 border-gray-800 bg-gray-100 text-base font-bold">
                      <div className="col-span-1 border-r-2 border-gray-800 p-2 text-center">符号</div>
                      <div className="col-span-2 border-r-2 border-gray-800 p-2 text-center">部位</div>
                      <div className="col-span-2 border-r-2 border-gray-800 p-2 text-center text-sm">写真NO</div>
                      <div className="col-span-7 p-2 text-center">備考</div>
                    </div>
                    {(() => {
                      const rows: MapRow[] = project.mapRows ?? [];
                      const currentRows = rows.filter((r) => r.mapIndex === mapIndex || (r.mapIndex === undefined && mapIndex === 0));
                      const displayRows = currentRows.length > 0 ? currentRows.slice(0, 6) : Array.from({ length: 6 }, () => ({ symbol: '　', part: '　', photoNo: '　', remarks: '　' }));
                      return displayRows.map((row: any, idx: number) => (
                        <div key={row.id ?? idx} className="grid grid-cols-12 border-b border-gray-400 text-base">
                          <div className="col-span-1 border-r border-gray-400 p-2 font-bold text-red-700 whitespace-nowrap overflow-hidden text-center">{row.symbol ?? '　'}</div>
                          <div className="col-span-2 border-r border-gray-400 p-2 whitespace-nowrap overflow-hidden">{row.part ?? '　'}</div>
                          <div className="col-span-2 border-r border-gray-400 p-2 whitespace-nowrap overflow-hidden text-center text-sm">{row.photoNo ?? row.relatedPhotoNumber ?? '　'}</div>
                          <div className="col-span-7 p-2 overflow-hidden">{row.remarks ?? '　'}</div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
              <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- {2 + mapIndex} / {totalPages} -</div>
            </div>
          </div>
        ))}

        {/* ③ 写真ページ */}
        {photoPages.map((chunk, pageIndex) => (
          <div key={`photo-page-${pageIndex}`} style={wrapperStyle} className="relative bg-white shadow-md shrink-0">
            <div className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left" style={pageStyle}>
              <div className="flex-1 flex flex-col justify-between border-[3px] border-gray-800 p-2">
                {chunk.map((p, i) => (
                  <div key={i} className="flex gap-2 h-[32%] border border-gray-500 p-2 rounded">
                    <div className="w-[60%] border-2 border-gray-700 flex items-center justify-center bg-gray-50 overflow-hidden relative min-h-0">
                      {p.image ? (
                        <div className="flex items-center justify-center w-full h-full">
                          <div className="relative inline-block" style={{ transform: `rotate(${(p as Photo).rotation ?? 0}deg)`, transformOrigin: 'center center' }}>
                            <img src={proxyUrl(p.image, `photo_${p.id}_${sessionId}`)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-[88mm]" alt="" />
                            {(p.circles ?? []).map((circle) => (
                              <div key={circle.id} style={{ left: `${circle.x}%`, top: `${circle.y}%`, width: `${circle.size}%`, transform: 'translate(-50%, -50%)' }} className="absolute aspect-square rounded-full border-[3px] border-red-600" />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 font-bold">写真未登録</span>
                      )}
                    </div>
                    <div className="w-[40%] flex flex-col text-sm border-2 border-gray-700 bg-white">
                      <div className="flex border-b border-gray-400"><div className="w-16 bg-gray-100 p-2 border-r border-gray-400 font-bold flex items-center justify-center text-xs">写真NO</div><div className="p-2 flex-1 font-bold text-sm flex items-center">{p.photoNumber || '　'}</div></div>
                      <div className="flex border-b border-gray-400"><div className="w-16 bg-gray-100 p-2 border-r border-gray-400 font-bold flex items-center justify-center">撮影日</div><div className="p-2 flex-1 flex items-center font-medium">{p.shootingDate || '　'}</div></div>
                      <div className="flex border-b border-gray-400"><div className="w-16 bg-gray-100 p-2 border-r border-gray-400 font-bold flex items-center justify-center">位置図</div><div className="p-2 flex-1 font-bold text-red-700 flex items-center">{p.locationMap || '　'}</div></div>
                      <div className="flex border-b border-gray-400"><div className="w-16 bg-gray-100 p-2 border-r border-gray-400 font-bold flex items-center justify-center">工程</div><div className="p-2 flex-1 flex items-center font-medium">{p.process || '　'}</div></div>
                      <div className="flex-1 flex min-h-0"><div className="w-16 bg-gray-100 p-2 border-r border-gray-400 font-bold flex items-center justify-center">説明</div><div className="p-2 flex-1 whitespace-pre-wrap overflow-hidden font-medium leading-relaxed">{p.description || '　'}</div></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- {2 + mapCount + pageIndex} / {totalPages} -</div>
            </div>
          </div>
        ))}

        {/* ④ 使用材料表 */}
        {materialPages.map((chunk, pageIndex) => (
          <div key={`material-page-${pageIndex}`} style={wrapperStyle} className="relative bg-white shadow-md shrink-0">
            <div className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left" style={pageStyle}>
              <div className="w-full flex justify-between items-end mb-2">
                <h2 className="text-2xl font-bold border-b-2 border-gray-800 pb-1">使用材料表</h2>
              </div>
              <div className="flex-1 flex flex-col justify-between border-[3px] border-gray-800 p-2">
                {chunk.map((m, i) => (
                  <div key={i} className="flex gap-2 h-[32%] border border-gray-500 p-2 rounded">
                    <div className="w-[60%] border-2 border-gray-700 flex items-center justify-center bg-gray-50 overflow-hidden relative min-h-0">
                      {m.image ? (
                        <div className="flex items-center justify-center w-full h-full">
                          <div className="relative inline-block" style={{ transform: `rotate(${m.rotation ?? 0}deg)`, transformOrigin: 'center center' }}>
                            <img src={proxyUrl(m.image, `material_${m.id}_${sessionId}`)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-[85mm]" alt="" />
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 font-bold">写真未登録</span>
                      )}
                    </div>
                    <div className="w-[40%] flex flex-col text-sm border-2 border-gray-700 bg-white">
                      <div className="flex border-b border-gray-400">
                        <div className="w-24 bg-gray-100 p-2 border-r border-gray-400 font-bold flex items-center justify-center text-center">品名</div>
                        <div className="p-2 flex-1 font-bold text-base overflow-hidden flex items-center">{m.name || '　'}</div>
                      </div>
                      <div className="flex border-b border-gray-400">
                        <div className="w-24 bg-gray-100 p-2 border-r border-gray-400 font-bold flex items-center justify-center text-center">メーカー</div>
                        <div className="p-2 flex-1 overflow-hidden font-medium flex items-center">{m.manufacturer || '　'}</div>
                      </div>
                      <div className="flex border-b border-gray-400">
                        <div className="w-24 bg-gray-100 p-2 border-r border-gray-400 font-bold text-xs flex items-center justify-center text-center leading-tight">規格・寸法<br/>数量</div>
                        <div className="p-2 flex-1 font-bold text-red-700 overflow-hidden flex items-center">{m.specification || '　'}</div>
                      </div>
                      <div className="flex-1 flex min-h-0">
                        <div className="w-24 bg-gray-100 p-2 border-r border-gray-400 font-bold flex items-center justify-center text-center">備考</div>
                        <div className="p-2 flex-1 whitespace-pre-wrap overflow-hidden font-medium leading-relaxed">{m.remarks || '　'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- {2 + mapCount + photoPages.length + pageIndex} / {totalPages} -</div>
            </div>
          </div>
        ))}

      </div>
    </div>
  );
}