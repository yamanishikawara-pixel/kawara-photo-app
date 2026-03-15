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

const proxyUrl = (url: string, id: string | number) => url ? `${url}${url.includes('?') ? '&' : '?'}cb=${id}` : '';

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
      canvas.toBlob((blob) => { if (blob) callback(new File([blob], file.name, { type: 'image/jpeg' })); }, 'image/jpeg', 0.8);
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
      setPosition({ x: Math.max(0, Math.min(100, newX)), y: Math.max(0, Math.min(100, newY)) });
    };

    const onMouseMove = (e: MouseEvent) => { if (dragging) handleMove(e.clientX, e.clientY); };
    const onTouchMove = (e: TouchEvent) => { if (dragging) { e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); } };
    const onEnd = () => { if (dragging) { setDragging(false); onDragEnd(position.x, position.y); } };

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
      photos: [{ id: Date.now(), image: null, photoNumber: "1", shootingDate: "", locationMap: "", process: "", description: "", circles: [] }],
      mapUrls: [], mapRows: [], mapPins: [], 
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
              </div>
              <button onClick={(e) => deleteProject(p.id, e)} className="p-3 text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-6 h-6" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  useEffect(() => { getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data())); }, [id]);
  if (!project) return <div className="p-10 text-center">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 p-6 font-sans">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex flex-col items-center py-10 px-4 bg-white/80 backdrop-blur-sm rounded-3xl shadow-sm">
          <div className="w-[88px] h-[88px] bg-blue-100/50 rounded-full flex items-center justify-center mb-5"><Images className="w-10 h-10 text-blue-500" /></div>
          <h1 className="text-3xl font-bold mb-3 text-gray-900">瓦工事 写真台帳</h1>
          <p className="text-base text-gray-500 text-center mb-6">現場ごとに写真と位置図を管理</p>
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm font-bold text-blue-700 bg-blue-100/80 px-6 py-3 rounded-full hover:bg-blue-200"><Building2 className="w-4 h-4" /> 現場切替: {project.projectName}</button>
        </div>
        <div className="space-y-4">
          <MenuButton title="現場一覧" subtitle="現場の切り替え・新規追加・削除" icon={List} colorClass="bg-teal-100/30" onClick={() => navigate('/')} />
          <MenuButton title="表紙" subtitle="現場名・住所・工期の入力" icon={BookOpen} colorClass="bg-purple-100/30" onClick={() => navigate(`/project/${id}/cover`)} />
          <MenuButton title="写真" subtitle="赤丸マーカー付き写真の登録" icon={Camera} colorClass="bg-blue-100/30" onClick={() => navigate(`/project/${id}/photo`)} />
          <MenuButton title="位置図" subtitle="図面登録と赤丸・矢印の配置" icon={Map} colorClass="bg-green-100/30" onClick={() => navigate(`/project/${id}/map`)} />
          <MenuButton title="PDF出力" subtitle="黄金比レイアウトで書き出し" icon={FileText} colorClass="bg-orange-100/30" onClick={() => navigate(`/project/${id}/pdf`)} />
        </div>
      </div>
    </div>
  );
}

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
          <InputField label="工事件名" value={project.projectName} onChange={(v: string) => update('projectName', v)} bgColor="bg-blue-50/50" />
          <InputField label="工事場所" value={project.projectLocation} onChange={(v: string) => update('projectLocation', v)} bgColor="bg-green-50/50" />
          <InputField label="工期" value={project.constructionPeriod} onChange={(v: string) => update('constructionPeriod', v)} bgColor="bg-purple-50/50" />
          <InputField label="施工業者" value={project.contractorName} onChange={(v: string) => update('contractorName', v)} bgColor="bg-orange-50/50" />
          <InputField label="作成年月日" value={project.creationDate} onChange={(v: string) => update('creationDate', v)} bgColor="bg-gray-50/50" />
        </div>
      </div>
    </div>
  );
}

function PhotoCircleMarker({ circle, isSelected, onSelect, onDragEnd, onSizeChange, onRemove }: any) {
  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(circle.x, circle.y, onDragEnd);

  return (
    <>
      <div
        ref={containerRef}
        onMouseDown={(e) => { onSelect(); onMouseDown(e); }}
        onTouchStart={(e) => { onSelect(); onTouchStart(e); }}
        style={{ left: `${position.x}%`, top: `${position.y}%`, width: `${circle.size}%`, transform: 'translate(-50%, -50%)', touchAction: 'none' }}
        className={`absolute aspect-square rounded-full border-[3px] border-red-500 shadow-sm ${dragging ? 'z-30 opacity-70 scale-110' : 'z-20 cursor-pointer'} ${isSelected ? 'border-dashed bg-red-500/20' : ''}`}
      />
      {isSelected && !dragging && (
        <div style={{ left: `${position.x}%`, top: `${position.y + circle.size/2 + 5}%`, transform: 'translateX(-50%)' }} className="absolute z-40 flex bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          <button onClick={(e) => {e.stopPropagation(); onSizeChange(Math.min(60, circle.size * 1.3))}} className="px-4 py-2 text-xl font-bold hover:bg-gray-100 text-gray-700">+</button>
          <button onClick={(e) => {e.stopPropagation(); onSizeChange(Math.max(5, circle.size * 0.7))}} className="px-4 py-2 text-xl font-bold border-l border-r hover:bg-gray-100 text-gray-700">-</button>
          <button onClick={(e) => {e.stopPropagation(); onRemove()}} className="px-4 py-2 text-red-500 hover:bg-red-50"><Trash2 className="w-5 h-5"/></button>
        </div>
      )}
    </>
  )
}

function PinSelectModal({ isOpen, onClose, pins, onSelect }: any) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-xl space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center pb-2 border-b">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2"><MapPin className="text-red-500 w-6 h-6"/> 位置図の場所を選択</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-6 h-6"/></button>
        </div>
        {pins && pins.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-2">
            {pins.map((pin: any) => (
              <button key={pin.id} onClick={() => { onSelect(pin.label); onClose(); }} className="bg-gray-100 text-gray-800 border-2 border-gray-200 font-bold py-3 text-center rounded-xl text-lg shadow-sm hover:border-red-400 hover:bg-red-50 hover:text-red-700 transition-all">{pin.label}</button>
            ))}
            <button onClick={() => { onSelect(""); onClose(); }} className="col-span-3 bg-gray-50 text-gray-500 font-bold py-3 text-center rounded-xl text-sm shadow-inner mt-2">選択を解除</button>
          </div>
        ) : (
          <div className="text-center py-10 px-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200"><p className="text-gray-500 font-bold">先に位置図画面で<br/>マーカーを打ってください</p></div>
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
  const [selectedCircleId, setSelectedCircleId] = useState<number | null>(null);

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
    if (window.confirm('この枠の画像を削除しますか？（文字は残ります）')) {
      const newPhotos = project.photos.map((p: any) => p.id === photoId ? { ...p, image: null, circles: [] } : p);
      setProject({ ...project, photos: newPhotos });
      await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
    }
  };

  const addPhotoSlot = async () => {
    const newPhotos = [...project.photos, { id: Date.now(), image: null, photoNumber: String(project.photos.length + 1), shootingDate: "", locationMap: "", process: "", description: "", circles: [] }];
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  const movePhoto = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === project.photos.length - 1) return;
    const newPhotos = [...project.photos];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newPhotos[index], newPhotos[targetIndex]] = [newPhotos[targetIndex], newPhotos[index]];
    const renumberedPhotos = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
    setProject({ ...project, photos: renumberedPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: renumberedPhotos });
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
        newPhotos.push({ id: Date.now() + Math.random(), image: null, photoNumber: String(newPhotos.length + 1), shootingDate: "", locationMap: "", process: "", description: "", circles: [] });
        targetIndex = newPhotos.length - 1;
      }
      await new Promise<void>((resolve) => {
        compressImage(file, async (compressed) => {
          const r = ref(storage, `photos/${id}/${Date.now()}_bulk_${i}`);
          await uploadBytes(r, compressed);
          const url = await getDownloadURL(r);
          newPhotos[targetIndex] = { ...newPhotos[targetIndex], image: url, shootingDate: new Date().toLocaleDateString('ja-JP'), circles: [] };
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

  const uploadPhoto = async (e: any, index: number) => {
    if (!e.target.files[0]) return;
    const photoId = project.photos[index].id;
    setLoadingId(photoId);
    compressImage(e.target.files[0], async (file) => {
      const r = ref(storage, `photos/${id}/${Date.now()}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      const newPhotos = project.photos.map((p: any, i: number) => p.id === photoId ? { ...p, image: url, photoNumber: String(i + 1), shootingDate: new Date().toLocaleDateString('ja-JP'), circles: [] } : p);
      setProject({ ...project, photos: newPhotos });
      await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
      setLoadingId(null);
    });
  };

  const addCircleToPhoto = async (e: any, photoId: number) => {
    if (selectedCircleId !== null) { setSelectedCircleId(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const newPhotos = project.photos.map((p: any) => {
      if (p.id === photoId) return { ...p, circles: [...(p.circles || []), { id: Date.now(), x, y, size: 20 }] };
      return p;
    });
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  const updateCircle = async (photoId: number, circleId: number, newProps: any) => {
    const newPhotos = project.photos.map((p: any) => p.id === photoId ? { ...p, circles: p.circles.map((c: any) => c.id === circleId ? { ...c, ...newProps } : c) } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };
  
  const removeCircle = async (photoId: number, circleId: number) => {
    const newPhotos = project.photos.map((p: any) => p.id === photoId ? { ...p, circles: p.circles.filter((c: any) => c.id !== circleId) } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
    setSelectedCircleId(null);
  };

  if (!project) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans overflow-x-hidden" onClick={() => setSelectedCircleId(null)}>
      <div className="max-w-md mx-auto pb-12">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold text-lg"><ArrowLeft className="w-6 h-6" /> もどる</button>
        <h1 className="text-3xl font-bold mb-6 text-gray-900">写真の登録と赤丸記入</h1>

        <div className="bg-white p-5 rounded-3xl border border-black/5 shadow-sm mb-6">
          <label className="flex items-center justify-center gap-2 w-full bg-blue-500 text-white font-bold py-4 text-lg rounded-xl cursor-pointer shadow-md hover:bg-blue-600 transition-colors">
            <UploadCloud className="w-6 h-6" />
            {bulkUploading ? `一括アップロード中... (${bulkProgress}枚完了)` : "複数写真を一括追加する"}
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleBulkUpload} disabled={bulkUploading} />
          </label>
        </div>

        <div className="space-y-8 mt-4">
          {project.photos.map((photo: any, index: number) => (
            <div key={photo.id} className="bg-white p-5 rounded-3xl border border-black/5 shadow-md relative">
              <div className="absolute top-4 right-4 flex gap-2 z-10">
                <button onClick={() => movePhoto(index, 'up')} className="bg-white p-2 rounded-lg shadow border border-gray-200 text-gray-600 hover:bg-gray-50"><ArrowUp className="w-5 h-5" /></button>
                <button onClick={() => movePhoto(index, 'down')} className="bg-white p-2 rounded-lg shadow border border-gray-200 text-gray-600 hover:bg-gray-50"><ArrowDown className="w-5 h-5" /></button>
              </div>

              <div className="w-full h-64 mt-10 bg-gray-100 rounded-2xl flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300 relative mb-4 p-2">
                {loadingId === photo.id ? (
                  <span className="text-lg font-bold text-blue-500">保存中...</span>
                ) : photo.image ? (
                  <div className="relative inline-block" style={{ maxWidth: '100%', maxHeight: '100%' }} onClick={(e) => addCircleToPhoto(e, photo.id)}>
                    <img src={photo.image} className="block max-w-full max-h-[14rem] object-contain pointer-events-none rounded shadow-sm" />
                    {(photo.circles || []).map((circle: any) => (
                      <PhotoCircleMarker key={circle.id} circle={circle} isSelected={selectedCircleId === circle.id} onSelect={() => setSelectedCircleId(circle.id)} onDragEnd={(x: number, y: number) => updateCircle(photo.id, circle.id, { x, y })} onSizeChange={(size: number) => updateCircle(photo.id, circle.id, { size })} onRemove={() => removeCircle(photo.id, circle.id)} />
                    ))}
                    <div className="absolute -top-3 -left-3 bg-black/70 text-white text-xs px-2 py-1 rounded-full font-bold pointer-events-none shadow">タップで赤丸追加</div>
                  </div>
                ) : (
                  <div className="text-center text-gray-400">
                    <Camera className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <span className="font-bold">画像を選択してください</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center mb-5 pb-4 border-b border-gray-100">
                <div className="font-bold text-gray-800 text-xl">写真 {index + 1}</div>
                <div className="flex gap-2">
                  {photo.image ? (
                    <button onClick={() => clearPhoto(photo.id)} className="p-2.5 text-gray-400 hover:text-red-500 bg-gray-50 rounded-xl border border-gray-200"><Trash2 className="w-5 h-5"/></button>
                  ) : (
                    <button onClick={() => deletePhotoSlot(photo.id)} className="p-2.5 text-gray-400 hover:text-red-500 bg-gray-50 rounded-xl border border-gray-200"><Trash2 className="w-5 h-5"/></button>
                  )}
                  <label className="bg-blue-100 text-blue-700 font-bold py-2.5 px-5 rounded-xl cursor-pointer shadow-sm">
                    {photo.image ? '画像を変更' : '画像を選択'} <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e, index)} />
                  </label>
                </div>
              </div>

              <div className="space-y-5">
                <button onClick={() => { setCurrentPhotoId(photo.id); setModalOpen(true); }} className={`w-full p-4 text-lg border-2 rounded-xl text-left flex justify-between items-center ${photo.locationMap ? 'text-red-700 font-bold border-red-300 bg-red-50' : 'text-gray-500 border-gray-300 bg-gray-50'}`}>
                  {photo.locationMap || '▼ どの場所の写真ですか？（タップして選択）'}
                  <MapPin className={`w-6 h-6 ${photo.locationMap ? 'text-red-500' : 'text-gray-400'}`} />
                </button>
                <input type="text" placeholder="工程 例: 葺き直し" className="w-full p-3.5 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" value={photo.process} onChange={(e) => updatePhoto(photo.id, "process", e.target.value)} />
                <textarea placeholder="説明（短文）" rows={2} className="w-full p-3.5 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" value={photo.description} onChange={(e) => updatePhoto(photo.id, "description", e.target.value)} />
              </div>
            </div>
          ))}
        </div>
        
        <button onClick={addPhotoSlot} className="w-full mt-8 bg-gray-800 text-white font-bold py-4 text-lg rounded-xl shadow-lg flex items-center justify-center gap-2 hover:bg-gray-700">
          <Plus className="w-6 h-6" /> 写真枠を1つ追加する
        </button>

      </div>
      <PinSelectModal isOpen={modalOpen} onClose={() => setModalOpen(false)} pins={project.mapPins} onSelect={(label: string) => currentPhotoId && updatePhoto(currentPhotoId, "locationMap", label)} />
    </div>
  );
}

function MapMarker({ pin, onDragEnd, onClick }: any) {
  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(pin.x, pin.y, onDragEnd);
  return (
    <div ref={containerRef} onMouseDown={onMouseDown} onTouchStart={onTouchStart} onClick={(e) => { e.stopPropagation(); if(!dragging) onClick(); }} style={{ left: `${position.x}%`, top: `${position.y}%`, transform: 'translate(-50%, -50%)', touchAction: 'none' }} className={`absolute flex items-center justify-center cursor-pointer transition-transform ${dragging ? 'z-30 scale-125 opacity-80' : 'z-10 hover:scale-110'}`}>
      {pin.type === 'arrow' ? (
        <div className="flex items-center gap-1 drop-shadow-md bg-white/70 px-2 py-0.5 rounded-lg border border-red-200">
          <span className="text-red-600 font-black text-2xl leading-none" style={{ transform: `rotate(${pin.rotation || 0}deg)` }}>➡</span>
          <span className="text-red-600 font-bold text-xl">{pin.label}</span>
        </div>
      ) : (
        <div className="relative flex items-center justify-center">
          <div className="w-14 h-14 rounded-full border-[4px] border-red-600 shadow-sm bg-red-600/10"></div>
          <span className="absolute text-red-600 font-black text-xl drop-shadow-md bg-white/50 px-1 rounded">{pin.label}</span>
        </div>
      )}
    </div>
  )
}

function MarkerEditModal({ pin, isOpen, onClose, onSave, onRemove }: any) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("circle");
  const [rotation, setRotation] = useState(0);

  useEffect(() => { if (pin) { setLabel(pin.label); setType(pin.type || 'circle'); setRotation(pin.rotation || 0); } }, [pin]);
  if (!isOpen || !pin) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b pb-3">
          <h3 className="text-xl font-bold text-gray-900">マーカーの設定</h3>
          <button onClick={onClose}><X className="w-6 h-6 text-gray-400"/></button>
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">符号（番号など）</label>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)} className="w-full p-4 text-xl font-bold border-2 border-gray-300 rounded-xl focus:border-red-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-3">マーカーの種類</label>
          <div className="flex gap-4">
            <button onClick={() => setType('circle')} className={`flex-1 py-3 font-bold border-2 rounded-xl flex items-center justify-center gap-2 ${type==='circle' ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500'}`}><div className="w-5 h-5 rounded-full border-[3px] border-current"></div> 範囲 (〇)</button>
            <button onClick={() => setType('arrow')} className={`flex-1 py-3 font-bold border-2 rounded-xl flex items-center justify-center gap-2 ${type==='arrow' ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500'}`}><span className="text-xl leading-none">➡</span> 方向</button>
          </div>
        </div>
        {type === 'arrow' && (
          <div className="pt-2">
            <label className="block text-sm font-bold text-gray-700 mb-2">撮影した向き</label>
            <div className="grid grid-cols-4 gap-2">
              {[ {d: -90, l: '↑'}, {d: 0, l: '➡'}, {d: 90, l: '↓'}, {d: 180, l: '⬅'} ].map(rot => (
                <button key={rot.d} onClick={() => setRotation(rot.d)} className={`p-3 text-2xl font-black border-2 rounded-xl flex justify-center ${rotation === rot.d ? 'border-red-500 bg-red-100 text-red-600' : 'border-gray-200 text-gray-400'}`}><span style={{transform: `rotate(${rot.d}deg)`}}>➡</span></button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3 pt-4 border-t">
          <button onClick={() => { onSave({...pin, label, type, rotation}); onClose(); }} className="flex-1 bg-red-600 text-white text-lg font-bold py-4 rounded-xl shadow-md">決定</button>
          <button onClick={() => { onRemove(pin.id); onClose(); }} className="bg-gray-100 text-gray-600 font-bold py-4 px-6 rounded-xl hover:bg-red-100 hover:text-red-600">削除</button>
        </div>
      </div>
    </div>
  )
}

function MapScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [editingPin, setEditingPin] = useState<any>(null);

  useEffect(() => { getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data())); }, [id]);

  const uploadMaps = async (e: any) => {
    const files = Array.from(e.target.files as FileList).slice(0, 2);
    if (files.length === 0) return;
    setUploading(true);
    const newUrls = [...(project.mapUrls || [])];
    for (const f of files) {
      if (newUrls.length >= 2) break;
      const r = ref(storage, `maps/${id}/${Date.now()}_${f.name}`);
      await uploadBytes(r, f);
      newUrls.push(await getDownloadURL(r));
    }
    setProject({ ...project, mapUrls: newUrls });
    await updateDoc(doc(db, "projects", id!), { mapUrls: newUrls });
    setUploading(false);
  };

  const removeMap = async (index: number) => {
    if(!window.confirm('この位置図を削除しますか？\n（配置したマーカーもすべて削除されます）')) return;
    const newUrls = project.mapUrls.filter((_: any, i: number) => i !== index);
    const newPins = (project.mapPins || []).filter((p: any) => p.mapIndex !== index);
    setProject({ ...project, mapUrls: newUrls, mapPins: newPins });
    await updateDoc(doc(db, "projects", id!), { mapUrls: newUrls, mapPins: newPins });
  };

  const addPin = async (e: any, mapIndex: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const currentPins = (project.mapPins || []).filter((p: any) => p.mapIndex === mapIndex);
    const label = String(currentPins.length + 1);
    const newPin = { id: Date.now(), mapIndex, x, y, label, type: 'circle', rotation: 0 };
    const newPins = [...(project.mapPins || []), newPin];
    setProject({ ...project, mapPins: newPins });
    await updateDoc(doc(db, "projects", id!), { mapPins: newPins });
    setEditingPin(newPin);
  };

  const savePin = async (updatedPin: any) => {
    const newPins = (project.mapPins || []).map((p: any) => p.id === updatedPin.id ? updatedPin : p);
    setProject({ ...project, mapPins: newPins });
    await updateDoc(doc(db, "projects", id!), { mapPins: newPins });
  };

  const removePin = async (pinId: number) => {
    const newPins = (project.mapPins || []).filter((p: any) => p.id !== pinId);
    setProject({ ...project, mapPins: newPins });
    await updateDoc(doc(db, "projects", id!), { mapPins: newPins });
  };

  // ★ 変更：どの位置図に対する説明行かを記録するために mapIndex を追加
  const addMapRow = async (mapIndex: number) => {
    const newRows = [...(project.mapRows || []), { id: Date.now(), mapIndex, symbol: "", part: "", photoNo: "", remarks: "" }];
    setProject({ ...project, mapRows: newRows });
    await updateDoc(doc(db, "projects", id!), { mapRows: newRows });
  };

  const updateMapRow = async (rowId: number, field: string, value: string) => {
    const newRows = (project.mapRows || []).map((r: any) => r.id === rowId ? { ...r, [field]: value } : r);
    setProject({ ...project, mapRows: newRows });
    await updateDoc(doc(db, "projects", id!), { mapRows: newRows });
  };

  const removeMapRow = async (rowId: number) => {
    const newRows = (project.mapRows || []).filter((r: any) => r.id !== rowId);
    setProject({ ...project, mapRows: newRows });
    await updateDoc(doc(db, "projects", id!), { mapRows: newRows });
  };

  if (!project) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans overflow-x-hidden">
      <div className="max-w-md mx-auto pb-12">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold text-lg"><ArrowLeft className="w-6 h-6" /> もどる</button>
        <h1 className="text-3xl font-bold mb-6 text-gray-900">位置図の登録と指示</h1>
        
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-black/5 mb-6 relative">
          <label className="flex items-center justify-center gap-2 w-full text-center bg-green-100 text-green-700 font-bold py-4 text-lg rounded-xl cursor-pointer shadow-sm mb-6 z-10 relative">
            <Images className="w-6 h-6" />
            {uploading ? "Google倉庫へ保存中..." : "図面を追加（2枚まで）"}
            <input type="file" multiple accept="image/*" className="hidden" onChange={uploadMaps} disabled={uploading} />
          </label>

          {project.mapUrls && project.mapUrls.length > 0 ? (
            <div className="space-y-8">
              <div className="bg-red-50 p-4 rounded-xl border border-red-100 space-y-2">
                <p className="text-base font-bold text-red-600 flex items-center gap-2"><MapPin className="w-5 h-5" /> 現場マーカーの使い方</p>
                <ul className="text-sm text-red-700 font-medium space-y-1 list-disc pl-5">
                  <li>図面を<b>タップ</b>すると、赤丸が打てます。</li>
                  <li>赤丸を<b>ドラッグ</b>で自由に移動できます。</li>
                  <li>赤丸を<b>もう一度タップ</b>すると、<b>「矢印」</b>への変更や文字の変更ができます。</li>
                </ul>
              </div>
              
              {project.mapUrls.map((u: string, i: number) => {
                // ★ 新規：この図面用の説明行だけを抜き出す
                const currentRows = (project.mapRows || []).filter((r: any) => r.mapIndex === i || (r.mapIndex === undefined && i === 0));
                
                return (
                <div key={i} className="relative w-full border-2 border-gray-300 rounded-xl bg-gray-100 shadow-inner group overflow-hidden flex items-center justify-center p-2 flex-col">
                  <div className="relative inline-block w-full" onClick={(e) => addPin(e, i)}>
                    <img src={u} className="block max-w-full h-auto mx-auto pointer-events-none rounded shadow-sm" />
                    {(project.mapPins || []).filter((p: any) => p.mapIndex === i).map((pin: any) => (
                      <MapMarker key={pin.id} pin={pin} onDragEnd={(x: number, y: number) => savePin({...pin, x, y})} onClick={() => setEditingPin(pin)} />
                    ))}
                  </div>
                  <button onClick={() => removeMap(i)} className="absolute top-2 right-2 bg-white/90 rounded-full p-2 text-red-500 shadow-sm z-20"><Trash2 className="w-5 h-5" /></button>

                  {/* ★ 変更：図面ごとに独立した説明表 */}
                  <div className="w-full mt-6 pt-4 border-t border-gray-300">
                    <h3 className="text-lg font-bold mb-3 text-gray-800">位置図 {i + 1} の説明表</h3>
                    <div className="space-y-3">
                      {currentRows.map((row: any) => (
                        <div key={row.id} className="flex gap-2 items-center bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
                          <div className="flex-1 grid grid-cols-12 gap-2">
                            <input type="text" placeholder="番号" className="col-span-3 p-2 border border-gray-300 rounded-lg text-sm bg-white" value={row.symbol || ''} onChange={e => updateMapRow(row.id, 'symbol', e.target.value)} />
                            <input type="text" placeholder="部位" className="col-span-5 p-2 border border-gray-300 rounded-lg text-sm bg-white" value={row.part || ''} onChange={e => updateMapRow(row.id, 'part', e.target.value)} />
                            <input type="text" placeholder="写真NO" className="col-span-4 p-2 border border-gray-300 rounded-lg text-sm bg-white" value={row.photoNo || row.relatedPhotoNumber || ''} onChange={e => updateMapRow(row.id, 'photoNo', e.target.value)} />
                            <input type="text" placeholder="備考" className="col-span-12 p-2 border border-gray-300 rounded-lg text-sm bg-white" value={row.remarks || ''} onChange={e => updateMapRow(row.id, 'remarks', e.target.value)} />
                          </div>
                          <button onClick={() => removeMapRow(row.id)} className="p-2 text-red-500 bg-white border border-red-100 rounded-lg hover:bg-red-50"><Trash2 className="w-5 h-5" /></button>
                        </div>
                      ))}
                      <button onClick={() => addMapRow(i)} className="w-full py-3 bg-white text-blue-600 font-bold rounded-xl mt-2 border-2 border-dashed border-blue-200 hover:bg-blue-50 transition-colors">+ 説明行を追加</button>
                    </div>
                  </div>

                </div>
              )})}

            </div>
          ) : (
             <div className="w-full bg-gray-100 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-300 overflow-hidden p-10 gap-3">
              <span className="text-gray-400 font-bold text-lg">位置図未登録</span>
            </div>
          )}
        </div>
      </div>
      <MarkerEditModal pin={editingPin} isOpen={!!editingPin} onClose={() => setEditingPin(null)} onSave={savePin} onRemove={removePin} />
    </div>
  );
}

function PDFExportScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => { getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data())); }, [id]);

  useEffect(() => {
    const calculateScale = () => {
      const availableWidth = window.innerWidth - 32;
      const a4Width = 794;
      setScale(Math.min(1, availableWidth / a4Width));
    };
    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, []);

  const handleExport = async () => {
    try {
      const pages = document.querySelectorAll('.pdf-page');
      if (pages.length === 0) return;
      
      alert(`PDF作成中...スマホの画面をそのままにして少しお待ちください\n（写真が多い場合は10秒ほどかかります）`);
      
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
      
      pdf.save(`${project.projectName || '写真台帳'}.pdf`);
    } catch (error: any) { alert("エラー: " + error.message); }
  };

  if (!project) return <div className="p-10 text-center">読み込み中...</div>;

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
    <div className="min-h-screen bg-gray-200 p-4 sm:p-6 font-sans flex flex-col items-center pb-12 overflow-x-hidden w-full">
      <div className="w-full max-w-2xl mb-6 flex justify-between items-center">
        <button onClick={() => navigate(`/project/${id}`)} className="text-blue-500 font-bold flex items-center gap-2 text-lg">
          <ArrowLeft className="w-6 h-6" /> もどる
        </button>
        <button onClick={handleExport} className="bg-orange-500 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-bold shadow-lg text-base sm:text-lg">
          ダウンロード
        </button>
      </div>
      
      <div className="flex flex-col gap-8 items-center w-full">
        
        {/* 表紙 */}
        <div style={{ width: `${794 * scale}px`, height: `${1123 * scale}px` }} className="relative bg-white shadow-md shrink-0">
          <div className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left" style={{ width: '794px', height: '1123px', padding: '20mm', transform: `scale(${scale})` }}>
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
        </div>

        {/* 位置図 */}
        {mapUrlsToRender.map((u: string, mapIndex: number) => (
          <div key={`map-page-${mapIndex}`} style={{ width: `${794 * scale}px`, height: `${1123 * scale}px` }} className="relative bg-white shadow-md shrink-0">
            <div className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left" style={{ width: '794px', height: '1123px', padding: '15mm', transform: `scale(${scale})` }}>
              <div className="w-full h-full border-[3px] border-gray-800 p-6 flex flex-col">
                <h2 className="text-2xl font-bold mb-4 border-b-2 border-gray-800 pb-2">位置図 {mapCount > 1 ? `(${mapIndex + 1}/${mapCount})` : ''}</h2>
                
                <div className="border border-gray-400 p-2 bg-gray-50 flex-1 flex flex-col items-center justify-start overflow-hidden">
                  
                  {/* 図面本体 */}
                  <div className="relative inline-block w-full flex items-center justify-center min-h-0">
                    {u ? (
                      <>
                        <img src={proxyUrl(u, mapIndex)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-full object-contain" />
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
                      </>
                    ) : (
                      <span className="text-gray-400 font-bold">位置図未登録</span>
                    )}
                  </div>

                  {/* ★ 変更：この位置図専用の説明表 */}
                  {(() => {
                    const currentRows = (project.mapRows || []).filter((r: any) => r.mapIndex === mapIndex || (r.mapIndex === undefined && mapIndex === 0));
                    if (currentRows.length === 0) return null;
                    
                    return (
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
                    );
                  })()}

                </div>
              </div>
              <div className="absolute bottom-[10mm] right-[15mm] text-xs font-serif text-gray-400">- {2 + mapIndex} / {totalPages} -</div>
            </div>
          </div>
        ))}

        {/* 写真 */}
        {photoPages.map((chunk, pageIndex) => (
          <div key={pageIndex} style={{ width: `${794 * scale}px`, height: `${1123 * scale}px` }} className="relative bg-white shadow-md shrink-0">
            <div className="pdf-page absolute top-0 left-0 bg-white flex flex-col origin-top-left" style={{ width: '794px', height: '1123px', padding: '15mm', transform: `scale(${scale})` }}>
              <div className="flex-1 flex flex-col justify-between border-[3px] border-gray-800 p-2">
                {chunk.map((p: any, i: number) => (
                  <div key={i} className="flex gap-2 h-[32%] border border-gray-400 p-2 rounded">
                    <div className="w-[45%] border border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden relative">
                      {p.image && (
                        <div className="relative inline-block" style={{ maxWidth: '100%', maxHeight: '100%' }}>
                          <img src={proxyUrl(p.image, p.id)} crossOrigin="anonymous" className="block max-w-full max-h-[80mm] object-contain" />
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