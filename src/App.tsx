import { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Camera, Map, FileText, Trash2, Images, ChevronRight, List, BookOpen, ArrowLeft, Plus, Building2 } from 'lucide-react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

const ROOF_PARTS = ["本棟", "隅棟", "軒先", "袖右", "袖左", "平部", "流れ壁", "平行壁", "谷", "その他"];

// --- 画像圧縮機能 ---
function compressImage(file: File, callback: (compressedUrl: string) => void) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.8));
    };
    if (typeof e.target?.result === 'string') img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// 🌟 記憶箱（Store）: 複数現場対応版
const useStore = create(
  persist(
    (set: any, get: any) => ({
      projects: [
        {
          id: 'default',
          projectName: "新規現場",
          projectLocation: "",
          constructionPeriod: "",
          contractorName: "山西瓦店",
          creationDate: new Date().toLocaleDateString('ja-JP'),
          photos: Array.from({ length: 40 }, (_, i) => ({
            id: i, image: null, photoNumber: "", shootingDate: "", locationMap: "", process: "", description: "",
          })),
          mapImage: null,
          mapRows: [{ id: 1, symbol: "", part: "本棟", relatedPhotoNumber: "" }],
        }
      ],
      currentProjectId: 'default',

      // 現場の切り替え
      setCurrentProject: (id: string) => set({ currentProjectId: id }),

      // 新規現場の追加
      addProject: () => {
        const newId = Date.now().toString();
        const newProject = {
          id: newId,
          projectName: "新しい現場",
          projectLocation: "",
          constructionPeriod: "",
          contractorName: "山西瓦店",
          creationDate: new Date().toLocaleDateString('ja-JP'),
          photos: Array.from({ length: 40 }, (_, i) => ({
            id: i, image: null, photoNumber: "", shootingDate: "", locationMap: "", process: "", description: "",
          })),
          mapImage: null,
          mapRows: [{ id: 1, symbol: "", part: "本棟", relatedPhotoNumber: "" }],
        };
        set((state: any) => ({
          projects: [...state.projects, newProject],
          currentProjectId: newId
        }));
      },

      // 現場の削除
      deleteProject: (id: string) => set((state: any) => {
        const filtered = state.projects.filter((p: any) => p.id !== id);
        return {
          projects: filtered.length > 0 ? filtered : state.projects,
          currentProjectId: filtered.length > 0 ? filtered[0].id : state.currentProjectId
        };
      }),

      // 現在の現場データの更新
      updateCurrentProject: (field: string, value: any) => set((state: any) => ({
        projects: state.projects.map((p: any) => 
          p.id === state.currentProjectId ? { ...p, [field]: value } : p
        )
      })),

      // 写真データの更新
      updatePhoto: (id: number, field: string, value: any) => set((state: any) => ({
        projects: state.projects.map((p: any) => 
          p.id === state.currentProjectId ? {
            ...p,
            photos: p.photos.map((photo: any) => photo.id === id ? { ...photo, [field]: value } : photo)
          } : p
        )
      })),

      // 位置図対応表の更新
      updateMapRow: (rowId: number, field: string, value: any) => set((state: any) => ({
        projects: state.projects.map((p: any) => 
          p.id === state.currentProjectId ? {
            ...p,
            mapRows: p.mapRows.map((row: any) => row.id === rowId ? { ...row, [field]: value } : row)
          } : p
        )
      })),

      addMapRow: () => set((state: any) => ({
        projects: state.projects.map((p: any) => 
          p.id === state.currentProjectId ? {
            ...p,
            mapRows: [...p.mapRows, { id: Date.now(), symbol: "", part: "本棟", relatedPhotoNumber: "" }]
          } : p
        )
      })),

      removeMapRow: (rowId: number) => set((state: any) => ({
        projects: state.projects.map((p: any) => 
          p.id === state.currentProjectId ? {
            ...p,
            mapRows: p.mapRows.filter((r: any) => r.id !== rowId)
          } : p
        )
      })),
    }),
    { name: 'kawara-multi-project-storage' }
  )
);

// --- ヘルパー関数: 現在の現場を取得 ---
const useCurrentProject = () => {
  const { projects, currentProjectId } = useStore() as any;
  return projects.find((p: any) => p.id === currentProjectId) || projects[0];
};

// --- 共通部品 ---
function MenuButton({ title, subtitle, icon: Icon, colorClass, onClick }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-2xl border border-black/5 shadow-sm hover:shadow-md transition-all text-left ${colorClass}`}>
      <div className="w-[52px] h-[52px] flex-shrink-0 flex items-center justify-center bg-white/95 rounded-[14px] shadow-sm"><Icon className="w-5 h-5 text-gray-800" /></div>
      <div className="flex-1"><div className="text-lg font-bold text-gray-900">{title}</div><div className="text-xs text-gray-500 line-clamp-2">{subtitle}</div></div>
      <ChevronRight className="w-5 h-5 text-gray-400" />
    </button>
  );
}

function InputField({ label, placeholder, value, onChange, bgColor }: any) {
  return (
    <div className={`p-4 rounded-xl mb-4 ${bgColor}`}>
      <label className="block text-sm font-bold text-gray-800 mb-2">{label}</label>
      <input type="text" className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// 🌟 画面：現場一覧
function ProjectListScreen() {
  const navigate = useNavigate();
  const { projects, setCurrentProject, addProject, deleteProject, currentProjectId } = useStore() as any;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto space-y-6 pb-12">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-blue-500 mb-4 font-bold"><ArrowLeft className="w-5 h-5" /> もどる</button>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">現場一覧</h1>
          <button onClick={addProject} className="flex items-center gap-1 bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-transform">
            <Plus className="w-4 h-4" /> 新規現場
          </button>
        </div>

        <div className="space-y-3">
          {projects.map((p: any) => (
            <div key={p.id} className={`relative flex items-center p-4 rounded-2xl border transition-all ${p.id === currentProjectId ? 'bg-blue-50 border-blue-200 shadow-md ring-2 ring-blue-500/20' : 'bg-white border-black/5 shadow-sm'}`}>
              <div className="flex-1 cursor-pointer" onClick={() => { setCurrentProject(p.id); navigate('/'); }}>
                <div className="font-bold text-gray-900">{p.projectName || "未入力の現場"}</div>
                <div className="text-xs text-gray-500 mt-1">{p.projectLocation || "場所未登録"}</div>
                <div className="text-[10px] text-gray-400 mt-1">作成日: {p.creationDate}</div>
              </div>
              {projects.length > 1 && (
                <button onClick={() => window.confirm('この現場データを完全に削除しますか？') && deleteProject(p.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- 画面：トップ ---
function HomeScreen() {
  const navigate = useNavigate();
  const project = useCurrentProject();
  const currentSiteName = project.projectName !== "" ? project.projectName : "現場名未入力";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 p-6 font-sans">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex flex-col items-center py-8 px-4 bg-white/80 backdrop-blur-sm rounded-3xl border border-black/5 shadow-sm">
          <div className="w-[78px] h-[78px] bg-blue-100/50 rounded-full flex items-center justify-center mb-4"><Images className="w-8 h-8 text-blue-500" /></div>
          <h1 className="text-2xl font-bold mb-2 text-gray-900">瓦工事 写真台帳</h1>
          <p className="text-sm text-gray-500 text-center mb-4">現場ごとに写真と位置図を管理</p>
          <button onClick={() => navigate('/list')} className="flex items-center gap-2 text-xs font-bold text-blue-700 bg-blue-100/80 px-4 py-2 rounded-full hover:bg-blue-200 transition-colors">
            <Building2 className="w-3 h-3" /> 現場切替: {currentSiteName}
          </button>
        </div>
        <div className="space-y-3">
          <MenuButton title="現場一覧" subtitle="現場の切り替え・新規追加・削除" icon={List} colorClass="bg-teal-100/30" onClick={() => navigate('/list')} />
          <MenuButton title="表紙" subtitle="現場名・住所・工期の入力" icon={BookOpen} colorClass="bg-purple-100/30" onClick={() => navigate('/cover')} />
          <MenuButton title="写真" subtitle="工事写真の撮影・登録（最大40枚）" icon={Camera} colorClass="bg-blue-100/30" onClick={() => navigate('/photo')} />
          <MenuButton title="位置図" subtitle="図面登録と対応表の作成" icon={Map} colorClass="bg-green-100/30" onClick={() => navigate('/map')} />
          <MenuButton title="PDF出力" subtitle="黄金比レイアウトで書き出し" icon={FileText} colorClass="bg-orange-100/30" onClick={() => navigate('/pdf')} />
        </div>
      </div>
    </div>
  );
}

// --- 画面：表紙 ---
function CoverScreen() {
  const navigate = useNavigate();
  const project = useCurrentProject();
  const { updateCurrentProject } = useStore() as any;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto pb-12">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-blue-500 mb-6 font-bold"><ArrowLeft className="w-5 h-5" /> もどる</button>
        <h1 className="text-2xl font-bold mb-6 text-gray-900">表紙の入力</h1>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-black/5">
          <InputField label="工事件名" placeholder="例: ○○様邸 屋根改修工事" value={project.projectName} onChange={(v: string) => updateCurrentProject('projectName', v)} bgColor="bg-blue-50/50" />
          <InputField label="工事場所" placeholder="例: 富山県魚津市○○町" value={project.projectLocation} onChange={(v: string) => updateCurrentProject('projectLocation', v)} bgColor="bg-green-50/50" />
          <InputField label="工期" placeholder="例: 令和8年3月〜令和8年4月" value={project.constructionPeriod} onChange={(v: string) => updateCurrentProject('constructionPeriod', v)} bgColor="bg-purple-50/50" />
          <InputField label="施工業者" placeholder="例: 山西瓦店" value={project.contractorName} onChange={(v: string) => updateCurrentProject('contractorName', v)} bgColor="bg-orange-50/50" />
          <InputField label="作成年月日" placeholder="例: 令和8年3月10日" value={project.creationDate} onChange={(v: string) => updateCurrentProject('creationDate', v)} bgColor="bg-gray-50/50" />
        </div>
      </div>
    </div>
  );
}

// --- 画面：写真 ---
function PhotoScreen() {
  const navigate = useNavigate();
  const project = useCurrentProject();
  const { updatePhoto } = useStore() as any;
  
  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto pb-12">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-blue-500 mb-6 font-bold"><ArrowLeft className="w-5 h-5" /> もどる</button>
        <h1 className="text-2xl font-bold mb-2 text-gray-900">写真の登録</h1>
        <div className="space-y-6 mt-4">
          {project.photos.map((photo: any, index: number) => (
            <div key={photo.id} className="bg-gray-100/50 p-4 rounded-2xl border border-black/5">
              <div className="flex gap-4 mb-4">
                <div className="w-24 h-20 bg-gray-200/50 rounded-xl flex items-center justify-center overflow-hidden border border-gray-300">
                  {photo.image ? <img src={photo.image} className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-gray-400" />}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-gray-800">写真 {index + 1}</div>
                  <label className="block w-full mt-2 text-center bg-blue-100/50 text-blue-700 font-bold py-2 rounded-lg cursor-pointer">
                    画像を選択 <input type="file" accept="image/*" className="hidden" onChange={(e: any) => {
                      if (e.target.files[0]) compressImage(e.target.files[0], (url) => {
                        updatePhoto(photo.id, "image", url);
                        updatePhoto(photo.id, "shootingDate", new Date().toLocaleDateString('ja-JP'));
                      });
                    }} />
                  </label>
                </div>
              </div>
              <div className="space-y-3">
                <input type="text" placeholder="写真NO 例: 1" className="w-full p-2 border border-gray-300 rounded-lg" value={photo.photoNumber} onChange={(e) => updatePhoto(photo.id, "photoNumber", e.target.value)} />
                <input type="text" placeholder="撮影位置図 例: A-1" className="w-full p-2 border border-gray-300 rounded-lg" value={photo.locationMap} onChange={(e) => updatePhoto(photo.id, "locationMap", e.target.value)} />
                <input type="text" placeholder="工程 例: 葺き直し" className="w-full p-2 border border-gray-300 rounded-lg" value={photo.process} onChange={(e) => updatePhoto(photo.id, "process", e.target.value)} />
                <textarea placeholder="説明（短文）" rows={2} className="w-full p-2 border border-gray-300 rounded-lg" value={photo.description} onChange={(e) => updatePhoto(photo.id, "description", e.target.value)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- 画面：位置図 ---
function MapScreen() {
  const navigate = useNavigate();
  const project = useCurrentProject();
  const { updateCurrentProject, updateMapRow, addMapRow, removeMapRow } = useStore() as any;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto pb-12">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-blue-500 mb-6 font-bold"><ArrowLeft className="w-5 h-5" /> もどる</button>
        <h1 className="text-2xl font-bold mb-6 text-gray-900">位置図の登録</h1>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 mb-6">
          <div className="w-full h-48 bg-gray-100 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300 mb-4 overflow-hidden relative">
            {project.mapImage ? <img src={project.mapImage} className="max-w-full max-h-full object-contain" /> : <span className="text-gray-400 font-bold">位置図未登録</span>}
          </div>
          <label className="block w-full text-center bg-green-100/50 text-green-700 font-bold py-3 rounded-lg cursor-pointer">
            画像を選択 <input type="file" accept="image/*" className="hidden" onChange={(e: any) => {
              if (e.target.files[0]) compressImage(e.target.files[0], (url) => updateCurrentProject('mapImage', url));
            }} />
          </label>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-800">対応表</h2>
            <button onClick={addMapRow} className="flex items-center gap-1 text-sm bg-gray-100 px-3 py-1 rounded-lg text-gray-700 font-bold"><Plus className="w-4 h-4" /> 行追加</button>
          </div>
          <div className="space-y-4">
            {project.mapRows.map((row: any) => (
              <div key={row.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg relative">
                <button onClick={() => removeMapRow(row.id)} className="absolute top-2 right-2 text-red-400"><Trash2 className="w-4 h-4" /></button>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input type="text" placeholder="符号" className="p-2 border rounded text-sm" value={row.symbol} onChange={(e) => updateMapRow(row.id, "symbol", e.target.value)} />
                  <input type="text" placeholder="写真NO" className="p-2 border rounded text-sm" value={row.relatedPhotoNumber} onChange={(e) => updateMapRow(row.id, "relatedPhotoNumber", e.target.value)} />
                </div>
                <select className="w-full p-2 border rounded text-sm bg-white" value={row.part} onChange={(e) => updateMapRow(row.id, "part", e.target.value)}>
                  {ROOF_PARTS.map(part => <option key={part} value={part}>{part}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- 画面：PDF出力 ---
function PDFExportScreen() {
  const navigate = useNavigate();
  const project = useCurrentProject();
  const pdfRef = useRef<HTMLDivElement>(null);

  const activePhotos = project.photos.filter((p: any) => p.image || p.photoNumber);
  const photoPages = [];
  for (let i = 0; i < (activePhotos.length || 3); i += 3) {
    const chunk = activePhotos.slice(i, i + 3);
    while (chunk.length < 3) chunk.push({ id: Math.random(), image: null, photoNumber: "", shootingDate: "", locationMap: "", process: "", description: "" });
    photoPages.push(chunk);
  }
  const totalPages = 2 + photoPages.length;

  const handleExport = async () => {
    try {
      const pages = document.querySelectorAll('.pdf-page');
      if (pages.length === 0) return;
      alert(`PDF作成中... 全${totalPages}ページあります。`);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement;
        await new Promise(resolve => setTimeout(resolve, 300));
        await toJpeg(pageEl, { cacheBust: true }); // Safari対策
        const dataUrl = await toJpeg(pageEl, { quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff' });
        const pdfHeight = (pageEl.offsetHeight * pdfWidth) / pageEl.offsetWidth;
        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }
      pdf.save(`${project.projectName || '写真台帳'}.pdf`);
    } catch (error: any) { alert("エラー: " + error.message); }
  };

  return (
    <div className="min-h-screen bg-gray-200 p-6 font-sans flex flex-col items-center pb-12">
      <div className="w-full max-w-2xl mb-6 flex justify-between items-center">
        <button onClick={() => navigate('/')} className="text-blue-500 font-bold flex items-center gap-2"><ArrowLeft className="w-5 h-5" /> もどる</button>
        <button onClick={handleExport} className="bg-orange-500 text-white px-6 py-3 rounded-xl font-bold shadow">ダウンロード</button>
      </div>

      <div className="overflow-auto w-full max-w-2xl bg-gray-300 p-4 rounded-xl flex flex-col gap-8">
        {/* 表紙 */}
        <div className="pdf-page bg-white relative shadow-md flex flex-col" style={{ width: '210mm', height: '297mm', padding: '20mm' }}>
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
              ].map((item, idx) => (
                <div key={idx} className="flex items-baseline border-b-2 border-gray-800 pb-1">
                  <div className="w-[50mm] flex-shrink-0 flex justify-between text-[20px] font-bold pr-16">
                    {item.label.split('').map((c, i) => <span key={i}>{c}</span>)}
                  </div>
                  <div className="flex-1 text-[20px] font-medium whitespace-nowrap overflow-hidden">{item.value || "　"}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- 1 / {totalPages} -</div>
        </div>

        {/* 位置図 */}
        <div className="pdf-page bg-white relative shadow-md flex flex-col" style={{ width: '210mm', height: '297mm', padding: '15mm' }}>
          <div className="w-full h-full border-[3px] border-gray-800 p-6 flex flex-col">
            <h2 className="text-2xl font-bold mb-4 border-b-2 border-gray-800 pb-2">位置図</h2>
            <div className="h-[45%] border border-gray-400 mb-6 flex items-center justify-center p-2 bg-gray-50">
              {project.mapImage && <img src={project.mapImage} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
            </div>
            <div className="flex-1 flex flex-col">
              <div className="flex bg-gray-200 border border-gray-800 font-bold text-center text-sm">
                <div className="w-1/4 border-r border-gray-800 p-2">符号</div>
                <div className="w-1/2 border-r border-gray-800 p-2">部位</div>
                <div className="w-1/4 p-2">写真NO</div>
              </div>
              {project.mapRows.map((row: any) => (
                <div key={row.id} className="flex border-b border-l border-r border-gray-800 text-center text-sm">
                  <div className="w-1/4 border-r border-gray-800 p-2">{row.symbol || "-"}</div>
                  <div className="w-1/2 border-r border-gray-800 p-2">{row.part}</div>
                  <div className="w-1/4 p-2">{row.relatedPhotoNumber || "-"}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- 2 / {totalPages} -</div>
        </div>

        {/* 写真 */}
        {photoPages.map((chunk, pageIndex) => (
          <div key={pageIndex} className="pdf-page bg-white relative shadow-md flex flex-col" style={{ width: '210mm', height: '297mm', padding: '15mm' }}>
            <div className="flex-1 flex flex-col justify-between border-[3px] border-gray-800 p-2">
              {chunk.map((p: any, i: number) => (
                <div key={i} className="flex gap-2 h-[32%] border border-gray-400 p-2 rounded">
                  <div className="w-[45%] border border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden">
                    {p.image && <img src={p.image} className="w-full h-full object-contain" />}
                  </div>
                  <div className="w-[55%] flex flex-col text-sm border border-gray-300 bg-white">
                    <div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">写真NO</div><div className="p-1 flex-1 font-bold">{p.photoNumber}</div></div>
                    <div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">撮影日</div><div className="p-1 flex-1">{p.shootingDate}</div></div>
                    <div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">位置図</div><div className="p-1 flex-1">{p.locationMap}</div></div>
                    <div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">工程</div><div className="p-1 flex-1">{p.process}</div></div>
                    <div className="flex-1 flex"><div className="w-20 bg-gray-100 p-1 border-r">説明</div><div className="p-1 flex-1 text-xs">{p.description}</div></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- {pageIndex + 3} / {totalPages} -</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 🌐 メインコンポーネント
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/list" element={<ProjectListScreen />} />
        <Route path="/cover" element={<CoverScreen />} />
        <Route path="/photo" element={<PhotoScreen />} />
        <Route path="/map" element={<MapScreen />} />
        <Route path="/pdf" element={<PDFExportScreen />} />
      </Routes>
    </BrowserRouter>
  );
}