import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, Trash2, ArrowLeft, ArrowUp, ArrowDown, UploadCloud, MapPin, X, Plus, Copy } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { compressImage, proxyUrl, useDraggablePin } from '../shared/utils';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import type { Circle, MapPin as MapPinT, Photo, Project } from '../types';
import type { ChangeEvent, MouseEvent } from 'react';

// --- 定数定義 ---
const SNAP_THRESHOLD = 3; // 磁石（スナップ）の感度 (%)

const DEFAULT_PROCESS_OPTIONS = [
  "着工前", "下地・下葺き", "防水ルーフィング施工", "瓦桟施工",
  "流れ壁板金", "平行壁板金", "確認", "棟金具設置", "緊結状況", "施工中", "完成"
];

const DEFAULT_DESC_TEMPLATES = [
  { label: "基準/実測", text: "基準値：\n実測値：" },
  { label: "重ね幅(ヨコ)", text: "重ね幅（ヨコ）：" },
  { label: "重ね幅(タテ)", text: "重ね幅（タテ）：" },
  { label: "平行壁(立上)", text: "平行壁：立ち上げ高 " },
  { label: "流れ壁(立上)", text: "流れ壁：立ち上げ高 " },
  { label: "棟芯(重ね)", text: "棟芯：重ね（左右） " },
  { label: "棟部(増張り)", text: "棟部：増し張り " },
];

// --- サブコンポーネント: 赤丸マーカー ---
function PhotoCircleMarker({
  circle,
  isSelected,
  onSelect,
  onDragEnd,
  onSizeChange,
  onRemove,
  onDuplicate,
}: {
  circle: Circle;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onSizeChange: (size: number) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(circle.x, circle.y, onDragEnd);
  const size = Number(circle.size || 20);

  return (
    <>
      <div
        ref={containerRef}
        onMouseDown={(e) => { e.stopPropagation(); onSelect(); onMouseDown(e); }}
        onTouchStart={(e) => { e.stopPropagation(); onSelect(); onTouchStart(e); }}
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          left: `${position.x}%`, 
          top: `${position.y}%`, 
          width: `${size}%`, 
          transform: 'translate(-50%, -50%)', 
          touchAction: 'none',
          zIndex: isSelected ? 100 : 20
        }}
        className={`absolute aspect-square rounded-full border-[4px] border-red-500 shadow-sm transition-transform ${dragging ? 'z-30 opacity-70 scale-110' : 'z-20 cursor-pointer'} ${isSelected ? 'border-dashed bg-red-500/20' : ''}`}
      />
      {isSelected && !dragging && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          style={{ left: `${position.x}%`, top: `${position.y + size/2 + 8}%`, transform: 'translateX(-50%)' }} 
          className="absolute z-[1000] flex bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.3)] border-2 border-gray-200 overflow-hidden animate-in zoom-in duration-200"
        >
          <button onClick={(e) => {e.stopPropagation(); onSizeChange(Math.min(60, size * 1.3))}} className="px-5 py-3 text-2xl font-bold hover:bg-gray-100 text-gray-700 border-r active:bg-gray-200">＋</button>
          <button onClick={(e) => {e.stopPropagation(); onSizeChange(Math.max(5, size * 0.7))}} className="px-5 py-3 text-2xl font-bold hover:bg-gray-100 text-gray-700 border-r active:bg-gray-200">－</button>
          <button onClick={(e) => {e.stopPropagation(); onDuplicate();}} className="px-5 py-3 text-blue-600 hover:bg-blue-50 border-r active:bg-blue-100"><Copy className="w-6 h-6"/></button>
          <button onClick={(e) => {e.stopPropagation(); onRemove()}} className="px-5 py-3 text-red-500 hover:bg-red-50 active:bg-red-100"><Trash2 className="w-6 h-6"/></button>
        </div>
      )}
    </>
  )
}

// --- サブコンポーネント: 場所選択モーダル ---
function PinSelectModal({
  isOpen,
  onClose,
  pins,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  pins: MapPinT[] | undefined;
  onSelect: (label: string) => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl space-y-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center pb-2 border-b">
          <h3 className="text-xl font-black text-gray-900 flex items-center gap-3"><MapPin className="text-red-500 w-7 h-7"/> 場所を選択</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full"><X className="w-6 h-6"/></button>
        </div>
        {pins && pins.length > 0 ? (
          <div className="grid grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto pr-2">
            {pins.map((pin) => (
              <button key={pin.id} onClick={() => { onSelect(pin.label); onClose(); }} className="bg-gray-50 text-gray-800 border-2 border-gray-200 font-black py-4 text-center rounded-2xl text-xl shadow-sm hover:border-red-400 hover:bg-red-50 hover:text-red-700 transition-all">{pin.label}</button>
            ))}
            <button onClick={() => { onSelect(""); onClose(); }} className="col-span-3 bg-gray-100 text-gray-500 font-bold py-4 rounded-2xl mt-2">選択解除</button>
          </div>
        ) : (
          <div className="text-center py-12 px-4 bg-gray-50 rounded-3xl border-4 border-dashed border-gray-200 text-gray-400 font-bold">先に位置図でピンを打ってください</div>
        )}
      </div>
    </div>
  );
}

// 日付フォーマット変換
const formatToYMD = (dateString: string) => dateString ? dateString.replace(/\//g, '-') : '';
const formatToYMDSlash = (dateString: string) => dateString ? dateString.replace(/-/g, '/') : '';

const getFileExtension = (file: File): string => {
  const byName = file.name.split('.').pop()?.toLowerCase();
  if (byName) return byName;
  return file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
};

// --- メインコンポーネント ---
export default function PhotoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentPhotoId, setCurrentPhotoId] = useState<number | null>(null);
  const [selectedCircleId, setSelectedCircleId] = useState<number | null>(null);

  const [processOptions, setProcessOptions] = useState<string[]>(DEFAULT_PROCESS_OPTIONS);
  const [descTemplates, setDescTemplates] = useState<{label: string, text: string}[]>(DEFAULT_DESC_TEMPLATES);

  useEffect(() => {
    getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data() as Project));

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const s = await getDoc(doc(db, 'users', user.uid));
        if (s.exists()) {
          const data = s.data();
          if (data.customProcesses?.length > 0) setProcessOptions(data.customProcesses);
          if (data.customDescTemplates?.length > 0) setDescTemplates(data.customDescTemplates);
        }
      }
    });
    return () => unsub();
  }, [id]);

  // ★ 磁石機能 (スナップ計算)
  const getSnappedPoint = (x: number, y: number, photoId: number) => {
    if (!project) return { x, y };
    const photo = project.photos.find(p => p.id === photoId);
    if (!photo) return { x, y };
    const circles = photo.circles || [];
    for (const c of circles) {
      if (Math.hypot(Number(c.x) - x, Number(c.y) - y) < SNAP_THRESHOLD) {
        return { x: Number(c.x), y: Number(c.y) };
      }
    }
    return { x, y };
  };

  const updatePhoto = async (photoId: number, field: string, value: any) => {
    if (!project) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, [field]: value } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  const deletePhotoSlot = async (photoId: number) => {
    if (window.confirm('完全に削除しますか？')) {
      if (!project) return;
      const newPhotos = project.photos.filter((p) => p.id !== photoId);
      const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
      setProject({ ...project, photos: renumbered });
      await updateDoc(doc(db, "projects", id!), { photos: renumbered });
    }
  };

  const addPhotoSlot = async () => {
    if (!project) return;
    const newPhotos: Photo[] = [...project.photos, { id: Date.now(), image: null, photoNumber: String(project.photos.length + 1), shootingDate: "", locationMap: "", process: "", description: "", circles: [], rotation: 0 }];
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  const movePhoto = async (index: number, direction: 'up' | 'down') => {
    if (!project) return;
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === project.photos.length - 1)) return;
    const newPhotos = [...project.photos];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    [newPhotos[index], newPhotos[targetIdx]] = [newPhotos[targetIdx], newPhotos[index]];
    const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
    setProject({ ...project, photos: renumbered });
    await updateDoc(doc(db, "projects", id!), { photos: renumbered });
  };

  const handleBulkUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!project) return;
    const files = Array.from(e.target.files as FileList);
    if (files.length === 0) return;
    setBulkUploading(true);
    let newPhotos = [...project.photos];
    let uploadedCount = 0;
    const todayStr = new Date().toLocaleDateString('ja-JP').replace(/\//g, '/');

    for (let i = 0; i < files.length; i++) {
      let targetIndex = newPhotos.findIndex(p => !p.image);
      if (targetIndex === -1) {
        newPhotos.push({ id: Date.now() + Math.random(), image: null, photoNumber: String(newPhotos.length + 1), shootingDate: "", locationMap: "", process: "", description: "", circles: [], rotation: 0 });
        targetIndex = newPhotos.length - 1;
      }
      await new Promise<void>((resolve) => {
        compressImage(files[i], async (compressed) => {
          try {
            const ext = getFileExtension(compressed);
            const r = ref(storage, `photos/${id}/${Date.now()}_bulk_${i}.${ext}`);
            await uploadBytes(r, compressed);
            const url = await getDownloadURL(r);
            newPhotos[targetIndex] = { ...newPhotos[targetIndex], image: url, shootingDate: todayStr, circles: [] };
          } catch {} finally { resolve(); }
        });
      });
      uploadedCount++;
      setBulkProgress(uploadedCount);
    }
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
    setBulkUploading(false);
  };

  const uploadPhoto = async (e: ChangeEvent<HTMLInputElement>, index: number) => {
    if (!project) return;
    const f = e.target.files?.[0];
    if (!f) return;
    const photoId = project.photos[index].id;
    setLoadingId(photoId);
    compressImage(f, async (file) => {
      try {
        const ext = getFileExtension(file);
        const r = ref(storage, `photos/${id}/${Date.now()}.${ext}`);
        await uploadBytes(r, file);
        const url = await getDownloadURL(r);
        const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, image: url, shootingDate: p.shootingDate || new Date().toLocaleDateString('ja-JP').replace(/\//g, '/'), circles: [] } : p);
        setProject({ ...project, photos: newPhotos });
        await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
      } catch { alert('失敗'); } finally { setLoadingId(null); }
    });
  };

  const addCircleToPhoto = async (e: MouseEvent<HTMLDivElement>, photoId: number) => {
    if (!project) return;
    if (selectedCircleId !== null) { setSelectedCircleId(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;
    const { x, y } = getSnappedPoint(rawX, rawY, photoId); // 磁石適用
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: [...(p.circles || []), { id: Date.now(), x, y, size: 20 }] } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  const updateCircle = async (photoId: number, circleId: number, newProps: Partial<Circle>) => {
    if (!project) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: p.circles.map((c) => c.id === circleId ? { ...c, ...newProps } : c) } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };
  
  const removeCircle = async (photoId: number, circleId: number) => {
    if (!project) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: p.circles.filter((c) => c.id !== circleId) } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
    setSelectedCircleId(null);
  };

  // ★ 複製機能
  const duplicateCircle = async (photoId: number, circleId: number) => {
    if (!project) return;
    const photo = project.photos.find(p => p.id === photoId);
    const circle = photo?.circles.find(c => c.id === circleId);
    if (!circle) return;
    const newCircle = { ...circle, id: Date.now() + Math.random(), x: Number(circle.x) + 5, y: Number(circle.y) + 5 };
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: [...(p.circles || []), newCircle] } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
    setSelectedCircleId(newCircle.id);
  };

  if (!project) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 font-sans pb-40 select-none overflow-x-hidden" onClick={() => setSelectedCircleId(null)}>
      <div className="max-w-2xl mx-auto pb-12">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-3 text-blue-600 mb-8 font-black text-xl px-6 py-3 hover:bg-blue-50 rounded-2xl transition-all active:scale-95"><ArrowLeft strokeWidth={4} /> 戻る</button>
        <h1 className="text-4xl font-black mb-10 text-gray-900 tracking-tighter">工事写真の登録と赤丸</h1>

        <div className="bg-white p-6 rounded-[2.5rem] border-2 border-gray-100 shadow-sm mb-12">
          <label className="flex items-center justify-center gap-4 w-full bg-blue-600 text-white font-black py-6 text-2xl rounded-3xl cursor-pointer shadow-[0_15px_40px_rgba(37,99,235,0.4)] hover:bg-blue-700 transition-all active:scale-95">
            <UploadCloud className="w-8 h-8" />
            {bulkUploading ? `アップロード中... (${bulkProgress}枚)` : "複数写真を一括追加"}
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleBulkUpload} disabled={bulkUploading} />
          </label>
        </div>

        <div className="space-y-16">
          {project.photos.map((photo, index) => (
            <div key={photo.id} className="bg-white p-8 rounded-[3rem] border-2 border-gray-100 shadow-2xl relative">
              <div className="absolute top-8 right-8 flex gap-4 z-10">
                <button onClick={() => movePhoto(index, 'up')} className="bg-white/90 backdrop-blur p-4 rounded-2xl shadow-lg border-2 border-gray-100 text-gray-700 hover:bg-white active:scale-90 transition-all"><ArrowUp className="w-7 h-7" /></button>
                <button onClick={() => movePhoto(index, 'down')} className="bg-white/90 backdrop-blur p-4 rounded-2xl shadow-lg border-2 border-gray-100 text-gray-700 hover:bg-white active:scale-90 transition-all"><ArrowDown className="w-7 h-7" /></button>
              </div>

              <div className="w-full min-h-[22rem] mt-12 bg-[#f1f5f9] rounded-[2.5rem] flex items-center justify-center overflow-hidden border-4 border-dashed border-gray-200 relative mb-10 transition-all hover:border-blue-400">
                {loadingId === photo.id ? (
                  <div className="flex flex-col items-center gap-6"><div className="w-14 h-14 border-6 border-blue-500 border-t-transparent rounded-full animate-spin"></div><span className="text-2xl font-black text-blue-600 tracking-widest">保存中...</span></div>
                ) : photo.image ? (
                  <div className="relative inline-block" onClick={(e) => addCircleToPhoto(e, photo.id)}>
                    <img src={proxyUrl(photo.image, photo.id)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-[70vh] pointer-events-none rounded-2xl shadow-2xl" style={{ transform: `rotate(${Number(photo.rotation || 0)}deg)` }} alt="" />
                    {(photo.circles || []).map((circle) => (
                      <PhotoCircleMarker key={circle.id} circle={circle} isSelected={selectedCircleId === circle.id} onSelect={() => setSelectedCircleId(circle.id)} onDragEnd={(x, y) => updateCircle(photo.id, circle.id, { x, y })} onSizeChange={(size) => updateCircle(photo.id, circle.id, { size })} onRemove={() => removeCircle(photo.id, circle.id)} onDuplicate={() => duplicateCircle(photo.id, circle.id)} />
                    ))}
                    <div className="absolute -top-6 -left-6 bg-black/80 backdrop-blur text-white text-sm px-6 py-3 rounded-full font-black pointer-events-none shadow-2xl border-2 border-white/20 animate-bounce">タップで赤丸を追加</div>
                  </div>
                ) : (
                  <div className="text-center text-gray-300 py-16"><Camera className="w-24 h-24 mx-auto mb-6 opacity-20" /><span className="text-2xl font-black block">画像を選択してください</span></div>
                )}
              </div>

              <div className="flex justify-between items-center mb-8 pb-8 border-b-4 border-gray-50">
                <div className="font-black text-gray-900 text-3xl flex items-center gap-4"><span className="bg-gray-900 text-white w-12 h-12 flex items-center justify-center rounded-2xl text-xl">{index + 1}</span> 写真</div>
                <div className="flex gap-4">
                  <button type="button" onClick={() => updatePhoto(photo.id, 'rotation', ((Number(photo.rotation || 0)) + 90) % 360)} className="p-4 text-gray-700 bg-gray-100 rounded-[1.5rem] border-2 border-gray-200 font-bold hover:bg-gray-200 active:scale-95 flex items-center gap-2">↻ 回転</button>
                  <button onClick={() => deletePhotoSlot(photo.id)} className="p-4 text-red-500 bg-red-50 rounded-[1.5rem] border-2 border-red-100 hover:bg-red-100 active:scale-95"><Trash2 className="w-7 h-7"/></button>
                  <label className="bg-blue-100 text-blue-800 font-black py-4 px-8 rounded-[1.5rem] cursor-pointer shadow-md border-2 border-blue-200 hover:bg-blue-200 active:scale-95 text-lg">
                    {photo.image ? '変更' : '選択'} <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e, index)} />
                  </label>
                </div>
              </div>

              <div className="space-y-8">
                <div className="flex items-center gap-6 bg-gray-50 p-6 rounded-[2rem] border-2 border-gray-100">
                  <div className="font-black text-gray-500 whitespace-nowrap text-xl">撮影日:</div>
                  <input type="date" className="w-full bg-transparent text-2xl font-bold outline-none focus:text-blue-600" value={formatToYMD(photo.shootingDate)} onChange={(e) => updatePhoto(photo.id, "shootingDate", formatToYMDSlash(e.target.value))} />
                </div>

                <button onClick={() => { setCurrentPhotoId(photo.id); setModalOpen(true); }} className={`w-full p-8 text-2xl border-4 rounded-[2rem] text-left flex justify-between items-center transition-all ${photo.locationMap ? 'text-red-700 font-black border-red-200 bg-red-50 shadow-lg shadow-red-100' : 'text-gray-400 font-bold border-gray-200 bg-white hover:border-gray-400'}`}>
                  {photo.locationMap || '▼ 場所を選択（符号と連動）'} <MapPin className={`w-10 h-10 ${photo.locationMap ? 'text-red-500' : 'text-gray-300'}`} />
                </button>

                <div className="space-y-3">
                  <label className="text-sm font-black text-gray-400 pl-4 uppercase tracking-[0.2em]">工程 / PROCESS</label>
                  <select className="w-full p-6 text-2xl font-black border-4 border-gray-100 rounded-[2rem] bg-gray-50 focus:border-blue-500 focus:bg-white transition-all outline-none" value={photo.process} onChange={(e) => updatePhoto(photo.id, "process", e.target.value)}>
                    <option value="">-- 工程を選択 --</option>
                    {processOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-black text-gray-400 pl-4 uppercase tracking-[0.2em]">説明 / DESCRIPTION</label>
                  <div className="flex flex-wrap gap-3 mb-2">
                    {descTemplates.map((tmpl, i) => (
                      <button key={i} type="button" onClick={() => updatePhoto(photo.id, "description", (photo.description || "") + tmpl.text)} className="text-base font-black text-blue-700 bg-blue-50 border-2 border-blue-100 px-6 py-3 rounded-2xl hover:bg-blue-100 active:scale-95 shadow-sm">＋{tmpl.label}</button>
                    ))}
                  </div>
                  <textarea rows={4} className="w-full p-8 text-2xl font-bold border-4 border-gray-100 rounded-[2.5rem] bg-gray-50 focus:border-blue-500 focus:bg-white transition-all outline-none shadow-inner" value={photo.description} onChange={(e) => updatePhoto(photo.id, "description", e.target.value)} placeholder="現場状況の詳細を入力" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={addPhotoSlot} className="w-full mt-24 bg-gray-900 text-white font-black py-8 text-3xl rounded-[3rem] shadow-[0_20px_60px_rgba(0,0,0,0.3)] flex items-center justify-center gap-6 hover:bg-black transition-all active:scale-95 mb-20"><Plus className="w-10 h-10" strokeWidth={4} /> 写真枠を追加する</button>
      </div>
      <PinSelectModal isOpen={modalOpen} onClose={() => setModalOpen(false)} pins={project?.mapPins} onSelect={(label) => currentPhotoId && updatePhoto(currentPhotoId, "locationMap", label)} />
    </div>
  );
}