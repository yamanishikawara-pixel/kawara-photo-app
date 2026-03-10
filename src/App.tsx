import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import { Camera, Map, FileText, Trash2, Images, ChevronRight, List, BookOpen, ArrowLeft, Plus, Building2 } from 'lucide-react';
import { db, storage } from './firebase';
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, query, orderBy, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// --- 画像圧縮機能 ---
function compressImage(file: File, callback: (file: File) => void) {
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
      canvas.toBlob((blob) => {
        if (blob) callback(new File([blob], file.name, { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.8);
    };
    if (typeof e.target?.result === 'string') img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

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

// --- 画面：現場一覧 ---
function ProjectListScreen() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);

  const fetchProjects = async () => {
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { fetchProjects(); }, []);

  const addProject = async () => {
    const docRef = await addDoc(collection(db, "projects"), {
      projectName: "新しい現場", projectLocation: "", constructionPeriod: "", contractorName: "山西瓦店",
      creationDate: new Date().toLocaleDateString('ja-JP'), mapUrls: [], photos: [], createdAt: new Date().toISOString()
    });
    navigate(`/project/${docRef.id}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto space-y-6 pb-12">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">現場一覧</h1>
          <button onClick={addProject} className="flex items-center gap-1 bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-transform"><Plus className="w-4 h-4" /> 新規現場</button>
        </div>
        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p.id} className="relative flex items-center p-4 rounded-2xl border bg-white border-black/5 shadow-sm" onClick={() => navigate(`/project/${p.id}`)}>
              <div className="flex-1 cursor-pointer">
                <div className="font-bold text-gray-900">{p.projectName || "未入力の現場"}</div>
                <div className="text-xs text-gray-500 mt-1">{p.projectLocation || "場所未登録"}</div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- 画面：現場メニュー（HomeScreen相当） ---
function ProjectHomeScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState<any>(null);

  useEffect(() => {
    const fetch = async () => {
      const d = await getDoc(doc(db, "projects", id!));
      if (d.exists()) setP(d.data());
    };
    fetch();
  }, [id]);

  if (!p) return <div className="p-10 text-center">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 p-6 font-sans">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex flex-col items-center py-8 px-4 bg-white/80 backdrop-blur-sm rounded-3xl border border-black/5 shadow-sm">
          <div className="w-[78px] h-[78px] bg-blue-100/50 rounded-full flex items-center justify-center mb-4"><Images className="w-8 h-8 text-blue-500" /></div>
          <h1 className="text-2xl font-bold mb-2 text-gray-900">瓦工事 写真台帳</h1>
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-xs font-bold text-blue-700 bg-blue-100/80 px-4 py-2 rounded-full mt-2">
            <List className="w-3 h-3" /> 現場切替: {p.projectName}
          </button>
        </div>
        <div className="space-y-3">
          <MenuButton title="表紙" subtitle="現場名・住所・工期の入力" icon={BookOpen} colorClass="bg-purple-100/30" onClick={() => navigate(`/project/${id}/cover`)} />
          <MenuButton title="写真" subtitle="工事写真の撮影・登録" icon={Camera} colorClass="bg-blue-100/30" onClick={() => navigate(`/project/${id}/photo`)} />
          <MenuButton title="位置図" subtitle="図面登録（最大2枚）" icon={Map} colorClass="bg-green-100/30" onClick={() => navigate(`/project/${id}/map`)} />
          <MenuButton title="PDF出力" subtitle="黄金比レイアウトで書き出し" icon={FileText} colorClass="bg-orange-100/30" onClick={() => navigate(`/project/${id}/pdf`)} />
        </div>
      </div>
    </div>
  );
}

// --- 表紙画面 ---
function CoverScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    getDoc(doc(db, "projects", id!)).then(d => d.exists() && setData(d.data()));
  }, [id]);

  const update = (field: string, val: string) => {
    setData({...data, [field]: val});
    updateDoc(doc(db, "projects", id!), { [field]: val });
  };

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold"><ArrowLeft className="w-5 h-5" /> もどる</button>
        <h1 className="text-2xl font-bold mb-6 text-gray-900">表紙の入力</h1>
        <div className="bg-white p-6 rounded-2xl shadow-sm border space-y-4 text-sm">
          <div><label className="font-bold">工事件名</label><input className="w-full border p-2 rounded" value={data.projectName} onChange={e => update('projectName', e.target.value)} /></div>
          <div><label className="font-bold">工事場所</label><input className="w-full border p-2 rounded" value={data.projectLocation} onChange={e => update('projectLocation', e.target.value)} /></div>
          <div><label className="font-bold">工期</label><input className="w-full border p-2 rounded" value={data.constructionPeriod} onChange={e => update('constructionPeriod', e.target.value)} /></div>
          <div><label className="font-bold">施工業者</label><input className="w-full border p-2 rounded" value={data.contractorName} onChange={e => update('contractorName', e.target.value)} /></div>
        </div>
      </div>
    </div>
  );
}

// --- 写真登録画面 ---
function PhotoScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "projects", id!)).then(d => d.exists() && setPhotos(d.data().photos || []));
  }, [id]);

  const addPhoto = async (e: any) => {
    if (!e.target.files[0]) return;
    setLoading(true);
    compressImage(e.target.files[0], async (compressed) => {
      const r = ref(storage, `photos/${id}/${Date.now()}`);
      await uploadBytes(r, compressed);
      const url = await getDownloadURL(r);
      const newPhoto = { url, no: photos.length + 1, date: new Date().toLocaleDateString('ja-JP'), step: '', desc: '' };
      await updateDoc(doc(db, "projects", id!), { photos: arrayUnion(newPhoto) });
      setPhotos([...photos, newPhoto]);
      setLoading(false);
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-md mx-auto">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold"><ArrowLeft className="w-5 h-5" /> もどる</button>
        <h1 className="text-2xl font-bold mb-4">写真の追加</h1>
        <label className="block w-full text-center bg-blue-500 text-white font-bold py-4 rounded-2xl cursor-pointer shadow-lg mb-8">
          📸 カメラ・写真を選択
          <input type="file" accept="image/*" className="hidden" onChange={addPhoto} />
        </label>
        <div className="space-y-4">
          {photos.map((ph, i) => (
            <div key={i} className="bg-white p-3 rounded-xl shadow flex gap-4">
              <img src={ph.url} className="w-24 h-24 object-cover rounded-lg" />
              <div className="flex-1 text-sm space-y-2">
                <input placeholder="工程" className="w-full border p-1 rounded" defaultValue={ph.step} onBlur={async e => {
                  const newPhotos = [...photos]; newPhotos[i].step = e.target.value;
                  await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
                }} />
                <textarea placeholder="説明" className="w-full border p-1 rounded" defaultValue={ph.desc} onBlur={async e => {
                  const newPhotos = [...photos]; newPhotos[i].desc = e.target.value;
                  await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {loading && <div className="fixed inset-0 bg-black/50 flex items-center justify-center text-white font-bold">保存中...</div>}
    </div>
  );
}

// --- 位置図画面 ---
function MapScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    getDoc(doc(db, "projects", id!)).then(d => d.exists() && setUrls(d.data().mapUrls || []));
  }, [id]);

  const uploadMap = async (e: any) => {
    if (!e.target.files[0]) return;
    const r = ref(storage, `maps/${id}/${Date.now()}`);
    await uploadBytes(r, e.target.files[0]);
    const url = await getDownloadURL(r);
    const newUrls = [...urls, url].slice(0, 2);
    await updateDoc(doc(db, "projects", id!), { mapUrls: newUrls });
    setUrls(newUrls);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-md mx-auto">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold"><ArrowLeft className="w-5 h-5" /> もどる</button>
        <h1 className="text-2xl font-bold mb-6">位置図（2枚まで）</h1>
        <div className="grid grid-cols-2 gap-4 mb-8">
          {urls.map(u => <img key={u} src={u} className="w-full h-40 object-contain bg-white border rounded-xl" />)}
        </div>
        <label className="block w-full text-center bg-green-600 text-white font-bold py-4 rounded-2xl cursor-pointer shadow-lg">
          📍 図面を選択
          <input type="file" accept="image/*" className="hidden" onChange={uploadMap} />
        </label>
      </div>
    </div>
  );
}

// --- PDF出力画面 ---
function PDFExportScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState<any>(null);

  useEffect(() => {
    getDoc(doc(db, "projects", id!)).then(d => d.exists() && setP(d.data()));
  }, [id]);

  const handleExport = async () => {
    const el = document.getElementById('pdf-layout');
    const canvas = await html2canvas(el!, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF('p', 'mm', 'a4');
    const h = 297;
    const pageCount = Math.ceil(el!.offsetHeight / 1122); // A4換算のページ数
    for (let i = 0; i < pageCount; i++) {
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -(h * i), 210, h * pageCount);
    }
    pdf.save(`${p.projectName}_報告書.pdf`);
  };

  if (!p) return null;

  return (
    <div className="min-h-screen bg-gray-200 p-6 flex flex-col items-center">
      <div className="w-full max-w-2xl mb-6 flex justify-between">
        <button onClick={() => navigate(`/project/${id}`)} className="text-blue-500 font-bold flex items-center gap-2"><ArrowLeft className="w-5 h-5" /> もどる</button>
        <button onClick={handleExport} className="bg-orange-500 text-white px-8 py-3 rounded-xl font-bold shadow-lg">PDFを保存</button>
      </div>

      {/* PDFプレビュー（お送りいただいたPDF形式を再現） */}
      <div id="pdf-layout" className="bg-white shadow-2xl overflow-hidden font-serif" style={{ width: '210mm' }}>
        {/* 表紙 [cite: 1-7] */}
        <div className="h-[297mm] p-[20mm] border-b flex flex-col justify-center relative border-8 border-double border-gray-800 m-4">
          <h1 className="text-5xl font-bold text-center mb-24 tracking-[0.3em]">工事写真報告書</h1>
          <table className="w-full border-collapse border-4 border-gray-900 text-2xl">
            {[
              ["工事件名", p.projectName], ["工事場所", p.projectLocation], ["工期", p.constructionPeriod],
              ["施工業者", p.contractorName], ["作成年月日", p.creationDate]
            ].map(([l, v], i) => (
              <tr key={i}><td className="border-4 border-gray-900 p-6 font-bold bg-gray-50 w-1/3">{l}</td><td className="border-4 border-gray-900 p-6">{v}</td></tr>
            ))}
          </table>
          <p className="absolute bottom-10 right-10 text-xl font-bold">1 / 3</p>
        </div>

        {/* 位置図 [cite: 8-10] */}
        <div className="h-[297mm] p-[20mm] border-b relative">
          <h2 className="text-3xl font-bold border-b-4 border-gray-900 mb-8 pb-4">位置図</h2>
          <div className="grid grid-cols-2 gap-4 h-[40%] mb-12">
            {p.mapUrls?.map((u: string) => <img key={u} src={u} className="w-full h-full object-contain border-2 border-gray-900" />)}
          </div>
          <table className="w-full border-collapse border-4 border-gray-900 text-xl">
            <tr className="bg-gray-100 font-bold text-center">
              <td className="border-4 border-gray-900 p-4">符号</td><td className="border-4 border-gray-900 p-4">部位</td><td className="border-4 border-gray-900 p-4">対応写真NO</td>
            </tr>
            <tr><td className="border-4 border-gray-900 p-4 text-center font-bold">本棟</td><td className="border-4 border-gray-900 p-4 text-center font-bold">-</td><td className="border-4 border-gray-900 p-4 text-center font-bold">-</td></tr>
          </table>
          <p className="absolute bottom-10 right-10 text-xl font-bold">2 / 3</p>
        </div>

        {/* 写真 [cite: 11-30] */}
        {(() => {
          const pages = [];
          for (let i = 0; i < p.photos.length; i += 3) {
            const chunk = p.photos.slice(i, i + 3);
            pages.push(
              <div key={i} className="h-[297mm] p-[10mm] relative">
                <div className="flex flex-col gap-4 h-full">
                  {chunk.map((ph: any, idx: number) => (
                    <div key={idx} className="border-4 border-gray-900 p-2 flex gap-4 h-[30%]">
                      <div className="w-[45%] border-2 border-gray-400 bg-gray-50"><img src={ph.url} className="w-full h-full object-contain" /></div>
                      <table className="flex-1 border-collapse border-2 border-gray-900 text-lg font-bold">
                        <tr><td className="border-2 border-gray-900 p-2 bg-gray-50 w-1/3">写真NO</td><td className="border-2 border-gray-900 p-2">{ph.no}</td></tr>
                        <tr><td className="border-2 border-gray-900 p-2 bg-gray-50">撮影日</td><td className="border-2 border-gray-900 p-2">{ph.date}</td></tr>
                        <tr><td className="border-2 border-gray-900 p-2 bg-gray-50 h-[40%]">説明</td><td className="border-2 border-gray-900 p-2 align-top text-sm font-medium">{ph.step}<br/>{ph.desc}</td></tr>
                      </table>
                    </div>
                  ))}
                </div>
                <p className="absolute bottom-10 right-10 text-xl font-bold">3 / 3</p>
              </div>
            );
          }
          return pages;
        })()}
      </div>
    </div>
  );
}

// 🌐 メインコンポーネント
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectListScreen />} />
        <Route path="/project/:id" element={<ProjectHomeScreen />} />
        <Route path="/project/:id/cover" element={<CoverScreen />} />
        <Route path="/project/:id/photo" element={<PhotoScreen />} />
        <Route path="/project/:id/map" element={<MapScreen />} />
        <Route path="/project/:id/pdf" element={<PDFExportScreen />} />
      </Routes>
    </BrowserRouter>
  );
}