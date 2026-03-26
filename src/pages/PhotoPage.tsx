import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, Trash2, ArrowLeft, ArrowUp, ArrowDown, UploadCloud, MapPin, X, Plus, Edit2, Ruler, Paintbrush, CaseUpper } from 'lucide-react'; // CaseUpperを追加
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { compressImage, proxyUrl, useDraggablePin } from '../shared/utils';
import type { Circle, MapPin as MapPinT, Photo, Project, DimensionLine } from '../types';
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

const COLOR_PALETTE = [
  { name: "Yellow", value: "#FFD700" },
  { name: "White", value: "#FFFFFF" },
  { name: "Black", value: "#000000" },
  { name: "Red", value: "#FF4500" },
];

// ★ 改良：お客様説明用のよく使う部位名
const DEFAULT_ROOF_PART_NAMES = ['棟', '袖', 'ケラバ', '谷', '隅棟', '平', '軒先'];

// SVGで寸法線とテキストを描画するコンポーネント（ドラッグ移動 ＋ 部位名クイック入力機能付き）
function DimensionLineMarker({ line, isSelected, onSelect, onRemove, onTextChange, onUpdate }: { line: DimensionLine; isSelected: boolean; onSelect: () => void; onRemove: () => void; onTextChange: (text: string) => void; onUpdate: (props: Partial<DimensionLine>) => void; }) {
  const inputRef = useRef<HTMLInputElement>(null);
  
  // ドラッグ操作用のローカルステート
  const [localStart, setLocalStart] = useState(line.start);
  const [localEnd, setLocalEnd] = useState(line.end);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);

  // 外部からの更新を同期
  useEffect(() => {
    if (!isDragging) {
      setLocalStart(line.start);
      setLocalEnd(line.end);
    }
  }, [line.start, line.end, isDragging]);

  // フォーカス制御（ドラッグ調整後に毎回キーボードが出るのを防ぐ）
  useEffect(() => {
    if (isSelected && inputRef.current && !isDragging && !line.text) {
      inputRef.current.focus();
    }
  }, [isSelected, isDragging, line.text]);

  const startDrag = (e: React.PointerEvent, type: 'start' | 'end') => {
    e.stopPropagation();
    setIsDragging(type);
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId); 
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const rect = (e.currentTarget as Element).closest('.cursor-crosshair')?.getBoundingClientRect();
    if (!rect) return;
    
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    
    if (isDragging === 'start') setLocalStart({ x, y });
    else setLocalEnd({ x, y });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const el = e.currentTarget as Element;
    el.releasePointerCapture(e.pointerId);
    onUpdate({ start: localStart, end: localEnd }); 
    setIsDragging(null);
  };

  // 部位名をテキスト入力欄にクイック追加
  const addPartName = (name: string) => {
    if (inputRef.current) {
      const currentText = inputRef.current.value;
      const newText = currentText.startsWith(name) ? currentText : `${name} ${currentText}`; // 重複防止
      onTextChange(newText);
      inputRef.current.focus();
    }
  };

  const midPoint = { x: (localStart.x + localEnd.x) / 2, y: (localStart.y + localEnd.y) / 2 };
  
  // 見切れ防止リミッター
  const safePopupX = Math.max(15, Math.min(85, midPoint.x));
  const safePopupY = Math.max(15, Math.min(85, midPoint.y));

  const color = line.color || "#FFFFFF"; 
  const thickness = Number(line.size || 2); 

  return (
    <>
      <svg className="absolute inset-0 z-20 pointer-events-none w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <marker id={`cad-tick-${line.id}`} markerWidth="16" markerHeight="16" refX="8" refY="8" orient="auto" markerUnits="userSpaceOnUse">
            <line x1="0" y1="8" x2="16" y2="8" stroke={color} strokeWidth={thickness} />
            <line x1="4" y1="12" x2="12" y2="4" stroke={color} strokeWidth={thickness * 1.5} />
          </marker>
        </defs>
        <line
          x1={`${localStart.x}%`}
          y1={`${localStart.y}%`}
          x2={`${localEnd.x}%`}
          y2={`${localEnd.y}%`}
          stroke={color}
          strokeWidth={thickness}
          fill="none"
          markerStart={`url(#cad-tick-${line.id})`}
          markerEnd={`url(#cad-tick-${line.id})`}
          className="pointer-events-auto cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        />
      </svg>
      
      {/* 選択時の入力フォーム（ドラッグ中は邪魔にならないように隠す） */}
      {isSelected && !isDragging && (
        <div style={{ left: `${safePopupX}%`, top: `${safePopupY}%` }} className="absolute z-30 translate-x-[-50%] translate-y-[-50%] flex flex-col items-center gap-4 bg-white p-6 rounded-2xl shadow-3xl border-2 border-gray-100 min-w-[280px]" onClick={e => e.stopPropagation()}>
          <div className="flex w-full gap-3 items-center justify-between border-b-2 border-gray-100 pb-3">
             <h4 className="text-xl font-black text-gray-900 flex items-center gap-2"><CaseUpper className="w-6 h-6 text-blue-500"/> 部位と寸法を入力</h4>
             <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-3 text-red-500 bg-red-50 rounded-xl hover:bg-red-100"><Trash2 className="w-6 h-6" /></button>
          </div>

          {/* ★ 改良：部位名のクイック選択ボタン群 */}
          <div className="flex flex-wrap gap-2.5 w-full">
            {DEFAULT_ROOF_PART_NAMES.map(name => (
              <button 
                key={name}
                onClick={() => addPartName(name)}
                className="text-base font-black text-blue-700 bg-blue-50 border-2 border-blue-100 px-5 py-3 rounded-2xl hover:bg-blue-100 hover:border-blue-200 active:scale-95 shadow-sm transition-all"
              >
                ＋{name}
              </button>
            ))}
          </div>

          <div className="flex w-full gap-3">
            <input
              ref={inputRef}
              type="text"
              value={line.text}
              onChange={(e) => onTextChange(e.target.value)}
              className="w-full bg-gray-50 border-2 border-gray-100 p-4 text-xl font-bold rounded-xl outline-none focus:border-blue-400 focus:bg-white text-center shadow-inner"
              placeholder="部位 〇〇m (例: 棟 5.5m)"
            />
          </div>
          <p className="text-xs text-blue-500 font-bold tracking-wider -mt-1">端の青い丸をドラッグで位置調整</p>
        </div>
      )}

      {/* 選択時のみ表示されるドラッグ用の操作ハンドル */}
      {isSelected && (
        <>
          <div
            className="absolute z-40 w-12 h-12 -ml-6 -mt-6 bg-blue-500/20 border-4 border-blue-500 rounded-full cursor-move touch-none backdrop-blur-sm shadow-xl"
            style={{ left: `${localStart.x}%`, top: `${localStart.y}%` }}
            onPointerDown={(e) => startDrag(e, 'start')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="absolute z-40 w-12 h-12 -ml-6 -mt-6 bg-blue-500/20 border-4 border-blue-500 rounded-full cursor-move touch-none backdrop-blur-sm shadow-xl"
            style={{ left: `${localEnd.x}%`, top: `${localEnd.y}%` }}
            onPointerDown={(e) => startDrag(e, 'end')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={(e) => e.stopPropagation()}
          />
        </>
      )}
      
      {/* 未選択時のテキスト */}
      {!isSelected && line.text && (
        <div
          style={{ 
            left: `${midPoint.x}%`, 
            top: `${midPoint.y}%`, 
            color: color, 
            backgroundColor: 'rgba(0, 0, 0, 0.4)', // CAD図面のように線をマスクして文字を置く（image 42.png仕様）
            backdropFilter: 'blur(2px)'
          }}
          className="absolute z-20 translate-x-[-50%] translate-y-[-50%] font-bold text-xl px-2.5 py-1 rounded pointer-events-none whitespace-nowrap border border-white/10 shadow-sm"
        >
          {line.text}
        </div>
      )}
    </>
  );
}

// 写真上の赤丸マーカー（ビシッと止まるプロ仕様版）
function PhotoCircleMarker({ circle, isSelected, onSelect, onDragEnd, onSizeChange, onRemove }: { circle: Circle; isSelected: boolean; onSelect: () => void; onDragEnd: (x: number, y: number) => void; onSizeChange: (size: number) => void; onRemove: () => void; }) {
  
  // ★追加：見えない方眼紙。1%刻みで数値を丸めることで、ビシッと止まるようにする
  const snap = (value: number) => Math.round(value);

  const handleDragEnd = (x: number, y: number) => {
    onDragEnd(snap(x), snap(y));
  };

  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(circle.x, circle.y, handleDragEnd);
  
  const size = snap(Number(circle.size || 20));
  const snappedX = snap(position.x);
  const snappedY = snap(position.y);

  return (
    <>
      {/* メインの赤丸（選択時以外はここをタップして選択） */}
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        style={{ 
          left: `${snappedX}%`, 
          top: `${snappedY}%`, 
          width: `${size}%`, 
          transform: 'translate(-50%, -50%)', 
          zIndex: isSelected ? 100 : 20 
        }}
        className={`absolute aspect-square rounded-full border-[4px] border-red-500 transition-all duration-75 ${isSelected ? 'border-dashed bg-red-500/10' : 'cursor-pointer hover:bg-red-500/20'}`}
      />

      {/* 選択時のみ出現する操作UI */}
      {isSelected && (
        <>
          {/* ★追加：寸法線と同じ、ドラッグ専用の「青い操作ハンドル」を中心に配置 */}
          <div
            ref={containerRef}
            onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e); }}
            onTouchStart={(e) => { e.stopPropagation(); onTouchStart(e); }}
            onClick={(e) => e.stopPropagation()}
            style={{ left: `${snappedX}%`, top: `${snappedY}%`, transform: 'translate(-50%, -50%)', touchAction: 'none' }}
            className={`absolute z-[110] w-14 h-14 bg-blue-500/20 border-4 border-blue-500 rounded-full cursor-move backdrop-blur-sm shadow-xl flex items-center justify-center transition-transform ${dragging ? 'scale-110 bg-blue-500/40' : ''}`}
          >
            {/* ハンドルの中心点（照準器のようなデザイン） */}
            <div className="w-3 h-3 bg-blue-600 rounded-full" />
          </div>

          {/* サイズ変更・削除メニュー（ドラッグ中は邪魔にならないように隠す） */}
          {!dragging && (
            <div 
              onClick={(e) => e.stopPropagation()} 
              style={{ left: `${snappedX}%`, top: `${snappedY + size/2 + 8}%`, transform: 'translateX(-50%)' }} 
              className="absolute z-[1000] flex bg-white rounded-xl shadow-2xl border-2 border-gray-200 overflow-hidden"
            >
              {/* ★追加：サイズ変更もフワフワさせず、5%刻みでカチッ、カチッと変更させる */}
              <button onClick={(e) => {e.stopPropagation(); onSizeChange(Math.min(80, size + 5))}} className="px-5 py-3 text-2xl font-bold hover:bg-gray-100 text-gray-700 border-r active:bg-gray-200">＋</button>
              <button onClick={(e) => {e.stopPropagation(); onSizeChange(Math.max(5, size - 5))}} className="px-5 py-3 text-2xl font-bold hover:bg-gray-100 text-gray-700 border-r active:bg-gray-200">－</button>
              <button onClick={(e) => {e.stopPropagation(); onRemove()}} className="px-5 py-3 text-red-500 hover:bg-red-50 active:bg-red-100"><Trash2 className="w-6 h-6"/></button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function PinSelectModal({ isOpen, onClose, pins, onSelect }: { isOpen: boolean; onClose: () => void; pins: MapPinT[] | undefined; onSelect: (label: string) => void; }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl space-y-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center pb-2 border-b">
          <h3 className="text-xl font-black text-gray-900 flex items-center gap-3"><MapPin className="text-red-500 w-7 h-7"/> 位置図の場所を選択</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"><X className="w-6 h-6"/></button>
        </div>
        {pins && pins.length > 0 ? (
          <div className="grid grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {pins.map((pin) => (
              <button key={pin.id} onClick={() => { onSelect(pin.label); onClose(); }} className="bg-gray-50 text-gray-800 border-2 border-gray-200 font-black py-4 text-center rounded-2xl text-xl shadow-sm hover:border-red-400 hover:bg-red-50 active:scale-95">{pin.label}</button>
            ))}
            <button onClick={() => { onSelect(""); onClose(); }} className="col-span-3 bg-gray-100 text-gray-500 font-bold py-4 rounded-2xl mt-2 hover:bg-gray-200 transition-colors">選択を解除</button>
          </div>
        ) : (
          <div className="text-center py-12 px-4 bg-gray-50 rounded-3xl border-4 border-dashed border-gray-200"><p className="text-gray-400 font-bold text-lg leading-relaxed">先に位置図画面で<br/><span className="text-red-400">マーカー（符号）</span>を<br/>打ってください</p></div>
        )}
      </div>
    </div>
  );
}

const formatToYMD = (dateString: string) => {
  if (!dateString) return '';
  const parts = dateString.split(/[-/]/);
  if (parts.length === 3) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  return dateString.replace(/\//g, '-');
};

const formatToYMDSlash = (dateString: string) => {
  if (!dateString) return '';
  const parts = dateString.split(/[-/]/);
  if (parts.length === 3) return `${parts[0]}/${parts[1].padStart(2, '0')}/${parts[2].padStart(2, '0')}`;
  return dateString.replace(/-/g, '/');
};

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

const getFileExtension = (file: File): string => {
  const byName = file.name.split('.').pop()?.toLowerCase();
  if (byName) return byName;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
};

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

  const [editingMode, setEditingMode] = useState<'circle' | 'dimension'>('circle');
  const [selectedDimensionLineId, setSelectedDimensionLineId] = useState<number | null>(null);
  const [drawingStartPoint, setDrawingStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeColor, setActiveColor] = useState<string>(COLOR_PALETTE[0].value); 

  const [processOptions, setProcessOptions] = useState<string[]>(DEFAULT_PROCESS_OPTIONS);
  const [descTemplates, setDescTemplates] = useState<{label: string, text: string}[]>(DEFAULT_DESC_TEMPLATES);

  useEffect(() => {
    getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data() as Project));
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const s = await getDoc(doc(db, 'users', user.uid));
        if (s.exists()) {
          const data = s.data();
          if (data.customProcesses && data.customProcesses.length > 0) setProcessOptions(data.customProcesses);
          if (data.customDescTemplates && data.customDescTemplates.length > 0) setDescTemplates(data.customDescTemplates);
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
    if (window.confirm('この写真枠を完全に削除しますか？')) {
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
    const todayStr = getTodayStr();

    for (let i = 0; i < files.length; i++) {
      let targetIndex = newPhotos.findIndex(p => !p.image);
      if (targetIndex === -1) {
        newPhotos.push({ id: Date.now() + Math.random(), image: null, photoNumber: String(newPhotos.length + 1), shootingDate: "", locationMap: "", process: "", description: "", circles: [], rotation: 0, dimensionLines: [] });
        targetIndex = newPhotos.length - 1;
      }
      await new Promise<void>((resolve) => {
        compressImage(files[i], async (compressed) => {
          try {
            const ext = getFileExtension(compressed);
            const r = ref(storage, `photos/${id}/${Date.now()}_bulk_${i}.${ext}`);
            await uploadBytes(r, compressed);
            const url = await getDownloadURL(r);
            newPhotos[targetIndex] = { ...newPhotos[targetIndex], image: url, shootingDate: todayStr, circles: [], dimensionLines: [] };
            setProject({ ...project, photos: newPhotos });
            await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
          } catch (error) { console.error("失敗", error); } finally { resolve(); }
        });
      });
      uploadedCount++;
      setBulkProgress(uploadedCount);
    }
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
        const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, image: url, shootingDate: p.shootingDate || getTodayStr(), circles: [], dimensionLines: [] } : p);
        setProject({ ...project, photos: newPhotos });
        await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
      } catch { alert('失敗'); } finally { setLoadingId(null); }
    });
  };

  const handlePhotoClick = async (e: MouseEvent<HTMLDivElement>, photoId: number) => {
    if (!project) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (editingMode === 'circle') {
      if (selectedCircleId !== null) { setSelectedCircleId(null); return; }
      const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: [...(p.circles || []), { id: Date.now(), x, y, size: 20 }] } : p);
      setProject({ ...project, photos: newPhotos });
      await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
    } else if (editingMode === 'dimension') {
      if (selectedDimensionLineId !== null) { setSelectedDimensionLineId(null); return; }
      
      if (!drawingStartPoint) {
        setDrawingStartPoint({ x, y });
      } else {
        const newLineId = Date.now();
        const newPhotos = project.photos.map((p) => p.id === photoId ? {
          ...p,
          dimensionLines: [...(p.dimensionLines || []), { id: newLineId, start: drawingStartPoint, end: { x, y }, text: "", size: 2, color: activeColor }]
        } : p);
        setProject({ ...project, photos: newPhotos });
        await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
        setDrawingStartPoint(null); 
        setSelectedDimensionLineId(newLineId); 
      }
    }
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

  const updateDimensionLine = async (photoId: number, lineId: number, newProps: Partial<DimensionLine>) => {
    if (!project) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, dimensionLines: p.dimensionLines?.map((c) => c.id === lineId ? { ...c, ...newProps } : c) } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
  };
  
  const removeDimensionLine = async (photoId: number, lineId: number) => {
    if (!project) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, dimensionLines: p.dimensionLines?.filter((c) => c.id !== lineId) } : p);
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, "projects", id!), { photos: newPhotos });
    setSelectedDimensionLineId(null);
  };

  if (!project) return <div className="p-10 text-center font-bold text-gray-500">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 font-sans pb-40 select-none overflow-x-hidden" onClick={() => { setSelectedCircleId(null); setSelectedDimensionLineId(null); }}>
      <div className="max-w-2xl mx-auto pb-12">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-3 text-blue-600 mb-8 font-black text-xl px-4 py-2 hover:bg-blue-50 rounded-2xl transition-all active:scale-95"><ArrowLeft strokeWidth={4} /> 戻る</button>
        <h1 className="text-4xl font-black mb-10 text-gray-900 tracking-tighter">工事写真の登録と赤丸・寸法記入</h1>

        <div className="bg-white p-6 rounded-[2.5rem] border-2 border-gray-100 shadow-sm mb-12 flex flex-col gap-6">
          <label className="flex items-center justify-center gap-4 w-full bg-blue-600 text-white font-black py-6 text-2xl rounded-3xl cursor-pointer shadow-[0_15px_40px_rgba(37,99,235,0.4)] hover:bg-blue-700 transition-all active:scale-95">
            <UploadCloud className="w-8 h-8" />
            {bulkUploading ? `アップロード中... (${bulkProgress}枚)` : "複数写真を一括追加する"}
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleBulkUpload} disabled={bulkUploading} />
          </label>

          <div className="grid grid-cols-2 gap-4 border-2 border-gray-100 rounded-3xl p-3 bg-gray-50">
            <button onClick={() => { setEditingMode('circle'); setDrawingStartPoint(null); }} className={`flex items-center gap-3 justify-center py-5 rounded-2xl font-black text-xl transition-all ${editingMode === 'circle' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}>
              <Edit2 className="w-7 h-7" /> 赤丸を追加
            </button>
            <button onClick={() => setEditingMode('dimension')} className={`flex items-center gap-3 justify-center py-5 rounded-2xl font-black text-xl transition-all ${editingMode === 'dimension' ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}>
              <Ruler className="w-7 h-7" /> 寸法記入
            </button>
          </div>
          {editingMode === 'dimension' && (
            <div className="flex items-center gap-3 p-4 bg-gray-100 rounded-2xl border border-gray-200">
               <Paintbrush className="w-6 h-6 text-gray-500"/>
               <span className="font-bold text-gray-600 mr-2">寸法線の色：</span>
              {COLOR_PALETTE.map(color => (
                <button
                  key={color.name}
                  onClick={() => setActiveColor(color.value)}
                  className={`w-10 h-10 rounded-full border-4 transition-all ${activeColor === color.value ? 'border-gray-900 scale-110 shadow-lg' : 'border-white hover:scale-105'}`}
                  style={{ backgroundColor: color.value }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-16 mt-4">
          {project.photos.map((photo, index: number) => {
            const isRotated90 = Number(photo.rotation || 0) % 180 !== 0;
            const containerClassName = `w-full ${photo.image && isRotated90 ? 'min-h-[70vh]' : 'min-h-[22rem]'} mt-12 bg-[#f1f5f9] rounded-[2.5rem] flex items-center justify-center overflow-hidden border-4 border-dashed border-gray-200 relative mb-10 group transition-all hover:border-blue-400`;

            return (
              <div key={photo.id} className="bg-white p-8 rounded-[3rem] border-2 border-gray-100 shadow-2xl relative animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="absolute top-8 right-8 flex gap-4 z-10">
                  <button onClick={() => movePhoto(index, 'up')} className="bg-white/90 backdrop-blur p-4 rounded-2xl shadow-lg border-2 border-gray-100 text-gray-700 hover:bg-white active:scale-90 transition-all"><ArrowUp className="w-7 h-7" /></button>
                  <button onClick={() => movePhoto(index, 'down')} className="bg-white/90 backdrop-blur p-4 rounded-2xl shadow-lg border-2 border-gray-100 text-gray-700 hover:bg-white active:scale-90 transition-all"><ArrowDown className="w-7 h-7" /></button>
                </div>

                <div className={containerClassName}>
                  {loadingId === photo.id ? (
                    <div className="flex flex-col items-center gap-6"><div className="w-14 h-14 border-6 border-blue-500 border-t-transparent rounded-full animate-spin"></div><span className="text-2xl font-black text-blue-600 tracking-widest">保存中...</span></div>
                  ) : photo.image ? (
                    <div className="relative inline-block cursor-crosshair" onClick={(e) => handlePhotoClick(e, photo.id)}>
                      <img src={proxyUrl(photo.image, photo.id)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-[70vh] pointer-events-none rounded-2xl shadow-2xl transition-transform duration-500" style={{ transform: `rotate(${Number(photo.rotation || 0)}deg)` }} alt="" />
                      
                      {(photo.circles || []).map((circle) => (
                        <PhotoCircleMarker key={circle.id} circle={circle} isSelected={selectedCircleId === circle.id} onSelect={() => setSelectedCircleId(circle.id)} onDragEnd={(x, y) => updateCircle(photo.id, circle.id, { x, y })} onSizeChange={(size) => updateCircle(photo.id, circle.id, { size })} onRemove={() => removeCircle(photo.id, circle.id)} />
                      ))}
                      
                      {/* 寸法線の描画 */}
                      {(photo.dimensionLines || []).map((line) => (
                        <DimensionLineMarker 
                          key={line.id} 
                          line={line} 
                          isSelected={selectedDimensionLineId === line.id} 
                          onSelect={() => setSelectedDimensionLineId(line.id)} 
                          onRemove={() => removeDimensionLine(photo.id, line.id)} 
                          onTextChange={(text) => updateDimensionLine(photo.id, line.id, {text})} 
                          onUpdate={(newProps) => updateDimensionLine(photo.id, line.id, newProps)}
                        />
                      ))}

                      {drawingStartPoint && editingMode === 'dimension' && (
                        <div
                          style={{ left: `${drawingStartPoint.x}%`, top: `${drawingStartPoint.y}%`, backgroundColor: activeColor }}
                          className="absolute w-4 h-4 rounded-full border-2 border-white shadow-xl pointer-events-none z-20"
                        />
                      )}

                      <div className="absolute top-6 left-6 bg-black/70 backdrop-blur text-white text-xs px-6 py-3 rounded-full font-black pointer-events-none shadow-2xl border-2 border-white/20 z-10 flex items-center gap-2">
                        {editingMode === 'circle' ? <><Edit2 className="w-4 h-4 text-red-400"/> タップで赤丸を追加</> : !drawingStartPoint ? <><Ruler className="w-4 h-4 text-blue-400"/> 始点をタップ</> : <><Ruler className="w-4 h-4 text-yellow-400"/> 終点をタップ</>}
                      </div>
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
                    <input type="date" className="w-full bg-transparent text-2xl font-bold outline-none focus:text-blue-600 transition-colors" value={formatToYMD(photo.shootingDate)} onChange={(e) => updatePhoto(photo.id, "shootingDate", formatToYMDSlash(e.target.value))} />
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
            );
          })}
        </div>

        <button onClick={addPhotoSlot} className="w-full mt-24 bg-gray-900 text-white font-black py-8 text-3xl rounded-[3rem] shadow-[0_20px_60px_rgba(0,0,0,0.3)] flex items-center justify-center gap-6 hover:bg-black transition-all active:scale-95 mb-20"><Plus className="w-10 h-10" strokeWidth={4} /> 写真枠を追加する</button>

      </div>
      <PinSelectModal isOpen={modalOpen} onClose={() => setModalOpen(false)} pins={project?.mapPins} onSelect={(label) => currentPhotoId && updatePhoto(currentPhotoId, "locationMap", label)} />
    </div>
  );
}