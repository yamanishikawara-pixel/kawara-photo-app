import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { Camera, Map, FileText, Trash2, Images, ChevronRight, List, BookOpen, ArrowLeft, Plus, Building2, ArrowUp, ArrowDown, UploadCloud, MapPin, X } from 'lucide-react';
import { db, storage } from './firebase';
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, deleteDoc, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

const ROOF_PARTS = ["本棟", "隅棟", "軒先", "袖右", "袖左", "平部", "流れ壁", "平行壁", "谷", "その他"];
const PROCESS_SNIPPETS = ["施工前", "施工確認", "施工後"];
const DESC_SNIPPETS = ["基準値：", "実測値：", "雪害による瓦割れ", "凍害による剥離", "漆喰の劣化・剥がれ", "瓦のズレ修正", "ビス打ち補強", "清掃・片付け"];

const proxyUrl = (url: string) => {
  if (!url) return '';
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}cb=${Math.random()}`;
};

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
    <button onClick={onClick} className={`w-full flex items-center gap-4 p-5 rounded-2xl border border-black/5 shadow-sm hover:shadow-md transition-all text-left ${colorClass}`}>
      <div className="w-[58px] h-[58px] flex-shrink-0 flex items-center justify-center bg-white/95 rounded-[16px] shadow-sm"><Icon className="w-6 h-6 text-gray-800" /></div>
      <div className="flex-1"><div className="text-xl font-bold text-gray-900">{title}</div><div className="text-sm text-gray-500 line-clamp-2 mt-1">{subtitle}</div></div>
      <ChevronRight className="w-6 h-6 text-gray-400" />
    </button>
  );
}

function InputField({ label, placeholder, value, onChange, bgColor }: any) {
  return (
    <div className={`p-5 rounded-xl mb-4 ${bgColor}`}>
      <label className="block text-base font-bold text-gray-800 mb-2">{label}</label>
      <input type="text" className="w-full p-3.5 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// スマホの指操作に完全対応したドラッグ部品
function useDraggablePin(initialX: number, initialY: number, onDragEnd: (x: number, y: number) => void) {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const elementStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleStart = (clientX: number, clientY: number) => {
    setDragging(true);
    dragStart.current = { x: clientX, y: clientY };
    elementStart.current = { x: position.x, y: position.y };
  };

  const onMouseDown = (e: any) => { e.stopPropagation(); handleStart(e.clientX, e.clientY); };
  const onTouchStart = (e: any) => { e.stopPropagation(); handleStart(e.touches[0].clientX, e.touches[0].clientY); };

  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!containerRef.current || !containerRef.current.parentElement) return;
      const parentRect = containerRef.current.parentElement.getBoundingClientRect();
      const dx = clientX - dragStart.current.x;
      const dy = clientY - dragStart.current.y;
      
      const newX = elementStart.current.x + (dx / parentRect.width) * 100;
      const newY = elementStart.current.y + (dy / parentRect.height) * 100;

      setPosition({ 
        x: Math.max(0, Math.min(100, newX)), 
        y: Math.max(0, Math.min(100, newY)) 
      });
    };

    const onMouseMove = (e: MouseEvent) => { if (dragging) handleMove(e.clientX, e.clientY); };
    const onTouchMove = (e: TouchEvent) => {
      if (dragging) {
        e.preventDefault();
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    
    const onEnd = () => {
      if (dragging) {
        setDragging(false);
        onDragEnd(position.x, position.y);
      }
    };

    if (dragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchend', onEnd);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchend', onEnd);
    };
  }, [dragging, position.x, position.y, onDragEnd]);

  return { position, onMouseDown, onTouchStart, dragging, containerRef };
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
      photos: [{ id: Date.now(), image: null, photoNumber: "1", shootingDate: "", locationMap: "", process: "", description: "" }],
      mapUrls: [], mapRows: [{ id: 1, symbol: "", part: "本棟", relatedPhotoNumber: "" }],
      mapPins: [], 
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
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">現場一覧</h1>
          <button onClick={addProject} className="flex items-center gap-2 bg-blue-500 text-white px-5 py-3 rounded-xl font-bold text-base shadow-sm"><Plus className="w-5 h-5" /> 新規現場</button>
        </div>
        <div className="space-y-4">
          {projects.map((p: any) => (
            <div key={p.id} className="relative flex items-center p-5 rounded-2xl border bg-white border-black/5 shadow-sm transition-all">
              <div className="flex-1 cursor-pointer" onClick={() => navigate(`/project/${p.id}`)}>
                <div className="text-lg font-bold text-gray-900">{p.projectName || "未入力の現場"}</div>
                <div className="text-xs text-gray-500 mt-2">{p.projectLocation || "場所未登録"}</div>
                <div className="text-[10px] text-gray-400 mt-2">作成日: {p.creationDate}</div>
              </div>
              <button onClick={(e) => deleteProject(p.id, e)} className="p-3 text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-6 h-6" /></button>
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

  if (!project) return <div className="p-10 text-center text-lg">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 p-6 font-sans">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex flex-col items-center py-10 px-4 bg-white/80 backdrop-blur-sm rounded-3xl border border-black/5 shadow-sm">
          <div className="w-[88px] h-[88px] bg-blue-100/50 rounded-full flex items-center justify-center mb-5"><Images className="w-10 h-10 text-blue-500" /></div>
          <h1 className="text-3xl font-bold mb-3 text-gray-900">瓦工事 写真台帳</h1>
          <p className="text-base text-gray-500 text-center mb-6">現場ごとに写真と位置図を管理</p>
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm font-bold text-blue-700 bg-blue-100/80 px-6 py-3 rounded-full hover:bg-blue-200 transition-colors"><Building2 className="w-4 h-4" /> 現場切替: {project.projectName}</button>
        </div>
        <div className="space-y-4">
          <MenuButton title="現場一覧" subtitle="現場の切り替え・新規追加・削除" icon={List} colorClass="bg-teal-100/30" onClick={() => navigate('/')} />
          <MenuButton title="表紙" subtitle="現場名・住所・工期の入力" icon={BookOpen} colorClass="bg-purple-100/30" onClick={() => navigate(`/project/${id}/cover`)} />
          <MenuButton title="写真" subtitle="工事写真の撮影・登録" icon={Camera} colorClass="bg-blue-100/30" onClick={() => navigate(`/project/${id}/photo`)} />
          <MenuButton title="位置図" subtitle="図面登録とピンポイント指示" icon={Map} colorClass="bg-green-100/30" onClick={() => navigate(`/project/${id}/map`)} />
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
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold text-lg"><ArrowLeft className="w-6 h-6" /> もどる</button>
        <h1 className="text-3xl font-bold mb-8 text-gray-900">表紙の入力</h1>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
          <InputField label="工事件名" placeholder="例: ○○○邸 屋根改修工事" value={project.projectName} onChange={(v: string) => update('projectName', v)} bgColor="bg-blue-50/50" />
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
function PinSelectModal({ isOpen, onClose, pins, onSelect }: any) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-xl space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center pb-2 border-b">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2"><MapPin className="text-red-500 w-6 h-6"/> 符号を選択</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-6 h-6"/></button>
        </div>
        {pins && pins.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-2">
            {pins.map((pin: any) => (
              <button 
                key={pin.id} 
                onClick={() => { onSelect(pin.label); onClose(); }}
                className="bg-gray-100 text-gray-800 border-2 border-gray-200 font-bold py-3 text-center rounded-xl text-lg shadow-sm hover:border-red-400 hover:bg-red-50 hover:text-red-700 transition-all"
              >
                {pin.label}
              </button>
            ))}
            <button 
              onClick={() => { onSelect(""); onClose(); }}
              className="col-span-3 bg-gray-50 text-gray-500 font-bold py-3 text-center rounded-xl text-sm shadow-inner hover:bg-gray-100 mt-2"
            >
              符号をクリア
            </button>
          </div>
        ) : (
          <div className="text-center py-10 px-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
            <p className="text-gray-500 font-bold">位置図画面で<br/>写真の場所をタップして<br/>ピンを打ってください</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PhotoScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [currentPhotoId, setCurrentPhotoId] = useState<number | null>(null);

  useEffect(() => { getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data())); }, [id]);

  const updatePhoto = async (photoId: number, field: string, value: any) => {
    const newPhotos = project.photos.map((p: any) => p.id === photoId ? { ...p, [field]: value } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  const deletePhotoSlot = async (photoId: number) => {
    if (window.confirm('この写真枠を完全に削除しますか？')) {
      const newPhotos = project.photos.filter((p: any) => p.id !== photoId);
      const renumbered = newPhotos.map((p: any, i: number) => ({ ...p, photoNumber: String(i + 1) }));
      setProject({ ...project, photos: renumbered });
      await updateDoc(doc(db, "projects", id!), { photos: renumbered });
    }
  };

  const clearPhoto = async (photoId: number) => {
    if (window.confirm('この枠の写真を削除しますか？（文字は残ります）')) {
      const newPhotos = project.photos.map((p: any) => p.id === photoId ? { ...p, image: null } : p);
      setProject({ ...project, photos: newPhotos });
      await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
    }
  };

  const addPhotoSlot = async () => {
    const newPhotos = [...project.photos, { 
      id: Date.now(), image: null, photoNumber: String(project.photos.length + 1), shootingDate: "", locationMap: "", process: "", description: "" 
    }];
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  const uploadPhoto = async (e: any, index: number) => {
    if (!e.target.files[0]) return;
    const photoId = project.photos[index].id;
    setLoadingId(photoId);

    compressImage(e.target.files[0], async (file) => {
      const r = ref(storage, `photos/${id}/${Date.now()}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      const newPhotos = project.photos.map((p: any, i: number) => p.id === photoId ? { ...p, image: url, photoNumber: String(i + 1), shootingDate: new Date().toLocaleDateString('ja-JP') } : p);
      setProject({ ...project, photos: newPhotos });
      await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
      setLoadingId(null);
    });
  };

  const handleBulkUpload = async (e: any) => {
    const files = Array.from(e.target.files as FileList);
    if (files.length === 0) return;

    setBulkUploading(true);
    let newPhotos = [...project.photos];
    let uploadedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let targetIndex = newPhotos.findIndex(p => !p.image);
      
      if (targetIndex === -1) {
        newPhotos.push({
          id: Date.now() + Math.random(), image: null, photoNumber: String(newPhotos.length + 1), shootingDate: "", locationMap: "", process: "", description: ""
        });
        targetIndex = newPhotos.length - 1;
      }

      await new Promise<void>((resolve) => {
        compressImage(file, async (compressed) => {
          const r = ref(storage, `photos/${id}/${Date.now()}_bulk_${i}`);
          await uploadBytes(r, compressed);
          const url = await getDownloadURL(r);
          newPhotos[targetIndex] = {
            ...newPhotos[targetIndex],
            image: url,
            shootingDate: new Date().toLocaleDateString('ja-JP')
          };
          resolve();
        });
      });
      uploadedCount++;
      setBulkProgress(uploadedCount);
    }

    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
    setBulkUploading(false);
    setBulkProgress(0);
  };

  const movePhoto = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === project.photos.length - 1) return;
    const newPhotos = [...project.photos];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    [newPhotos[index], newPhotos[targetIndex]] = [newPhotos[targetIndex], newPhotos[index]];
    
    const renumberedPhotos = newPhotos.map((p, i) => ({
      ...p,
      photoNumber: String(i + 1)
    }));

    setProject({ ...project, photos: renumberedPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: renumberedPhotos });
  };

  if (!project) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto pb-12">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold text-lg"><ArrowLeft className="w-6 h-6" /> もどる</button>
        <h1 className="text-3xl font-bold mb-6 text-gray-900">写真の登録</h1>
        
        <div className="bg-white p-5 rounded-3xl border border-black/5 shadow-sm mb-6">
          <label className="flex items-center justify-center gap-2 w-full bg-blue-500 text-white font-bold py-4 text-lg rounded-xl cursor-pointer shadow-md hover:bg-blue-600 transition-colors">
            <UploadCloud className="w-6 h-6" />
            {bulkUploading ? `一括アップロード中... (${bulkProgress}枚完了)` : "複数写真を一括追加する"}
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleBulkUpload} disabled={bulkUploading} />
          </label>
        </div>

        <div className="space-y-8 mt-4">
          {project.photos.map((photo: any, index: number) => (
            <div key={photo.id} className="bg-gray-100/80 p-5 rounded-3xl border border-black/5 shadow-sm relative">
              <div className="absolute top-4 right-4 flex gap-2">
                <button onClick={() => movePhoto(index, 'up')} className="bg-white p-2 rounded-lg shadow border border-gray-200 text-gray-600 hover:bg-gray-50"><ArrowUp className="w-5 h-5" /></button>
                <button onClick={() => movePhoto(index, 'down')} className="bg-white p-2 rounded-lg shadow border border-gray-200 text-gray-600 hover:bg-gray-50"><ArrowDown className="w-5 h-5" /></button>
              </div>
              <div className="flex gap-4 mb-6 mt-2">
                <div className="w-28 h-28 bg-gray-200/80 rounded-2xl flex items-center justify-center overflow-hidden border border-gray-300 shadow-inner relative">
                  {loadingId === photo.id ? (
                    <span className="text-sm font-bold text-blue-500">保存中...</span>
                  ) : photo.image ? (
                    <>
                      <img src={photo.image} className="w-full h-full object-cover" />
                      <button onClick={() => clearPhoto(photo.id)} className="absolute top-1 right-1 bg-white/90 rounded-full p-1.5 text-red-500 shadow-sm hover:bg-white">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <Camera className="w-8 h-8 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 pt-2 relative">
                  <div className="font-bold text-gray-800 text-lg">写真 {index + 1}</div>
                  {!photo.image && (
                    <button onClick={() => deletePhotoSlot(photo.id)} className="absolute top-0 right-0 p-2 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                  <label className="block w-full mt-3 text-center bg-blue-100/80 text-blue-700 font-bold py-3 text-lg rounded-xl cursor-pointer shadow-sm">
                    画像を選択 <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e, index)} />
                  </label>
                </div>
              </div>
              <div className="space-y-5">
                <input type="text" placeholder="写真NO 例: 1" className="w-full p-3.5 text-lg border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500" value={photo.photoNumber} onChange={(e) => updatePhoto(photo.id, "photoNumber", e.target.value)} />
                
                <button 
                  onClick={() => { setCurrentPhotoId(photo.id); setModalOpen(true); }}
                  className={`w-full p-3.5 text-lg border rounded-xl bg-white text-left flex justify-between items-center ${photo.locationMap ? 'text-red-700 font-bold border-red-300 bg-red-50' : 'text-gray-500 border-gray-300'}`}
                >
                  {photo.locationMap || '▼ 符号ピンを選択（タップ）'}
                  <MapPin className={`w-5 h-5 ${photo.locationMap ? 'text-red-500' : 'text-gray-400'}`} />
                </button>

                <div>
                  <input type="text" placeholder="工程 例: 葺き直し" className="w-full p-3.5 text-lg border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 mb-2" value={photo.process} onChange={(e) => updatePhoto(photo.id, "process", e.target.value)} />
                  <div className="flex flex-wrap gap-2">
                    {PROCESS_SNIPPETS.map(s => <button key={s} onClick={() => updatePhoto(photo.id, "process", s)} className="text-sm bg-blue-100 text-blue-700 px-3 py-2 rounded-lg font-bold shadow-sm">{s}</button>)}
                  </div>
                </div>
                <div>
                  <textarea placeholder="説明（短文）" rows={2} className="w-full p-3.5 text-lg border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 mb-2" value={photo.description} onChange={(e) => updatePhoto(photo.id, "description", e.target.value)} />
                  <div className="flex flex-wrap gap-2">
                    {DESC_SNIPPETS.map(s => <button key={s} onClick={() => updatePhoto(photo.id, "description", s)} className="text-sm bg-green-100 text-green-700 px-3 py-2 rounded-lg font-bold shadow-sm">{s}</button>)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <button onClick={addPhotoSlot} className="w-full mt-6 bg-gray-200 text-gray-700 font-bold py-4 text-lg rounded-xl shadow-sm hover:bg-gray-300 transition-colors flex items-center justify-center gap-2">
          <Plus className="w-6 h-6" /> 写真枠を1つ追加する
        </button>

      </div>
      
      <PinSelectModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        pins={project.mapPins} 
        onSelect={(label: string) => currentPhotoId && updatePhoto(currentPhotoId, "locationMap", label)} 
      />
    </div>
  );
}

// --- 位置図 ---
// ★ 修正：本物の「マップピン形状(📍)」で超スマートに！❌ボタンも廃止しタップで編集！
function DraggablePin({ pin, onDragEnd, onRemove, onLabelChange }: any) {
  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(pin.x, pin.y, onDragEnd);

  // ピンをタップした時の処理（編集・削除をまとめる）
  const handlePinClick = (e: any) => {
    e.stopPropagation();
    if (dragging) return;
    const res = window.prompt(
      `「${pin.label}」の文字を変更しますか？\n\n※完全に消す場合は、文字を「空っぽ」にしてOKを押してください。`, 
      pin.label
    );
    if (res === "") {
      onRemove(); // 空っぽなら削除
    } else if (res !== null) {
      onLabelChange(res); // 文字があれば変更
    }
  };

  return (
    <div 
      ref={containerRef}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onClick={handlePinClick} // タップで編集・削除
      style={{ 
        left: `${position.x}%`, 
        top: `${position.y}%`, 
        // ピンの先端（下部）が、タップした座標のドンピシャになるように調整
        transform: 'translate(-50%, -100%)',
        touchAction: 'none'
      }}
      className={`absolute flex flex-col items-center cursor-pointer ${dragging ? 'z-30 scale-125 opacity-80' : 'z-10 hover:scale-110 transition-transform'}`}
    >
      {/* ピンの丸い頭部分 */}
      <div className="bg-red-600 text-white w-9 h-9 rounded-full flex items-center justify-center font-bold text-base shadow-md border-2 border-white">
        {pin.label}
      </div>
      {/* ピンの尖った先端部分（CSSの三角形で作る） */}
      <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[10px] border-l-transparent border-r-transparent border-t-red-600 -mt-[2px] drop-shadow-sm"></div>
    </div>
  );
}

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
    
    for (let i = 0; i < files.length; i++) {
      if (newUrls.length >= 2) break;
      const f = files[i];
      const r = ref(storage, `maps/${id}/${Date.now()}_${f.name}`);
      await uploadBytes(r, f);
      newUrls.push(await getDownloadURL(r));
    }
    
    // ※今回は「アップロード時の自動ピン配置」は廃止し、指でタップした場所に置く方式にしました
    setProject({ ...project, mapUrls: newUrls });
    await updateDoc(doc(db, "projects", id!), { mapUrls: newUrls });
    setUploading(false);
  };

  const removeMap = async (index: number) => {
    if(!window.confirm('この位置図を削除しますか？\n（配置した符号ピンもすべて削除されます）')) return;
    const newUrls = project.mapUrls.filter((_: any, i: number) => i !== index);
    const newPins = (project.mapPins || []).filter((p: any) => p.mapIndex !== index);
    setProject({ ...project, mapUrls: newUrls, mapPins: newPins });
    await updateDoc(doc(db, "projects", id!), { mapUrls: newUrls, mapPins: newPins });
  };

  // ★ 修正：画像上の「直したい場所」をタップしてピンを打つ！自動で次の番号を提案します。
  const addPin = async (e: any, mapIndex: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // 今あるピンの数を数えて、自動で「次の番号（1, 2, 3...）」を提案する
    const currentMapPins = (project.mapPins || []).filter((p: any) => p.mapIndex === mapIndex);
    const nextNum = currentMapPins.length + 1;
    
    const label = window.prompt("この場所の符号を確認・変更\n（※タップするたびに自動で番号が増えます）", String(nextNum));
    if (!label) return;

    const newPins = [...(project.mapPins || []), { id: Date.now(), mapIndex, x, y, label }];
    setProject({ ...project, mapPins: newPins });
    await updateDoc(doc(db, "projects", id!), { mapPins: newPins });
  };

  const handlePinDragEnd = async (pinId: number, x: number, y: number) => {
    const newPins = (project.mapPins || []).map((p: any) => p.id === pinId ? { ...p, x, y } : p);
    setProject({ ...project, mapPins: newPins });
    await updateDoc(doc(db, "projects", id!), { mapPins: newPins });
  };

  const handlePinLabelChange = async (pinId: number, label: string) => {
    const newPins = (project.mapPins || []).map((p: any) => p.id === pinId ? { ...p, label } : p);
    setProject({ ...project, mapPins: newPins });
    await updateDoc(doc(db, "projects", id!), { mapPins: newPins });
  };

  const removePin = async (pinId: number) => {
    const newPins = (project.mapPins || []).filter((p: any) => p.id !== pinId);
    setProject({ ...project, mapPins: newPins });
    await updateDoc(doc(db, "projects", id!), { mapPins: newPins });
  };

  if (!project) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans overflow-x-hidden">
      <div className="max-w-md mx-auto pb-12">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold text-lg"><ArrowLeft className="w-6 h-6" /> もどる</button>
        <h1 className="text-3xl font-bold mb-8 text-gray-900">位置図の登録</h1>
        
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-black/5 mb-6 relative">
          
          <label className="flex items-center justify-center gap-2 w-full text-center bg-green-100 text-green-700 font-bold py-4 text-lg rounded-xl cursor-pointer shadow-sm mb-6 z-10 relative">
            <Images className="w-6 h-6" />
            {uploading ? "Google倉庫へ保存中..." : "図面を追加（2枚まで）"}
            <input type="file" multiple accept="image/*" className="hidden" onChange={uploadMaps} disabled={uploading} />
          </label>

          {project.mapUrls && project.mapUrls.length > 0 ? (
            <div className="space-y-8">
              <div className="bg-red-50 p-4 rounded-xl border border-red-100 space-y-2">
                <p className="text-base font-bold text-red-600 flex items-center gap-2">
                  <MapPin className="w-5 h-5" /> 魔法のピンの使い方
                </p>
                <ul className="text-sm text-red-700 font-medium space-y-1 list-disc pl-5">
                  <li>写真の直したい場所を<b>指でタップ</b>すると、そこにピンが立ちます！（番号は自動で振られます）</li>
                  <li>ピンは指で<b>自由に移動</b>できます。</li>
                  <li>ピンを<b>もう一度タップ</b>すると、文字の変更や削除ができます。</li>
                </ul>
              </div>
              
              {project.mapUrls.map((u: string, i: number) => (
                <div key={i} className="relative w-full border-2 border-gray-300 rounded-xl bg-gray-100 shadow-inner group overflow-visible">
                  {/* ★ 画像。タップでその場所にピンを追加！ */}
                  <img src={u} onClick={(e) => addPin(e, i)} className="w-full h-auto block rounded-xl z-0 cursor-crosshair" />
                  
                  {/* 打ったピンを画像の上に表示 */}
                  {(project.mapPins || []).filter((p: any) => p.mapIndex === i).map((pin: any) => (
                    <DraggablePin 
                      key={pin.id} 
                      pin={pin} 
                      onDragEnd={(x: number, y: number) => handlePinDragEnd(pin.id, x, y)}
                      onLabelChange={(label: string) => handlePinLabelChange(pin.id, label)}
                      onRemove={() => removePin(pin.id)} 
                    />
                  ))}
                  
                  <button onClick={() => removeMap(i)} className="absolute top-2 right-2 bg-white/80 rounded-full p-2 text-red-500 shadow-sm z-20 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-5 h-5" /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full bg-gray-100 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-300 overflow-hidden p-10 gap-3">
              <span className="text-gray-400 font-bold text-lg">位置図未登録</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- PDF出力 ---
function PDFExportScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);

  useEffect(() => { getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data())); }, [id]);

  const handleExport = async () => {
    try {
      const pages = document.querySelectorAll('.pdf-page');
      if (pages.length === 0) return;
      
      alert(`PDF作成中...スマホの画面をそのままにして少しお待ちください`);
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      
      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement;
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await toJpeg(pageEl, { cacheBust: true }); 
        const dataUrl = await toJpeg(pageEl, { quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff' });
        const pdfHeight = (pageEl.offsetHeight * pdfWidth) / pageEl.offsetWidth;
        
        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }
      
      pdf.save(`${project.projectName || '写真台帳'}.pdf`);
    } catch (error: any) { 
      alert("エラー: " + error.message); 
    }
  };

  if (!project) return null;

  const mapUrlsToRender = project.mapUrls && project.mapUrls.length > 0 ? project.mapUrls : [''];
  const mapCount = mapUrlsToRender.length;
  
  const activePhotos = project.photos?.filter((p: any) => p.image || p.process || p.description) || [];
  const photoPages = [];
  for (let i = 0; i < (activePhotos.length || 3); i += 3) {
    const chunk = activePhotos.slice(i, i + 3);
    while (chunk.length < 3) chunk.push({ id: Math.random(), image: null, photoNumber: "", shootingDate: "", locationMap: "", process: "", description: "" });
    photoPages.push(chunk);
  }
  
  const totalPages = 1 + mapCount + photoPages.length;

  return (
    <div className="min-h-screen bg-gray-200 p-6 font-sans flex flex-col items-center pb-12 overflow-x-hidden">
      <div className="w-full max-w-2xl mb-6 flex justify-between items-center"><button onClick={() => navigate(`/project/${id}`)} className="text-blue-500 font-bold flex items-center gap-2 text-lg"><ArrowLeft className="w-6 h-6" /> もどる</button><button onClick={handleExport} className="bg-orange-500 text-white px-8 py-4 rounded-xl font-bold shadow-lg text-lg">ダウンロード</button></div>
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

        {/* 位置図 (PDF上でもカッコいいポインター型ピンを印刷！) */}
        {mapUrlsToRender.map((u: string, mapIndex: number) => (
          <div key={`map-page-${mapIndex}`} className="pdf-page bg-white relative shadow-md flex flex-col" style={{ width: '210mm', height: '297mm', padding: '15mm' }}>
            <div className="w-full h-full border-[3px] border-gray-800 p-6 flex flex-col">
              <h2 className="text-2xl font-bold mb-4 border-b-2 border-gray-800 pb-2">位置図 {mapCount > 1 ? `(${mapIndex + 1}/${mapCount})` : ''}</h2>
              
              <div className="border border-gray-400 p-2 bg-gray-50 flex-1 flex items-center justify-center overflow-hidden">
                {u ? (
                  <div className="relative inline-block" style={{ maxWidth: '100%', maxHeight: '100%' }}>
                    <img src={proxyUrl(u)} crossOrigin="anonymous" className="block w-auto h-auto" style={{ maxWidth: '100%', maxHeight: '180mm', objectFit: 'contain' }} />
                    {/* ★ PDFにもスマートなマップピンを合成！ */}
                    {(project.mapPins || []).filter((p: any) => p.mapIndex === mapIndex).map((pin: any) => (
                      <div 
                        key={pin.id} 
                        style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: 'translate(-50%, -100%)' }}
                        className="absolute flex flex-col items-center z-10"
                      >
                        <div style={{ width: '8mm', height: '8mm', fontSize: '14px' }} className="bg-red-600 text-white rounded-full flex items-center justify-center font-bold border-[1.5px] border-white shadow-md">
                          {pin.label}
                        </div>
                        <div style={{ borderLeftWidth: '2.5mm', borderRightWidth: '2.5mm', borderTopWidth: '4mm' }} className="w-0 h-0 border-l-transparent border-r-transparent border-t-red-600 -mt-[1px]"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400 font-bold">位置図未登録</span>
                )}
              </div>
            </div>
            <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- {2 + mapIndex} / {totalPages} -</div>
          </div>
        ))}

        {/* 写真 */}
        {photoPages.map((chunk, pageIndex) => (<div key={pageIndex} className="pdf-page bg-white relative shadow-md flex flex-col" style={{ width: '210mm', height: '297mm', padding: '15mm' }}><div className="flex-1 flex flex-col justify-between border-[3px] border-gray-800 p-2">{chunk.map((p: any, i: number) => (<div key={i} className="flex gap-2 h-[32%] border border-gray-400 p-2 rounded"><div className="w-[45%] border border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden">
            {p.image && <img src={proxyUrl(p.image)} crossOrigin="anonymous" className="w-full h-full object-contain" />}
          </div><div className="w-[55%] flex flex-col text-sm border border-gray-300 bg-white"><div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">写真NO</div><div className="p-1 flex-1 font-bold">{p.photoNumber}</div></div><div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">撮影日</div><div className="p-1 flex-1">{p.shootingDate}</div></div><div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">位置図</div><div className="p-1 flex-1 font-bold text-red-700 bg-red-50">{p.locationMap}</div></div><div className="flex border-b border-gray-300"><div className="w-20 bg-gray-100 p-1 border-r">工程</div><div className="p-1 flex-1">{p.process}</div></div><div className="flex-1 flex"><div className="w-20 bg-gray-100 p-1 border-r">説明</div><div className="p-1 flex-1 text-xs">{p.description}</div></div></div></div>))}</div>
          <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- {2 + mapCount + pageIndex} / {totalPages} -</div>
        </div>))}
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