import { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { Camera, Map, FileText, Trash2, Images, ChevronRight, List, BookOpen, ArrowLeft, Plus, Building2 } from 'lucide-react';
import { db, storage } from './firebase';
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, deleteDoc, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

const ROOF_PARTS = ["本棟", "隅棟", "軒先", "袖右", "袖左", "平部", "流れ壁", "平行壁", "谷", "その他"];

// Google倉庫のセキュリティを通過するためのトンネル
const proxyUrl = (url: string) => url ? `https://corsproxy.io/?${encodeURIComponent(url)}` : '';

function compressImage(file: File, callback: (compressedFile: File) => void) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      let width = img.width; let height = img.height;
      if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) callback(new File([blob], file.name, { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.8);
    };
    if (typeof e.target?.result === 'string') img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

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

// --- 現場一覧 ---
function ProjectListScreen() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetch();
  }, []);

  const addProject = async () => {
    const docRef = await addDoc(collection(db, "projects"), {
      projectName: "新規現場", projectLocation: "", constructionPeriod: "", contractorName: "山西瓦店",
      creationDate: new Date().toLocaleDateString('ja-JP'),
      photos: Array.from({ length: 40 }, (_, i) => ({ id: i, image: null, photoNumber: "", shootingDate: "", locationMap: "", process: "", description: "" })),
      mapUrls: [], mapRows: [{ id: 1, symbol: "", part: "本棟", relatedPhotoNumber: "" }],
      createdAt: new Date().toISOString()
    });
    navigate(`/project/${docRef.id}`);
  };

  const deleteProject = async (id: string, e: any) => {
    e.stopPropagation();
    if (window.confirm('この現場データを完全に削除しますか？')) {
      await deleteDoc(doc(db, "projects", id));
      setProjects(projects.filter(p => p.id !== id));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto space-y-6 pb-12">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">現場一覧</h1>
          <button onClick={addProject} className="flex items-center gap-1 bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-sm"><Plus className="w-4 h-4" /> 新規現場</button>
        </div>
        <div className="space-y-3">
          {projects.map((p: any) => (
            <div key={p.id} className="relative flex items-center p-4 rounded-2xl border bg-white border-black/5 shadow-sm transition-all">
              <div className="flex-1 cursor-pointer" onClick={() => navigate(`/project/${p.id}`)}>
                <div className="font-bold text-gray-900">{p.projectName || "未入力の現場"}</div>
                <div className="text-xs text-gray-500 mt-1">{p.projectLocation || "場所未登録"}</div>
                <div className="text-[10px] text-gray-400 mt-1">作成日: {p.creationDate}</div>
              </div>
              <button onClick={(e) => deleteProject(p.id, e)} className="p-2 text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- トップメニュー ---
function HomeScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);

  useEffect(() => { getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data())); }, [id]);

  if (!project) return <div className="p-10 text-center">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 p-6 font-sans">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex flex-col items-center py-8 px-4 bg-white/80 backdrop-blur-sm rounded-3xl border border-black/5 shadow-sm">
          <div className="w-[78px] h-[78px] bg-blue-100/50 rounded-full flex items-center justify-center mb-4"><Images className="w-8 h-8 text-blue-500" /></div>
          <h1 className="text-2xl font-bold mb-2 text-gray-900">瓦工事 写真台帳</h1>
          <p className="text-sm text-gray-500 text-center mb-4">現場ごとに写真と位置図を管理</p>
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-xs font-bold text-blue-700 bg-blue-100/80 px-4 py-2 rounded-full hover:bg-blue-200 transition-colors"><Building2 className="w-3 h-3" /> 現場切替: {project.projectName}</button>
        </div>
        <div className="space-y-3">
          <MenuButton title="現場一覧" subtitle="現場の切り替え・新規追加・削除" icon={List} colorClass="bg-teal-100/30" onClick={() => navigate('/')} />
          <MenuButton title="表紙" subtitle="現場名・住所・工期の入力" icon={BookOpen} colorClass="bg-purple-100/30" onClick={() => navigate(`/project/${id}/cover`)} />
          <MenuButton title="写真" subtitle="工事写真の撮影・登録" icon={Camera} colorClass="bg-blue-100/30" onClick={() => navigate(`/project/${id}/photo`)} />
          <MenuButton title="位置図" subtitle="図面登録（2枚まで）と対応表" icon={Map} colorClass="bg-green-100/30" onClick={() => navigate(`/project/${id}/map`)} />
          <MenuButton title="PDF出力" subtitle="黄金比レイアウトで書き出し" icon={FileText} colorClass="bg-orange-100/30" onClick={() => navigate(`/project/${id}/pdf`)} />
        </div>
      </div>
    </div>
  );
}

// --- 表紙 ---
function CoverScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);

  useEffect(() => { getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data())); }, [id]);

  const update = async (field: string, value: string) => {
    setProject({ ...project, [field]: value });
    await updateDoc(doc(db, "projects", id!), { [field]: value });
  };

  if (!project) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto pb-12">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold"><ArrowLeft className="w-5 h-5" /> もどる</button>
        <h1 className="text-2xl font-bold mb-6 text-gray-900">表紙の入力</h1>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-black/5">
          <InputField label="工事件名" placeholder="例: ○○様邸 屋根改修工事" value={project.projectName} onChange={(v: string) => update('projectName', v)} bgColor="bg-blue-50/50" />
          <InputField label="工事場所" placeholder="例: 富山県魚津市○○町" value={project.projectLocation} onChange={(v: string) => update('projectLocation', v)} bgColor="bg-green-50/50" />
          <InputField label="工期" placeholder="例: 令和8年3月〜令和8年4月" value={project.constructionPeriod} onChange={(v: string) => update('constructionPeriod', v)} bgColor="bg-purple-50/50" />
          <InputField label="施工業者" placeholder="例: 山西瓦店" value={project.contractorName} onChange={(v: string) => update('contractorName', v)} bgColor="bg-orange-50/50" />
          <InputField label="作成年月日" placeholder="例: 令和8年3月10日" value={project.creationDate} onChange={(v: string) => update('creationDate', v)} bgColor="bg-gray-50/50" />
        </div>
      </div>
    </div>
  );
}

// --- 写真 ---
function PhotoScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  useEffect(() => { getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data())); }, [id]);

  const updatePhoto = async (photoId: number, field: string, value: any) => {
    const newPhotos = project.photos.map((p: any) => p.id === photoId ? { ...p, [field]: value } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  const uploadPhoto = async (e: any, photoId: number) => {
    if (!e.target.files[0]) return;
    setLoadingId(photoId);
    compressImage(e.target.files[0], async (file) => {
      const r = ref(storage, `photos/${id}/${Date.now()}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      const newPhotos = project.photos.map((p: any) => p.id === photoId ? { ...p, image: url, shootingDate: new Date().toLocaleDateString('ja-JP') } : p);
      setProject({ ...project, photos: newPhotos });
      await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
      setLoadingId(null);
    });
  };

  if (!project) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto pb-12">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold"><ArrowLeft className="w-5 h-5" /> もどる</button>
        <h1 className="text-2xl font-bold mb-2 text-gray-900">写真の登録</h1>
        <div className="space-y-6 mt-4">
          {project.photos.map((photo: any, index: number) => (
            <div key={photo.id} className="bg-gray-100/50 p-4 rounded-2xl border border-black/5">
              <div className="flex gap-4 mb-4">
                <div className="w-24 h-20 bg-gray-200/50 rounded-xl flex items-center justify-center overflow-hidden border border-gray-300">
                  {loadingId === photo.id ? <span className="text-xs font-bold text-blue-500">保存中...</span> : photo.image ? <img src={photo.image} className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-gray-400" />}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-gray-800">写真 {index + 1}</div>
                  <label className="block w-full mt-2 text-center bg-blue-100/50 text-blue-700 font-bold py-2 rounded-lg cursor-pointer">
                    画像を選択 <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e, photo.id)} />
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

// --- 位置図（2枚対応） ---
function MapScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data())); }, [id]);

  const uploadMaps = async (e: any) => {
    const files = Array.from(e.target.files as FileList).slice(0, 2);
    if (files.length === 0) return;
    setUploading(true);
    const newUrls = [...(project.mapUrls || [])];
    for (const f of files) {
      if (newUrls.length >= 2) break; // 最大2枚
      const r = ref(storage, `maps/${id}/${Date.now()}_${f.name}`);
      await uploadBytes(r, f);
      newUrls.push(await getDownloadURL(r));
    }
    setProject({ ...project, mapUrls: newUrls });
    await updateDoc(doc(db, "projects", id!), { mapUrls: newUrls });
    setUploading(false);
  };

  const removeMap = async (index: number) => {
    const newUrls = project.mapUrls.filter((_: any, i: number) => i !== index);
    setProject({ ...project, mapUrls: newUrls });
    await updateDoc(doc(db, "projects", id!), { mapUrls: newUrls });
  };

  const updateMapRow = async (rowId: number, field: string, value: any) => {
    const newRows = project.mapRows.map((r: any) => r.id === rowId ? { ...r, [field]: value } : r);
    setProject({ ...project, mapRows: newRows });
    await updateDoc(doc(db, "projects", id!), { mapRows: newRows });
  };
  const addMapRow = async () => {
    const newRows = [...project.mapRows, { id: Date.now(), symbol: "", part: "本棟", relatedPhotoNumber: "" }];
    setProject({ ...project, mapRows: newRows });
    await updateDoc(doc(db, "projects", id!), { mapRows: newRows });
  };
  const removeMapRow = async (rowId: number) => {
    const newRows = project.mapRows.filter((r: any) => r.id !== rowId);
    setProject({ ...project, mapRows: newRows });
    await updateDoc(doc(db, "projects", id!), { mapRows: newRows });
  };

  if (!project) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto pb-12">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold"><ArrowLeft className="w-5 h-5" /> もどる</button>
        <h1 className="text-2xl font-bold mb-6 text-gray-900">位置図の登録</h1>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 mb-6">
          <div className="w-full bg-gray-100 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300 mb-4 overflow-hidden gap-2 p-2 relative" style={{ minHeight: '12rem' }}>
            {project.mapUrls && project.mapUrls.length > 0 ? (
              project.mapUrls.map((u: string, i: number) => (
                <div key={i} className="w-1/2 h-full relative">
                  <img src={u} className="w-full h-full object-contain" />
                  <button onClick={() => removeMap(i)} className="absolute top-1 right-1 bg-white rounded-full p-1 text-red-500 shadow"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))
            ) : (
              <span className="text-gray-400 font-bold">位置図未登録（2枚まで）</span>
            )}
          </div>
          <label className="block w-full text-center bg-green-100/50 text-green-700 font-bold py-3 rounded-lg cursor-pointer">
            {uploading ? "Google倉庫へ保存中..." : "画像を選択（2枚まで同時選択可）"}
            <input type="file" multiple accept="image/*" className="hidden" onChange={uploadMaps} disabled={uploading} />
          </label>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5">
          <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-gray-800">対応表</h2><button onClick={addMapRow} className="flex items-center gap-1 text-sm bg-gray-100 px-3 py-1 rounded-lg text-gray-700 font-bold"><Plus className="w-4 h-4" /> 行追加</button></div>
          <div className="space-y-4">{project.mapRows?.map((row: any) => (<div key={row.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg relative"><button onClick={() => removeMapRow(row.id)} className="absolute top-2 right-2 text-red-400"><Trash2 className="w-4 h-4" /></button><div className="grid grid-cols-2 gap-2 mb-2"><input type="text" placeholder="符号" className="p-2 border rounded text-sm" value={row.symbol} onChange={(e) => updateMapRow(row.id, "symbol", e.target.value)} /><input type="text" placeholder="写真NO" className="p-2 border rounded text-sm" value={row.relatedPhotoNumber} onChange={(e) => updateMapRow(row.id, "relatedPhotoNumber", e.target.value)} /></div><select className="w-full p-2 border rounded text-sm bg-white" value={row.part} onChange={(e) => updateMapRow(row.id, "part", e.target.value)}>{ROOF_PARTS.map(part => <option key={part} value={part}>{part}</option>)}</select></div>))}</div>
        </div>
      </div>
    </div>
  );
}

// --- PDF出力（エラーとCORSを完全修正） ---
function PDFExportScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);

  useEffect(() => { getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data())); }, [id]);

  const handleExport = async () => {
    try {
      const pages = document.querySelectorAll('.pdf-page');
      if (pages.length === 0) return;
      alert(`PDF作成中...`);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement;
        await new Promise(resolve => setTimeout(resolve, 300));
        await toJpeg(pageEl, { cacheBust: true }); // ★ 復活：iPhone(Safari)の undefined エラー対策
        const dataUrl = await toJpeg(pageEl, { quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff' });
        const pdfHeight = (pageEl.offsetHeight * pdfWidth) / pageEl.offsetWidth;
        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }
      pdf.save(`${project.projectName || '写真台帳'}.pdf`);
    } catch (error: any) { alert("エラー: " + error.message); }
  };

  if (!project) return null;

  const activePhotos = project.photos?.filter((p: any) => p.image || p.photoNumber) || [];
  const photoPages = [];
  for (let i = 0; i < (activePhotos.length || 3); i += 3) {
    const chunk = activePhotos.slice(i, i + 3);
    while (chunk.length < 3) chunk.push({ id: Math.random(), image: null, photoNumber: "", shootingDate: "", locationMap: "", process: "", description: "" });
    photoPages.push(chunk);
  }
  const totalPages = 2 + photoPages.length;

  return (
    <div className="min-h-screen bg-gray-200 p-6 font-sans flex flex-col items-center pb-12">
      <div className="w-full max-w-2xl mb-6 flex justify-between items-center"><button onClick={() => navigate(`/project/${id}`)} className="text-blue-500 font-bold flex items-center gap-2"><ArrowLeft className="w-5 h-5" /> もどる</button><button onClick={handleExport} className="bg-orange-500 text-white px-6 py-3 rounded-xl font-bold shadow">ダウンロード</button></div>
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
              {[{ label: "工事件名", value: project.projectName }, { label: "工事場所", value: project.projectLocation }, { label: "工期", value: project.constructionPeriod }, { label: "施工業者", value: project.contractorName }, { label: "作成年月日", value: project.creationDate }].map((item, idx) => (<div key={idx} className="flex items-baseline border-b-2 border-gray-800 pb-1"><div className="w-[50mm] flex-shrink-0 flex justify-between text-[20px] font-bold pr-16">{item.label.split('').map((c, i) => <span key={i}>{c}</span>)}</div><div className="flex-1 text-[20px] font-medium whitespace-nowrap overflow-hidden">{item.value || "　"}</div></div>))}
            </div>
          </div>
          <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- 1 / {totalPages} -</div>
        </div>

        {/* 位置図 */}
        <div className="pdf-page bg-white relative shadow-md flex flex-col" style={{ width: '210mm', height: '297mm', padding: '15mm' }}>
          <div className="w-full h-full border-[3px] border-gray-800 p-6 flex flex-col">
            <h2 className="text-2xl font-bold mb-4 border-b-2 border-gray-800 pb-2">位置図</h2>
            <div className="h-[45%] border border-gray-400 mb-6 flex items-center justify-center p-2 bg-gray-50 gap-4">
              {/* ★ 修正：プロキシを通してセキュリティを回避し画像を表示 */}
              {project.mapUrls?.map((u: string, i: number) => <img key={i} src={proxyUrl(u)} crossOrigin="anonymous" style={{ maxWidth: '48%', maxHeight: '100%', objectFit: 'contain' }} />)}
            </div>
            <div className="flex-1 flex flex-col">
              <div className="flex bg-gray-200 border border-gray-800 font-bold text-center text-sm"><div className="w-1/4 border-r border-gray-800 p-2">符号</div><div className="w-1/2 border-r border-gray-800 p-2">部位</div><div className="w-1/4 p-2">写真NO</div></div>
              {project.mapRows?.map((row: any) => (<div key={row.id} className="flex border-b border-l border-r border-gray-800 text-center text-sm"><div className="w-1/4 border-r border-gray-800 p-2">{row.symbol || "-"}</div><div className="w-1/2 border-r border-gray-800 p-2">{row.part}</div><div className="w-1/4 p-2">{row.relatedPhotoNumber || "-"}</div></div>))}
            </div>
          </div>
          <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- 2 / {totalPages} -</div>
        </div>

        {/* 写真 */}
        {photoPages.map((chunk, pageIndex) => (<div key={pageIndex} className="pdf-page bg-white relative shadow-md flex flex-col" style={{ width: '210mm', height: '297mm', padding: '15mm' }}><div className="flex-1 flex flex-col justify-between border-[3px] border-gray-800 p-2">{chunk.map((p: any, i: number) => (<div key={i} className="flex gap-2 h-[32%] border border-gray-400 p-2 rounded"><div className="w-[45%] border border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden">
            {/* ★ 修正：写真もプロキシを通す */}
            {p.image && <img src={proxyUrl(p.image)} crossOrigin="anonymous" className="w-full h-full object-contain" />}
          </div><div className="w-[55%] flex flex-col text-sm border border-gray-300 bg-white"><div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">写真NO</div><div className="p-1 flex-1 font-bold">{p.photoNumber}</div></div><div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">撮影日</div><div className="p-1 flex-1">{p.shootingDate}</div></div><div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">位置図</div><div className="p-1 flex-1">{p.locationMap}</div></div><div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">工程</div><div className="p-1 flex-1">{p.process}</div></div><div className="flex-1 flex"><div className="w-20 bg-gray-100 p-1 border-r">説明</div><div className="p-1 flex-1 text-xs">{p.description}</div></div></div></div>))}</div><div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- {pageIndex + 3} / {totalPages} -</div></div>))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectListScreen />} />
        <Route path="/project/:id" element={<HomeScreen />} />
        <Route path="/project/:id/cover" element={<CoverScreen />} />
        <Route path="/project/:id/photo" element={<PhotoScreen />} />
        <Route path="/project/:id/map" element={<MapScreen />} />
        <Route path="/project/:id/pdf" element={<PDFExportScreen />} />
      </Routes>
    </BrowserRouter>
  );
}