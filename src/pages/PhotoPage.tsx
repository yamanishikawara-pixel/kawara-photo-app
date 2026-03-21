import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, Trash2, ArrowLeft, ArrowUp, ArrowDown, UploadCloud, MapPin, X, Plus, Sparkles } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { compressImage, proxyUrl, useDraggablePin } from '../shared/utils';
import type { Circle, MapPin as MapPinT, Photo, Project } from '../types';
import type { ChangeEvent, MouseEvent } from 'react';

// ==========================================
// ★ 魔法の言葉（定型文）の辞書
// ==========================================
const PRESET_WORDS = {
  process: [
    "着工前", "下地、下葺き", "重ね幅（タテ）：", "重ね幅（ヨコ）：", 
    "平行壁立ち上げ高：", "流れ壁立ち上げ高：", "棟芯より重ね：", 
    "緊結状況", "瓦施工", "確認"
  ],
  description: [
    "瓦割れ", "ズレ", "凍害", "漆喰剥がれ", "棟の歪み", 
    "雨漏り跡", "下地腐食", "ルーフィング破れ",
    "新規瓦葺き", "漆喰詰め直し", "ビス止め固定", "防水テープ処理"
  ]
};

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

  const [lastTap, setLastTap] = useState(0);
  const handleTap = (e: any) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTap < 300) {
      onRemove();
    } else {
      setLastTap(now);
      onSelect();
      if (e.type === 'mousedown') onMouseDown(e);
      if (e.type === 'touchstart') onTouchStart(e);
    }
  };

  return (
    <>
      <div
        ref={containerRef}
        onMouseDown={handleTap}
        onTouchStart={handleTap}
        onClick={(e) => e.stopPropagation()} // ★これを追加！タップが背景に突き抜けるのを絶対防ぐ壁！
        style={{ left: `${position.x}%`, top: `${position.y}%`, width: `${circle.size}%`, transform: 'translate(-50%, -50%)', touchAction: 'none' }}
        className={`absolute aspect-square rounded-full border-[3px] border-red-500 shadow-sm ${dragging ? 'z-30 opacity-70 scale-110' : 'z-20 cursor-pointer'} ${isSelected ? 'border-dashed bg-red-500/20' : ''}`}
      />
      {isSelected && !dragging && (
        <div onClick={(e) => e.stopPropagation()} style={{ left: `${position.x}%`, top: `${position.y + circle.size/2 + 8}%`, transform: 'translateX(-50%)' }} className="absolute z-40 flex bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          <button onClick={(e) => {e.stopPropagation(); onSizeChange(Math.min(60, circle.size * 1.3))}} className="px-4 py-2 text-xl font-bold hover:bg-gray-100 text-gray-700">+</button>
          <button onClick={(e) => {e.stopPropagation(); onSizeChange(Math.max(5, circle.size * 0.7))}} className="px-4 py-2 text-xl font-bold border-l border-r hover:bg-gray-100 text-gray-700">-</button>
          <button onClick={(e) => {e.stopPropagation(); onRemove()}} className="px-4 py-2 text-red-500 hover:bg-red-50 flex items-center justify-center gap-1 font-bold"><Trash2 className="w-5 h-5"/> 消す</button>
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
          <div className="text-center py-10 px-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200"><p className="text-gray-500 font-bold">先に位置図画面で<br/>マーカーを打ってください</p></div>
        )}
      </div>
    </div>
  );
}

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

  useEffect(() => { getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data() as Project)); }, [id]);

  type EditablePhotoField = keyof Pick<
    Photo,
    'image' | 'photoNumber' | 'shootingDate' | 'locationMap' | 'process' | 'description' | 'circles'
  >;

  const updatePhoto = async (photoId: number, field: EditablePhotoField, value: Photo[EditablePhotoField]) => {
    if (!project) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, [field]: value } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  const appendWord = (photoId: number, field: 'process' | 'description', word: string, currentValue: string) => {
    const newValue = currentValue ? `${currentValue} ${word}` : word;
    updatePhoto(photoId, field, newValue);
  };

  const deletePhotoSlot = async (photoId: number) => {
    if (window.confirm('この写真枠を完全に削除しますか？')) {
      if (!project) return;
      const newPhotos = project.photos.filter((p) => p.id !== photoId);
      const renumbered = newPhotos.map((p, i: number) => ({ ...p, photoNumber: String(i + 1) }));
      setProject({ ...project, photos: renumbered });
      await updateDoc(doc(db, "projects", id!), { photos: renumbered });
    }
  };

  const clearPhoto = async (photoId: number) => {
    if (window.confirm('この枠の画像を削除しますか？（文字は残ります）')) {
      if (!project) return;
      const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, image: null, circles: [] } : p);
      setProject({ ...project, photos: newPhotos });
      await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
    }
  };

  const addPhotoSlot = async () => {
    if (!project) return;
    const newPhotos: Photo[] = [
      ...project.photos,
      {
        id: Date.now(),
        image: null,
        photoNumber: String(project.photos.length + 1),
        shootingDate: "",
        locationMap: "",
        process: "",
        description: "",
        circles: [],
        rotation: 0,
      },
    ];
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  const movePhoto = async (index: number, direction: 'up' | 'down') => {
    if (!project) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === project.photos.length - 1) return;
    const newPhotos = [...project.photos];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newPhotos[index], newPhotos[targetIndex]] = [newPhotos[targetIndex], newPhotos[index]];
    const renumberedPhotos = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
    setProject({ ...project, photos: renumberedPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: renumberedPhotos });
  };

  const handleBulkUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!project) return;
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
          id: Date.now() + Math.random(),
          image: null,
          photoNumber: String(newPhotos.length + 1),
          shootingDate: "",
          locationMap: "",
          process: "",
          description: "",
          circles: [],
          rotation: 0,
        });
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

  const uploadPhoto = async (e: ChangeEvent<HTMLInputElement>, index: number) => {
    if (!project) return;
    const f = e.target.files?.[0];
    if (!f) return;
    const photoId = project.photos[index].id;
    setLoadingId(photoId);
    compressImage(f, async (file) => {
      const r = ref(storage, `photos/${id}/${Date.now()}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      const newPhotos = project.photos.map((p, i: number) => p.id === photoId ? { ...p, image: url, photoNumber: String(i + 1), shootingDate: new Date().toLocaleDateString('ja-JP'), circles: [] } : p);
      setProject({ ...project, photos: newPhotos });
      await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
      setLoadingId(null);
    });
  };

  const addCircleToPhoto = async (e: MouseEvent<HTMLDivElement>, photoId: number) => {
    if (!project) return;
    if (selectedCircleId !== null) { setSelectedCircleId(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const newPhotos = project.photos.map((p) => {
      if (p.id === photoId) return { ...p, circles: [...(p.circles || []), { id: Date.now(), x, y, size: 20 }] };
      return p;
    });
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

  const rotatePhoto = async (photoId: number, direction: 'left' | 'right') => {
    if (!project) return;
    const delta = direction === 'left' ? -90 : 90;
    const newPhotos = project.photos.map((p) =>
      p.id === photoId
        ? {
            ...p,
            rotation: (((p.rotation ?? 0) + delta + 360) % 360),
          }
        : p,
    );
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };

  if (!project) return <div className="p-10 text-center font-bold text-gray-500">読み込み中...</div>;

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
          {project.photos.map((photo, index: number) => (
            <div key={photo.id} className="bg-white p-5 rounded-3xl border border-black/5 shadow-md relative">
              <div className="absolute top-4 right-4 flex gap-2 z-10">
                <button onClick={() => movePhoto(index, 'up')} className="bg-white p-2 rounded-lg shadow border border-gray-200 text-gray-600 hover:bg-gray-50"><ArrowUp className="w-5 h-5" /></button>
                <button onClick={() => movePhoto(index, 'down')} className="bg-white p-2 rounded-lg shadow border border-gray-200 text-gray-600 hover:bg-gray-50"><ArrowDown className="w-5 h-5" /></button>
              </div>

              <div className="w-full min-h-[16rem] mt-10 bg-gray-100 rounded-2xl flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300 relative mb-4 p-2">
                {loadingId === photo.id ? (
                  <span className="text-lg font-bold text-blue-500">保存中...</span>
                ) : photo.image ? (
                  <div className="relative inline-block" onClick={(e) => addCircleToPhoto(e, photo.id)}>
                    <img
                      src={proxyUrl(photo.image, photo.id)}
                      crossOrigin="anonymous"
                      className="block w-auto h-auto max-w-full max-h-[60vh] pointer-events-none rounded shadow-sm"
                      style={{
                        transform: `rotate(${photo.rotation ?? 0}deg)`,
                        transformOrigin: 'center center',
                      }}
                      alt=""
                    />
                    {(photo.circles || []).map((circle) => (
                      <PhotoCircleMarker key={circle.id} circle={circle} isSelected={selectedCircleId === circle.id} onSelect={() => setSelectedCircleId(circle.id)} onDragEnd={(x: number, y: number) => updateCircle(photo.id, circle.id, { x, y })} onSizeChange={(size: number) => updateCircle(photo.id, circle.id, { size })} onRemove={() => removeCircle(photo.id, circle.id)} />
                    ))}
                    <div className="absolute -top-3 -left-3 bg-black/70 text-white text-xs px-2 py-1 rounded-full font-bold pointer-events-none shadow">タップで選択・削除<br/>(長押しで移動)</div>
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
                  <div className="flex gap-1 mr-1">
                    <button
                      type="button"
                      onClick={() => rotatePhoto(photo.id, 'left')}
                      className="p-2.5 text-gray-500 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100"
                    >
                      ↺
                    </button>
                    <button
                      type="button"
                      onClick={() => rotatePhoto(photo.id, 'right')}
                      className="p-2.5 text-gray-500 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100"
                    >
                      ↻
                    </button>
                  </div>
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

              <div className="space-y-4">
                <button onClick={() => { setCurrentPhotoId(photo.id); setModalOpen(true); }} className={`w-full p-4 text-lg border-2 rounded-xl text-left flex justify-between items-center ${photo.locationMap ? 'text-red-700 font-bold border-red-300 bg-red-50' : 'text-gray-500 border-gray-300 bg-gray-50'}`}>
                  {photo.locationMap || '▼ どの場所の写真ですか？（タップして選択）'}
                  <MapPin className={`w-6 h-6 ${photo.locationMap ? 'text-red-500' : 'text-gray-400'}`} />
                </button>

                {/* ★ここに追加：撮影日の自由編集欄 */}
                <div className="relative pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-bold text-gray-600">撮影日</label>
                  </div>
                  <input type="text" placeholder="例: 2026/3/21" className="w-full p-3.5 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" value={photo.shootingDate || ''} onChange={(e) => updatePhoto(photo.id, "shootingDate", e.target.value)} />
                </div>

                <div className="relative pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-bold text-gray-600">工程</label>
                  </div>
                  <input type="text" placeholder="例: 現状、施工中" className="w-full p-3.5 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" value={photo.process || ''} onChange={(e) => updatePhoto(photo.id, "process", e.target.value)} />
                  
                  <div className="flex flex-wrap gap-2 mt-2">
                    {PRESET_WORDS.process.map(word => (
                      <button key={word} onClick={() => appendWord(photo.id, 'process', word, photo.process || '')} className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm">
                        + {word}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-bold text-gray-600">説明</label>
                  </div>
                  <textarea placeholder="例: 瓦割れ、ズレあり" rows={2} className="w-full p-3.5 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" value={photo.description || ''} onChange={(e) => updatePhoto(photo.id, "description", e.target.value)} />
                  
                  <div className="flex flex-wrap gap-2 mt-2">
                    {PRESET_WORDS.description.map(word => (
                      <button key={word} onClick={() => appendWord(photo.id, 'description', word, photo.description || '')} className="bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> {word}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          ))}
        </div>
        
        <button onClick={addPhotoSlot} className="w-full mt-8 bg-gray-800 text-white font-bold py-4 text-lg rounded-xl shadow-lg flex items-center justify-center gap-2 hover:bg-gray-700">
          <Plus className="w-6 h-6" /> 写真枠を1つ追加する
        </button>

      </div>
      <PinSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        pins={project.mapPins}
        onSelect={(label: string) => {
          if (!currentPhotoId) return;
          void updatePhoto(currentPhotoId, "locationMap", label);
        }}
      />
    </div>
  );
}