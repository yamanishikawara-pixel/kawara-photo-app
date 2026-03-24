import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, Trash2, ArrowLeft, ArrowUp, ArrowDown, UploadCloud, MapPin, X, Plus } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { compressImage, proxyUrl, useDraggablePin } from '../shared/utils';
import type { Circle, MapPin as MapPinT, Photo, Project } from '../types';
import type { ChangeEvent, MouseEvent } from 'react';

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

function PhotoCircleMarker({
  circle,
  isSelected,
  onSelect,
  onDragEnd,
  onSizeChange,
  onRemove,
}: {
  circle: Circle;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onSizeChange: (size: number) => void;
  onRemove: () => void;
}) {
  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(circle.x, circle.y, onDragEnd);

  return (
    <>
      <div
        ref={containerRef}
        onMouseDown={(e) => { e.stopPropagation(); onSelect(); onMouseDown(e); }}
        onTouchStart={(e) => { e.stopPropagation(); onSelect(); onTouchStart(e); }}
        style={{ left: `${position.x}%`, top: `${position.y}%`, width: `${circle.size}%`, transform: 'translate(-50%, -50%)', touchAction: 'none' }}
        className={`absolute aspect-square rounded-full border-[4px] border-red-500 shadow-sm ${dragging ? 'z-30 opacity-70' : 'z-20 cursor-pointer'} ${isSelected ? 'border-dashed bg-red-500/20' : ''}`}
      />
      {isSelected && !dragging && (
        <div style={{ left: `${position.x}%`, top: `${position.y + circle.size/2 + 5}%`, transform: 'translateX(-50%)' }} className="absolute z-40 flex bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          <button onClick={(e) => {e.stopPropagation(); onSizeChange(Math.min(60, circle.size * 1.2))}} className="px-4 py-2 text-xl font-bold hover:bg-gray-100 text-gray-700">+</button>
          <button onClick={(e) => {e.stopPropagation(); onSizeChange(Math.max(5, circle.size * 0.8))}} className="px-4 py-2 text-xl font-bold border-l border-r hover:bg-gray-100 text-gray-700">-</button>
          <button onClick={(e) => {e.stopPropagation(); onRemove()}} className="px-4 py-2 text-red-500 hover:bg-red-50"><Trash2 className="w-5 h-5"/></button>
        </div>
      )}
    </>
  )
}

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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-xl space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center pb-2 border-b">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2"><MapPin className="text-red-500 w-6 h-6"/> 位置図の場所を選択</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-6 h-6"/></button>
        </div>
        {pins && pins.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-2">
            {pins.map((pin) => (
              <button key={pin.id} onClick={() => { onSelect(pin.label); onClose(); }} className="bg-gray-100 text-gray-800 border-2 border-gray-200 font-bold py-3 text-center rounded-xl text-lg shadow-sm hover:border-red-400 hover:bg-red-50 hover:text-red-700 transition-all">{pin.label}</button>
            ))}
            <button onClick={() => { onSelect(""); onClose(); }} className="col-span-3 bg-gray-50 text-gray-500 font-bold py-3 text-center rounded-xl text-sm shadow-inner mt-2">選択を解除</button>
          </div>
        ) : (
          <div className="text-center py-10 px-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200"><p className="text-gray-500 font-bold">先に位置図画面でマーカーを打ってください</p></div>
        )}
      </div>
    </div>
  );
}

const formatToYMD = (dateString: string) => dateString ? dateString.replace(/\//g, '-') : '';
const formatToYMDSlash = (dateString: string) => dateString ? dateString.replace(/-/g, '/') : '';

export default function PhotoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
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
          if (data.customProcesses) setProcessOptions(data.customProcesses);
          if (data.customDescTemplates) setDescTemplates(data.customDescTemplates);
        }
      }
    });
    return () => unsub();
  }, [id]);

  const updatePhoto = async (photoId: number, field: string, value: any) => {
    if (!project) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, [field]: value } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  const deletePhotoSlot = async (photoId: number) => {
    if (!window.confirm('この写真枠を完全に削除しますか？') || !project) return;
    const newPhotos = project.photos.filter((p) => p.id !== photoId);
    const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
    setProject({ ...project, photos: renumbered });
    await updateDoc(doc(db, "projects", id!), { photos: renumbered });
  };

  const clearPhoto = async (photoId: number) => {
    if (!window.confirm('この枠の画像を削除しますか？') || !project) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, image: null, circles: [], rotation: 0 } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
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
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newPhotos[index], newPhotos[targetIndex]] = [newPhotos[targetIndex], newPhotos[index]];
    const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
    setProject({ ...project, photos: renumbered });
    await updateDoc(doc(db, "projects", id!), { photos: renumbered });
  };

  const uploadPhoto = async (e: ChangeEvent<HTMLInputElement>, index: number) => {
    if (!project) return;
    const f = e.target.files?.[0];
    if (!f) return;
    const photoId = project.photos[index].id;
    setLoadingId(photoId);
    const today = new Date().toLocaleDateString('ja-JP').replace(/\//g, '/');
    compressImage(f, async (file) => {
      try {
        const r = ref(storage, `photos/${id}/${Date.now()}_${file.name}`);
        await uploadBytes(r, file);
        const url = await getDownloadURL(r);
        const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, image: url, shootingDate: p.shootingDate || today, circles: [] } : p);
        setProject({ ...project, photos: newPhotos });
        await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
      } catch { alert('失敗'); } finally { setLoadingId(null); }
    });
  };

  const handleBulkUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!project) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setBulkUploading(true);
    let newPhotos = [...project.photos];
    const today = new Date().toLocaleDateString('ja-JP').replace(/\//g, '/');
    for (let i = 0; i < files.length; i++) {
      let targetIdx = newPhotos.findIndex(p => !p.image);
      if (targetIdx === -1) {
        newPhotos.push({ id: Date.now() + Math.random(), image: null, photoNumber: String(newPhotos.length + 1), shootingDate: "", locationMap: "", process: "", description: "", circles: [], rotation: 0 });
        targetIdx = newPhotos.length - 1;
      }
      await new Promise<void>((resolve) => {
        compressImage(files[i], async (compressed) => {
          try {
            const r = ref(storage, `photos/${id}/${Date.now()}_bulk_${i}.jpg`);
            await uploadBytes(r, compressed);
            const url = await getDownloadURL(r);
            newPhotos[targetIdx] = { ...newPhotos[targetIdx], image: url, shootingDate: today, circles: [] };
          } catch {} finally { resolve(); }
        });
      });
    }
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
    setBulkUploading(false);
  };

  const addCircleToPhoto = async (e: MouseEvent<HTMLDivElement>, photoId: number) => {
    if (!project || selectedCircleId !== null) { setSelectedCircleId(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: [...(p.circles || []), { id: Date.now(), x, y, size: 20 }] } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  const updateCircle = async (photoId: number, circleId: number, newProps: Partial<Circle>) => {
    if (!project) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: p.circles.map(c => c.id === circleId ? { ...c, ...newProps } : c) } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };
  
  const removeCircle = async (photoId: number, circleId: number) => {
    if (!project) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: p.circles.filter(c => c.id !== circleId) } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
    setSelectedCircleId(null);
  };

  const rotatePhoto = async (photoId: number) => {
    if (!project) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, rotation: ((p.rotation || 0) + 90) % 360 } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  if (!project) return <div className="p-10 text-center font-bold text-gray-500">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans" onClick={() => setSelectedCircleId(null)} lang="ja">
      <div className="max-w-md mx-auto pb-12">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold"><ArrowLeft className="w-6 h-6" /> もどる</button>
        <h1 className="text-3xl font-bold mb-6 text-gray-900">写真の登録と赤丸</h1>

        <label className="flex items-center justify-center gap-2 w-full bg-blue-500 text-white font-bold py-4 rounded-xl shadow-md mb-6 cursor-pointer">
          <UploadCloud className="w-6 h-6" /> {bulkUploading ? 'アップロード中...' : '写真を一括追加'}
          <input type="file" multiple accept="image/*" className="hidden" onChange={handleBulkUpload} disabled={bulkUploading} />
        </label>

        <div className="space-y-8">
          {project.photos.map((photo, index) => (
            <div key={photo.id} className="bg-white p-5 rounded-3xl border border-black/5 shadow-md relative">
              <div className="absolute top-4 right-4 flex gap-2 z-10">
                <button onClick={() => movePhoto(index, 'up')} className="bg-white p-2 rounded-lg border"><ArrowUp className="w-5 h-5" /></button>
                <button onClick={() => movePhoto(index, 'down')} className="bg-white p-2 rounded-lg border"><ArrowDown className="w-5 h-5" /></button>
              </div>

              <div className="w-full aspect-video bg-gray-100 rounded-2xl overflow-hidden border-2 border-dashed border-gray-300 relative mb-4 mt-8 flex items-center justify-center">
                {loadingId === photo.id ? (
                  <span className="font-bold text-blue-500">保存中...</span>
                ) : photo.image ? (
                  <div className="relative w-full h-full" onClick={(e) => addCircleToPhoto(e, photo.id)}>
                    <img
                      src={proxyUrl(photo.image, photo.id)}
                      crossOrigin="anonymous"
                      className="block w-full h-full object-contain pointer-events-none"
                      style={{ transform: `rotate(${photo.rotation || 0}deg)` }}
                      alt=""
                    />
                    {(photo.circles || []).map((circle) => (
                      <PhotoCircleMarker key={circle.id} circle={circle} isSelected={selectedCircleId === circle.id} onSelect={() => setSelectedCircleId(circle.id)} onDragEnd={(x, y) => updateCircle(photo.id, circle.id, { x, y })} onSizeChange={(size) => updateCircle(photo.id, circle.id, { size })} onRemove={() => removeCircle(photo.id, circle.id)} />
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-400 flex flex-col items-center">
                    <Camera className="w-10 h-10 mb-2" />
                    <span className="font-bold">画像を選択</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center mb-5 border-b pb-4">
                <div className="font-bold text-xl">写真 {index + 1}</div>
                <div className="flex gap-2">
                  <button onClick={() => rotatePhoto(photo.id)} className="p-2.5 text-gray-500 bg-gray-50 rounded-xl border">↻ 回転</button>
                  <button onClick={() => photo.image ? clearPhoto(photo.id) : deletePhotoSlot(photo.id)} className="p-2.5 text-gray-400 hover:text-red-500 bg-gray-50 rounded-xl border"><Trash2 className="w-5 h-5"/></button>
                  <label className="bg-blue-100 text-blue-700 font-bold py-2.5 px-5 rounded-xl cursor-pointer">
                    {photo.image ? '変更' : '選択'} <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e, index)} />
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-600 min-w-[4rem]">撮影日:</span>
                  <input type="date" className="w-full p-3 border rounded-xl" value={formatToYMD(photo.shootingDate)} onChange={(e) => updatePhoto(photo.id, "shootingDate", formatToYMDSlash(e.target.value))} />
                </div>
                <button onClick={() => { setCurrentPhotoId(photo.id); setModalOpen(true); }} className={`w-full p-4 border-2 rounded-xl text-left flex justify-between items-center ${photo.locationMap ? 'text-red-700 font-bold border-red-300 bg-red-50' : 'text-gray-500 border-gray-300 bg-gray-50'}`}>
                  {photo.locationMap || '▼ 位置を選択'} <MapPin className="w-6 h-6" />
                </button>
                <select className="w-full p-3 border rounded-xl bg-white" value={photo.process} onChange={(e) => updatePhoto(photo.id, "process", e.target.value)}>
                  <option value="">-- 工程を選択 --</option>
                  {processOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <div className="flex flex-wrap gap-1.5">
                  {descTemplates.map((tmpl, i) => (
                    <button key={i} onClick={() => updatePhoto(photo.id, "description", (photo.description || '') + tmpl.text)} className="text-[10px] font-bold text-blue-700 bg-blue-50 border px-2 py-1 rounded-lg">＋{tmpl.label}</button>
                  ))}
                </div>
                <textarea rows={3} className="w-full p-3 border rounded-xl" value={photo.description} onChange={(e) => updatePhoto(photo.id, "description", e.target.value)} placeholder="説明入力" />
              </div>
            </div>
          ))}
        </div>
        
        <button onClick={addPhotoSlot} className="w-full mt-8 bg-gray-800 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2">
          <Plus className="w-6 h-6" /> 写真枠を追加
        </button>
      </div>

      <PinSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        pins={project.mapPins}
        onSelect={(label) => currentPhotoId && updatePhoto(currentPhotoId, "locationMap", label)}
      />
    </div>
  );
}