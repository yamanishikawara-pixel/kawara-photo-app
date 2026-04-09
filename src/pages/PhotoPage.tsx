import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, Trash2, ArrowLeft, ArrowUp, ArrowDown, UploadCloud, MapPin, X, Plus, Edit2, Ruler, Paintbrush, CaseUpper, Copy, CheckSquare, Calendar, ChevronDown, BookmarkPlus } from 'lucide-react';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import imageCompression from 'browser-image-compression';
import { proxyUrl, useDraggablePin } from '../shared/utils';
import type { Circle, MapPin as MapPinT, Photo, Project, DimensionLine, PhotoMaster } from '../types';
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

const DEFAULT_ROOF_PART_NAMES = ['棟', '袖', 'ケラバ', '谷', '隅棟', '平', '軒先'];

const compressPhotoWithQuality = async (file: File) => {
  const options = {
    maxSizeMB: 1,          
    maxWidthOrHeight: 1920, 
    useWebWorker: true,     
    fileType: 'image/jpeg', 
    initialQuality: 0.8,    
  };
  try {
    return await imageCompression(file, options);
  } catch (error) {
    console.warn("画像の圧縮に失敗しました。元のファイルで続行します。", error);
    return file; 
  }
};

const DimensionLineMarker = React.memo(function DimensionLineMarker({ line, isSelected, onSelect, onRemove, onTextChange, onUpdate, onDeselect }: { line: DimensionLine; isSelected: boolean; onSelect: () => void; onRemove: () => void; onTextChange: (text: string) => void; onUpdate: (props: Partial<DimensionLine>) => void; onDeselect: () => void; }) {
  const inputRef = useRef<HTMLInputElement>(null);
  
  const [localStart, setLocalStart] = useState(line.start);
  const [localEnd, setLocalEnd] = useState(line.end);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);

  useEffect(() => {
    if (!isDragging) {
      setLocalStart(line.start);
      setLocalEnd(line.end);
    }
  }, [line.start, line.end, isDragging]);

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

  const addPartName = (name: string) => {
    if (inputRef.current) {
      const currentText = inputRef.current.value;
      const newText = currentText.startsWith(name) ? currentText : `${name} ${currentText}`;
      onTextChange(newText);
      inputRef.current.focus();
    }
  };

  const midPoint = { x: (localStart.x + localEnd.x) / 2, y: (localStart.y + localEnd.y) / 2 };
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
      
      {isSelected && !isDragging && (
        <div style={{ left: `${safePopupX}%`, top: `${safePopupY}%` }} className="absolute z-30 translate-x-[-50%] translate-y-[-50%] flex flex-col items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl shadow-3xl border-2 border-gray-100 min-w-[280px] w-[90%] max-w-[320px] sm:w-auto" onClick={e => e.stopPropagation()}>
          <div className="flex w-full gap-3 items-center justify-between border-b-2 border-gray-100 pb-3">
             <h4 className="text-lg sm:text-xl font-black text-gray-900 flex items-center gap-2"><CaseUpper className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500"/> 部位と寸法を入力</h4>
             <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-2 sm:p-3 text-red-500 bg-red-50 rounded-xl hover:bg-red-100"><Trash2 className="w-5 h-5 sm:w-6 sm:h-6" /></button>
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-2.5 w-full">
            {DEFAULT_ROOF_PART_NAMES.map(name => (
              <button 
                key={name}
                onClick={() => addPartName(name)}
                className="text-sm sm:text-base font-black text-blue-700 bg-blue-50 border-2 border-blue-100 px-3 py-2 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl hover:bg-blue-100 active:scale-95 shadow-sm transition-all"
              >
                ＋{name}
              </button>
            ))}
          </div>

          <div className="flex w-full gap-2">
            <input
              ref={inputRef}
              type="text"
              value={line.text}
              onChange={(e) => onTextChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onDeselect(); } }}
              className="flex-1 bg-gray-50 border-2 border-gray-100 p-3 sm:p-4 text-lg sm:text-xl font-bold rounded-xl outline-none focus:border-blue-400 focus:bg-white text-center shadow-inner"
              placeholder="部位 〇〇m"
            />
            <button type="button" onClick={(e) => { e.stopPropagation(); onDeselect(); }} className="px-4 py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black rounded-xl shadow transition-all whitespace-nowrap">✓ 完了</button>
          </div>
        </div>
      )}

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
      
      {!isSelected && line.text && (
        <div
          style={{ 
            left: `${midPoint.x}%`, 
            top: `${midPoint.y}%`, 
            color: color, 
            backgroundColor: 'rgba(0, 0, 0, 0.4)', 
            backdropFilter: 'blur(2px)'
          }}
          className="absolute z-20 translate-x-[-50%] translate-y-[-50%] font-bold text-sm sm:text-xl px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded pointer-events-none whitespace-nowrap border border-white/10 shadow-sm"
        >
          {line.text}
        </div>
      )}
    </>
  );
});

function PhotoCircleMarker({ circle, isSelected, onSelect, onDragEnd, onSizeChange, onRemove }: { circle: Circle; isSelected: boolean; onSelect: () => void; onDragEnd: (x: number, y: number) => void; onSizeChange: (size: number) => void; onRemove: () => void; }) {
  const handleDragEnd = (x: number, y: number) => { onDragEnd(x, y); };
  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(circle.x, circle.y, handleDragEnd);
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
          zIndex: isSelected ? 100 : (dragging ? 30 : 20) 
        }}
        className={`absolute aspect-square rounded-full border-[4px] border-red-500 shadow-sm transition-all duration-75 ${dragging ? 'z-30 opacity-80' : 'cursor-pointer hover:bg-red-500/10'} ${isSelected && !dragging ? 'border-dashed bg-red-500/10' : ''}`}
      />
      
      {isSelected && !dragging && (
        <div onClick={(e) => e.stopPropagation()} style={{ left: `${position.x}%`, top: `${position.y + size/2 + 8}%`, transform: 'translateX(-50%)' }} className="absolute z-[1000] flex bg-white rounded-xl shadow-2xl border-2 border-gray-200 overflow-hidden">
          <button onClick={(e) => {e.stopPropagation(); onSizeChange(Math.min(80, Math.round(size + 5)))}} className="px-4 py-2 sm:px-5 sm:py-3 text-xl sm:text-2xl font-bold hover:bg-gray-100 text-gray-700 border-r active:bg-gray-200">＋</button>
          <button onClick={(e) => {e.stopPropagation(); onSizeChange(Math.max(5, Math.round(size - 5)))}} className="px-4 py-2 sm:px-5 sm:py-3 text-xl sm:text-2xl font-bold hover:bg-gray-100 text-gray-700 border-r active:bg-gray-200">－</button>
          <button onClick={(e) => {e.stopPropagation(); onRemove()}} className="px-4 py-2 sm:px-5 sm:py-3 text-red-500 hover:bg-red-50 active:bg-red-100"><Trash2 className="w-5 h-5 sm:w-6 sm:h-6"/></button>
        </div>
      )}
    </>
  );
}

function PinSelectModal({ isOpen, onClose, pins, onSelect }: { isOpen: boolean; onClose: () => void; pins: MapPinT[] | undefined; onSelect: (label: string) => void; }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-[2rem] w-full max-w-sm p-6 sm:p-8 shadow-2xl space-y-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center pb-2 border-b">
          <h3 className="text-lg sm:text-xl font-black text-gray-900 flex items-center gap-2 sm:gap-3"><MapPin className="text-red-500 w-6 h-6 sm:w-7 sm:h-7"/> 位置図の場所を選択</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 sm:w-6 sm:h-6"/></button>
        </div>
        {pins && pins.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 sm:gap-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {pins.map((pin) => (
              <button key={pin.id} onClick={() => { onSelect(pin.label); onClose(); }} className="bg-gray-50 text-gray-800 border-2 border-gray-200 font-black py-3 sm:py-4 text-center rounded-xl sm:rounded-2xl text-lg sm:text-xl shadow-sm hover:border-red-400 hover:bg-red-50 active:scale-95">{pin.label}</button>
            ))}
            <button onClick={() => { onSelect(""); onClose(); }} className="col-span-3 bg-gray-100 text-gray-500 font-bold py-3 sm:py-4 rounded-xl sm:rounded-2xl mt-2 hover:bg-gray-200 transition-colors">選択を解除</button>
          </div>
        ) : (
          <div className="text-center py-12 px-4 bg-gray-50 rounded-3xl border-4 border-dashed border-gray-200"><p className="text-gray-400 font-bold text-base sm:text-lg leading-relaxed">先に位置図画面で<br/><span className="text-red-400">マーカー（符号）</span>を<br/>打ってください</p></div>
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

// 写真テンプレートのコンボボックス
function PhotoMasterCombobox({
  masters,
  onApply,
}: {
  masters: PhotoMaster[];
  onApply: (m: PhotoMaster) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? masters.filter((m) => m.name.includes(query.trim()) || m.process.includes(query.trim()))
    : masters;

  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (m: PhotoMaster) => {
    setOpen(false);
    const detail = [m.process, m.description ? m.description.slice(0, 30) + (m.description.length > 30 ? '…' : '') : ''].filter(Boolean).join('　/　');
    if (window.confirm(`「${m.name}」を自動入力しますか？${detail ? '\n' + detail : ''}`)) {
      onApply(m);
    }
  };

  if (masters.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setQuery(''); setOpen((o) => !o); }}
        className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
      >
        テンプレート <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-64 bg-white border border-blue-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              placeholder="絞り込み..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-400 text-center">該当なし</li>
            ) : (
              filtered.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-none"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(m); }}
                  >
                    <div className="font-bold text-gray-800 text-sm">{m.name}</div>
                    {m.process && <div className="text-xs text-gray-500 mt-0.5">{m.process}</div>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
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

  const [editingMode, setEditingMode] = useState<'circle' | 'dimension'>('circle');
  const [selectedDimensionLineId, setSelectedDimensionLineId] = useState<number | null>(null);
  const [drawingStartPoint, setDrawingStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeColor, setActiveColor] = useState<string>(COLOR_PALETTE[0].value); 

  const [processOptions, setProcessOptions] = useState<string[]>(DEFAULT_PROCESS_OPTIONS);
  const [descTemplates, setDescTemplates] = useState<{label: string, text: string}[]>(DEFAULT_DESC_TEMPLATES);
  const [photoMasters, setPhotoMasters] = useState<PhotoMaster[]>([]);
  const [uid, setUid] = useState<string | null>(null);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<number[]>([]);
  const [batchDate, setBatchDate] = useState("");

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "projects", id)).then(d => d.exists() && setProject(d.data() as Project));
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid);
        const s = await getDoc(doc(db, 'users', user.uid));
        if (s.exists()) {
          const data = s.data();
          if (data.customProcesses && data.customProcesses.length > 0) setProcessOptions(data.customProcesses);
          if (data.customDescTemplates && data.customDescTemplates.length > 0) setDescTemplates(data.customDescTemplates);
          if (Array.isArray(data.photoMaster)) setPhotoMasters(data.photoMaster);
        }
      }
    });
    return () => unsub();
  }, [id]);

  const applyPhotoMaster = async (photoId: number, m: PhotoMaster) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) =>
      p.id === photoId ? { ...p, process: m.process, description: m.description } : p
    );
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await updateDoc(doc(db, 'projects', id), { photos: newPhotos });
  };

  const saveToPhotoMaster = async (photo: Photo) => {
    if (!uid) { alert('マスタに保存するにはログインが必要です。'); return; }
    const name = prompt('テンプレート名を入力してください:', photo.process || '');
    if (!name?.trim()) return;
    const existing = photoMasters.find((m) => m.name === name.trim());
    if (existing && !window.confirm(`「${name.trim()}」はすでに存在します。上書きしますか？`)) return;
    const entry: PhotoMaster = { id: existing?.id ?? Date.now(), name: name.trim(), process: photo.process, description: photo.description };
    const newMasters = existing ? photoMasters.map((m) => m.id === existing.id ? entry : m) : [...photoMasters, entry];
    setPhotoMasters(newMasters);
    await setDoc(doc(db, 'users', uid), { photoMaster: newMasters }, { merge: true });
    alert(`「${entry.name}」をマスタに保存しました。`);
  };

  const updatePhoto = async (photoId: number, field: keyof Photo, value: Photo[keyof Photo]) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, [field]: value } : p);
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await updateDoc(doc(db, "projects", id), { photos: newPhotos });
  };

  const deletePhotoSlot = async (photoId: number) => {
    if (!project || !id) return;
    if (window.confirm('この写真枠を完全に削除しますか？')) {
      const newPhotos = project.photos.filter((p) => p.id !== photoId);
      const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
      setProject((prev) => prev ? { ...prev, photos: renumbered } : null);
      await updateDoc(doc(db, "projects", id), { photos: renumbered });
    }
  };

  const toggleSelectPhoto = (photoId: number) => {
    setSelectedPhotoIds(prev => prev.includes(photoId) ? prev.filter(pId => pId !== photoId) : [...prev, photoId]);
  };

  const deleteSelectedPhotos = async () => {
    if (!project || !id || selectedPhotoIds.length === 0) return;
    if (window.confirm(`選択した ${selectedPhotoIds.length} 件の写真枠を完全に削除しますか？`)) {
      const newPhotos = project.photos.filter((p) => !selectedPhotoIds.includes(p.id));
      const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
      setProject((prev) => prev ? { ...prev, photos: renumbered } : null);
      await updateDoc(doc(db, "projects", id), { photos: renumbered });
      setSelectedPhotoIds([]);
      setIsSelectMode(false);
    }
  };

  const applyBatchDate = async () => {
    if (!project || !id || !batchDate) return;
    if (window.confirm(`すべての写真の撮影日を ${batchDate.replace(/-/g, '/')} に統一しますか？`)) {
      const formatted = formatToYMDSlash(batchDate);
      const newPhotos = project.photos.map(p => ({ ...p, shootingDate: formatted }));
      setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
      await updateDoc(doc(db, "projects", id), { photos: newPhotos });
      setBatchDate("");
      alert('撮影日を一括設定しました！');
    }
  };

  const addPhotoSlot = async () => {
    if (!project || !id) return;
    const newPhotos: Photo[] = [...project.photos, { id: Date.now(), image: null, photoNumber: String(project.photos.length + 1), shootingDate: "", locationMap: "", process: "", description: "", circles: [], dimensionLines: [], rotation: 0 }];
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await updateDoc(doc(db, "projects", id), { photos: newPhotos });
  };

  const duplicatePhotoSlot = async (index: number) => {
    if (!project || !id) return;
    const source = project.photos[index];
    const newPhoto: Photo = {
      id: Date.now(),
      image: null, 
      photoNumber: '', 
      shootingDate: source.shootingDate,
      locationMap: source.locationMap,
      process: source.process,
      description: source.description,
      circles: [],
      dimensionLines: [],
      rotation: 0
    };
    const newPhotos = [...project.photos];
    newPhotos.splice(index + 1, 0, newPhoto);
    const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
    setProject((prev) => prev ? { ...prev, photos: renumbered } : null);
    await updateDoc(doc(db, "projects", id), { photos: renumbered });
  };

  const movePhoto = async (index: number, direction: 'up' | 'down') => {
    if (!project || !id) return;
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === project.photos.length - 1)) return;
    const newPhotos = [...project.photos];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    [newPhotos[index], newPhotos[targetIdx]] = [newPhotos[targetIdx], newPhotos[index]];
    const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
    setProject((prev) => prev ? { ...prev, photos: renumbered } : null);
    await updateDoc(doc(db, "projects", id), { photos: renumbered });
  };

  const handleBulkUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!project || !id) return;
    const files = Array.from(e.target.files as FileList);
    if (files.length === 0) return;
    setBulkUploading(true);
    let newPhotos = [...project.photos];
    let uploadedCount = 0;
    const todayStr = getTodayStr();

    for (let i = 0; i < files.length; i++) {
      let targetIndex = newPhotos.findIndex(p => !p.image);
      if (targetIndex === -1) {
        newPhotos.push({ id: Date.now() + i, image: null, photoNumber: String(newPhotos.length + 1), shootingDate: "", locationMap: "", process: "", description: "", circles: [], dimensionLines: [], rotation: 0 });
        targetIndex = newPhotos.length - 1;
      }
      
      try {
        const compressedFile = await compressPhotoWithQuality(files[i]);
        const r = ref(storage, `photos/${id}/${Date.now()}_bulk_${i}.jpg`);
        await uploadBytes(r, compressedFile);
        const url = await getDownloadURL(r);
        
        newPhotos[targetIndex] = { ...newPhotos[targetIndex], image: url, shootingDate: todayStr, circles: [], dimensionLines: [] };
        setProject((prev) => prev ? { ...prev, photos: [...newPhotos] } : null);
        await updateDoc(doc(db, "projects", id), { photos: newPhotos });
      } catch (error) {
        console.error("アップロード失敗", error);
        alert(`${i + 1}枚目のアップロードに失敗しました。`);
      }
      
      uploadedCount++;
      setBulkProgress(uploadedCount);
    }
    setBulkUploading(false);
  };

  const uploadPhoto = async (e: ChangeEvent<HTMLInputElement>, index: number) => {
    if (!project || !id) return;
    const f = e.target.files?.[0];
    if (!f) return;
    const photoId = project.photos[index].id;
    setLoadingId(photoId);
    
    try {
      const compressedFile = await compressPhotoWithQuality(f);
      const r = ref(storage, `photos/${id}/${Date.now()}.jpg`); 
      await uploadBytes(r, compressedFile);
      const url = await getDownloadURL(r);
      
      const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, image: url, shootingDate: p.shootingDate || getTodayStr(), circles: [], dimensionLines: [] } : p);
      setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
      await updateDoc(doc(db, "projects", id), { photos: newPhotos });
    } catch { 
      alert('アップロードに失敗しました。電波の良いところでお試しください。'); 
    } finally { 
      setLoadingId(null); 
    }
  };

  const handlePhotoClick = async (e: MouseEvent<HTMLDivElement>, photoId: number) => {
    if (!project || !id) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (editingMode === 'circle') {
      if (selectedCircleId !== null) { setSelectedCircleId(null); return; }
      const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: [...(p.circles || []), { id: Date.now(), x, y, size: 20 }] } : p);
      setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
      await updateDoc(doc(db, "projects", id), { photos: newPhotos });
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
        setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
        await updateDoc(doc(db, "projects", id), { photos: newPhotos });
        setDrawingStartPoint(null); 
        setSelectedDimensionLineId(newLineId); 
      }
    }
  };

  const updateCircle = async (photoId: number, circleId: number, newProps: Partial<Circle>) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: p.circles.map((c) => c.id === circleId ? { ...c, ...newProps } : c) } : p);
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await updateDoc(doc(db, "projects", id), { photos: newPhotos });
  };

  const removeCircle = async (photoId: number, circleId: number) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: p.circles.filter((c) => c.id !== circleId) } : p);
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await updateDoc(doc(db, "projects", id), { photos: newPhotos });
    setSelectedCircleId(null);
  };

  const updateDimensionLine = async (photoId: number, lineId: number, newProps: Partial<DimensionLine>) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, dimensionLines: p.dimensionLines?.map((c) => c.id === lineId ? { ...c, ...newProps } : c) } : p);
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await updateDoc(doc(db, "projects", id), { photos: newPhotos });
  };

  const removeDimensionLine = async (photoId: number, lineId: number) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, dimensionLines: p.dimensionLines?.filter((c) => c.id !== lineId) } : p);
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await updateDoc(doc(db, "projects", id), { photos: newPhotos });
    setSelectedDimensionLineId(null);
  };

  if (!project) return <div className="p-10 text-center font-bold text-gray-500">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 sm:p-6 font-sans pb-40 select-none overflow-x-hidden" onClick={() => { setSelectedCircleId(null); setSelectedDimensionLineId(null); }}>
      
      {/* ★ 全体の幅を max-w-7xl に拡張（iPad/Macで広々使えるように） */}
      <div className="max-w-7xl mx-auto pb-12">
        
        {/* 上部コントロールエリア（ここは広がりすぎないように max-w-3xl に制限） */}
        <div className="max-w-3xl mx-auto">
          <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-3 text-blue-600 mb-6 sm:mb-8 font-black text-lg sm:text-xl px-2 sm:px-4 py-2 hover:bg-blue-50 rounded-2xl transition-all active:scale-95"><ArrowLeft strokeWidth={4} /> 戻る</button>
          <h1 className="text-2xl sm:text-4xl font-black mb-8 sm:mb-10 text-gray-900 tracking-tighter">工事写真の登録と赤丸・寸法記入</h1>

          <div className="bg-white p-4 sm:p-6 rounded-[2rem] sm:rounded-[2.5rem] border-2 border-gray-100 shadow-sm mb-6 flex flex-col gap-4 sm:gap-6">
            <label className="flex items-center justify-center gap-3 sm:gap-4 w-full bg-blue-600 text-white font-black py-4 sm:py-6 text-lg sm:text-2xl rounded-2xl sm:rounded-3xl cursor-pointer shadow-[0_15px_40px_rgba(37,99,235,0.4)] hover:bg-blue-700 transition-all active:scale-95">
              <UploadCloud className="w-6 h-6 sm:w-8 sm:h-8" />
              {bulkUploading ? `アップロード中... (${bulkProgress}枚)` : "複数写真を一括追加する"}
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleBulkUpload} disabled={bulkUploading} />
            </label>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 border-2 border-gray-100 rounded-2xl sm:rounded-3xl p-2 sm:p-3 bg-gray-50">
              <button onClick={() => { setEditingMode('circle'); setDrawingStartPoint(null); }} className={`flex items-center gap-2 sm:gap-3 justify-center py-3 sm:py-5 rounded-xl sm:rounded-2xl font-black text-sm sm:text-xl transition-all ${editingMode === 'circle' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}>
                <Edit2 className="w-5 h-5 sm:w-7 sm:h-7" /> 赤丸を追加
              </button>
              <button onClick={() => setEditingMode('dimension')} className={`flex items-center gap-2 sm:gap-3 justify-center py-3 sm:py-5 rounded-xl sm:rounded-2xl font-black text-sm sm:text-xl transition-all ${editingMode === 'dimension' ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}>
                <Ruler className="w-5 h-5 sm:w-7 sm:h-7" /> 寸法記入
              </button>
            </div>
            {editingMode === 'dimension' && (
              <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-100 rounded-xl sm:rounded-2xl border border-gray-200">
                 <Paintbrush className="w-5 h-5 sm:w-6 sm:h-6 text-gray-500"/>
                 <span className="font-bold text-sm sm:text-base text-gray-600 mr-1 sm:mr-2">寸法線の色：</span>
                {COLOR_PALETTE.map(color => (
                  <button
                    key={color.name}
                    onClick={() => setActiveColor(color.value)}
                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border-4 transition-all ${activeColor === color.value ? 'border-gray-900 scale-110 shadow-lg' : 'border-white hover:scale-105'}`}
                    style={{ backgroundColor: color.value }}
                  />
                ))}
                <label className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border-4 transition-all cursor-pointer overflow-hidden flex items-center justify-center hover:scale-105 ${!COLOR_PALETTE.some(c => c.value === activeColor) ? 'border-gray-900 scale-110 shadow-lg' : 'border-white'}`} style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} title="自由色">
                  <input type="color" value={activeColor} onChange={(e) => setActiveColor(e.target.value)} className="opacity-0 absolute w-px h-px" />
                </label>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 bg-white p-4 sm:p-5 rounded-[1.5rem] sm:rounded-[2rem] border-2 border-gray-100 shadow-sm mb-12">
            <div className="flex items-center gap-2 sm:gap-3 flex-1">
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500 shrink-0"/>
              <input 
                type="date" 
                value={batchDate} 
                onChange={e => setBatchDate(e.target.value)} 
                className="p-2 sm:p-3 border-2 border-gray-200 rounded-lg sm:rounded-xl font-bold text-sm sm:text-base text-gray-700 flex-1 outline-none focus:border-blue-400" 
              />
              <button onClick={applyBatchDate} disabled={!batchDate} className="bg-blue-100 text-blue-700 font-bold px-3 py-2 sm:px-5 sm:py-3 rounded-lg sm:rounded-xl text-sm sm:text-base disabled:opacity-50 hover:bg-blue-200 active:scale-95 shrink-0">全写真に適用</button>
            </div>
            
            <div className="flex items-center justify-end sm:border-l-2 sm:border-gray-100 sm:pl-4 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t-2 border-gray-100 sm:border-t-0">
               {isSelectMode ? (
                 <div className="flex items-center gap-2">
                   <button onClick={() => {setIsSelectMode(false); setSelectedPhotoIds([]);}} className="bg-gray-100 text-gray-700 font-bold px-3 py-2 sm:px-4 sm:py-3 rounded-lg sm:rounded-xl text-sm sm:text-base hover:bg-gray-200">取消</button>
                   <button onClick={deleteSelectedPhotos} disabled={selectedPhotoIds.length === 0} className="bg-red-500 text-white font-bold px-3 py-2 sm:px-5 sm:py-3 rounded-lg sm:rounded-xl text-sm sm:text-base disabled:opacity-50 shadow-md flex items-center gap-1 sm:gap-2 active:scale-95">
                     <Trash2 className="w-4 h-4 sm:w-5 sm:h-5"/> {selectedPhotoIds.length}件削除
                   </button>
                 </div>
               ) : (
                 <button onClick={() => setIsSelectMode(true)} className="bg-gray-50 text-gray-700 font-bold px-3 py-2 sm:px-5 sm:py-3 rounded-lg sm:rounded-xl text-sm sm:text-base border-2 border-gray-200 flex items-center gap-1 sm:gap-2 hover:bg-gray-100 transition-colors">
                   <CheckSquare className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500"/> 複数選択して削除
                 </button>
               )}
            </div>
          </div>
        </div>

        {/* 写真カードのリスト（ここから下が2カラムレイアウトに対応） */}
        <div className="space-y-12 sm:space-y-16 mt-4">
          {project.photos.map((photo, index: number) => {
            const isRotated90 = Number(photo.rotation || 0) % 180 !== 0;
            // 縦写真の時はコンテナを少し高くする
            const containerClassName = `w-full ${photo.image && isRotated90 ? 'min-h-[50vh] sm:min-h-[60vh]' : 'min-h-[16rem] sm:min-h-[22rem]'} bg-[#f1f5f9] rounded-[1.5rem] sm:rounded-[2.5rem] flex items-center justify-center overflow-hidden border-4 border-dashed border-gray-200 relative group transition-all hover:border-blue-400`;

            return (
              <div key={photo.id} className="bg-white p-4 sm:p-8 rounded-[2rem] sm:rounded-[3rem] border-2 border-gray-100 shadow-xl relative animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* 一括削除モード時のチェックボックス */}
                {isSelectMode && (
                  <div 
                    onClick={() => toggleSelectPhoto(photo.id)} 
                    className={`absolute inset-0 z-50 rounded-[2rem] sm:rounded-[3rem] border-4 sm:border-8 cursor-pointer transition-all flex items-center justify-center bg-black/5 ${selectedPhotoIds.includes(photo.id) ? 'border-red-500 bg-red-500/10' : 'border-transparent hover:bg-black/10'}`}
                  >
                    <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full border-4 flex items-center justify-center ${selectedPhotoIds.includes(photo.id) ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-gray-300'}`}>
                      <CheckSquare className="w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                  </div>
                )}

                {/* 順番入れ替えボタン（右上に配置） */}
                <div className="absolute top-4 right-4 sm:top-8 sm:right-8 flex gap-2 sm:gap-4 z-10">
                  <button onClick={() => movePhoto(index, 'up')} className="bg-white/90 backdrop-blur p-2 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg border border-gray-100 text-gray-700 hover:bg-gray-50 active:scale-90 transition-all"><ArrowUp className="w-5 h-5 sm:w-7 sm:h-7" /></button>
                  <button onClick={() => movePhoto(index, 'down')} className="bg-white/90 backdrop-blur p-2 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg border border-gray-100 text-gray-700 hover:bg-gray-50 active:scale-90 transition-all"><ArrowDown className="w-5 h-5 sm:w-7 sm:h-7" /></button>
                </div>

                {/* ★ 魔法の2カラムレイアウト：スマホは flex-col(縦)、PCは lg:flex-row(横) */}
                <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 pt-12 sm:pt-4">
                  
                  {/* 左カラム：写真と操作ボタン */}
                  <div className="w-full lg:w-[55%] flex flex-col gap-4 sm:gap-6">
                    <div className="flex justify-between items-center pb-4 border-b-2 sm:border-b-4 border-gray-50 flex-wrap gap-4">
                      <div className="font-black text-gray-900 text-xl sm:text-3xl flex items-center gap-2 sm:gap-4">
                        <span className="bg-gray-900 text-white w-8 h-8 sm:w-12 sm:h-12 flex items-center justify-center rounded-lg sm:rounded-2xl text-sm sm:text-xl">{index + 1}</span> 写真
                      </div>
                      
                      {/* 写真に対するアクションボタン群 */}
                      <div className="flex gap-2 sm:gap-3 flex-wrap">
                        <button type="button" onClick={() => duplicatePhotoSlot(index)} className="p-2 sm:p-3 text-blue-600 bg-blue-50 rounded-xl sm:rounded-[1.5rem] border-2 border-blue-100 font-bold hover:bg-blue-100 active:scale-95 flex items-center gap-1 sm:gap-2 transition-colors text-xs sm:text-base"><Copy className="w-4 h-4 sm:w-6 sm:h-6"/> 複製</button>
                        <button type="button" onClick={() => updatePhoto(photo.id, 'rotation', ((Number(photo.rotation || 0)) + 90) % 360)} className="p-2 sm:p-3 text-gray-700 bg-gray-100 rounded-xl sm:rounded-[1.5rem] border-2 border-gray-200 font-bold hover:bg-gray-200 active:scale-95 flex items-center gap-1 sm:gap-2 text-xs sm:text-base">↻ 回転</button>
                        <button onClick={() => deletePhotoSlot(photo.id)} className="p-2 sm:p-3 text-red-500 bg-red-50 rounded-xl sm:rounded-[1.5rem] border-2 border-red-100 hover:bg-red-100 active:scale-95"><Trash2 className="w-4 h-4 sm:w-6 sm:h-6"/></button>
                        <label className="bg-blue-100 text-blue-800 font-black py-2 px-4 sm:py-3 sm:px-6 rounded-xl sm:rounded-[1.5rem] cursor-pointer shadow-sm border-2 border-blue-200 hover:bg-blue-200 active:scale-95 text-xs sm:text-base flex items-center">
                          {photo.image ? '変更' : '選択'} <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e, index)} />
                        </label>
                      </div>
                    </div>

                    <div className={containerClassName}>
                      {loadingId === photo.id ? (
                        <div className="flex flex-col items-center gap-4 sm:gap-6"><div className="w-10 h-10 sm:w-14 sm:h-14 border-4 sm:border-6 border-blue-500 border-t-transparent rounded-full animate-spin"></div><span className="text-lg sm:text-2xl font-black text-blue-600 tracking-widest">保存中...</span></div>
                      ) : photo.image ? (
                        <div className="relative cursor-crosshair" style={{ display: 'inline-block', lineHeight: 0 }} onClick={(e) => handlePhotoClick(e, photo.id)}>
                          {/* スマホとPCで写真の最大高さを調整 */}
                          <img src={proxyUrl(photo.image, photo.id)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-[50vh] sm:max-h-[60vh] lg:max-h-[70vh] pointer-events-none rounded-xl sm:rounded-2xl shadow-xl sm:shadow-2xl transition-transform duration-500 object-contain" style={{ transform: `rotate(${Number(photo.rotation || 0)}deg)` }} alt="" />
                          
                          {(photo.circles || []).map((circle) => (
                            <PhotoCircleMarker key={circle.id} circle={circle} isSelected={selectedCircleId === circle.id} onSelect={() => setSelectedCircleId(circle.id)} onDragEnd={(x, y) => updateCircle(photo.id, circle.id, { x, y })} onSizeChange={(size) => updateCircle(photo.id, circle.id, { size })} onRemove={() => removeCircle(photo.id, circle.id)} />
                          ))}
                          
                          {(photo.dimensionLines || []).map((line) => (
                            <DimensionLineMarker 
                              key={line.id} 
                              line={line} 
                              isSelected={selectedDimensionLineId === line.id} 
                              onSelect={() => setSelectedDimensionLineId(line.id)} 
                              onRemove={() => removeDimensionLine(photo.id, line.id)}
                              onTextChange={(text) => updateDimensionLine(photo.id, line.id, {text})}
                              onUpdate={(newProps) => updateDimensionLine(photo.id, line.id, newProps)}
                              onDeselect={() => setSelectedDimensionLineId(null)}
                            />
                          ))}

                          {drawingStartPoint && editingMode === 'dimension' && (
                            <div
                              style={{ left: `${drawingStartPoint.x}%`, top: `${drawingStartPoint.y}%`, backgroundColor: activeColor }}
                              className="absolute w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 border-white shadow-xl pointer-events-none z-20"
                            />
                          )}

                          <div className="absolute top-4 left-4 sm:top-6 sm:left-6 bg-black/70 backdrop-blur text-white text-[10px] sm:text-xs px-3 py-2 sm:px-6 sm:py-3 rounded-full font-black pointer-events-none shadow-2xl border border-white/20 z-10 flex items-center gap-1 sm:gap-2">
                            {editingMode === 'circle' ? <><Edit2 className="w-3 h-3 sm:w-4 sm:h-4 text-red-400"/> タップで赤丸を追加</> : !drawingStartPoint ? <><Ruler className="w-3 h-3 sm:w-4 sm:h-4 text-blue-400"/> 始点をタップ</> : <><Ruler className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400"/> 終点をタップ</>}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-gray-300 py-10 sm:py-16"><Camera className="w-16 h-16 sm:w-24 sm:h-24 mx-auto mb-4 sm:mb-6 opacity-20" /><span className="text-lg sm:text-2xl font-black block">画像を選択してください</span></div>
                      )}
                    </div>
                  </div>

                  {/* 右カラム：入力フォーム群 */}
                  <div className="w-full lg:w-[45%] flex flex-col gap-4 sm:gap-8 justify-center lg:pl-4">
                    
                    {/* 日付 */}
                    <div className="flex items-center gap-3 sm:gap-6 bg-gray-50 p-4 sm:p-6 rounded-xl sm:rounded-[2rem] border-2 border-gray-100">
                      <div className="font-black text-gray-500 whitespace-nowrap text-sm sm:text-xl">撮影日:</div>
                      <input type="date" className="w-full bg-transparent text-lg sm:text-2xl font-bold outline-none focus:text-blue-600 transition-colors" value={formatToYMD(photo.shootingDate)} onChange={(e) => updatePhoto(photo.id, "shootingDate", formatToYMDSlash(e.target.value))} />
                    </div>

                    {/* 場所選択（マップピン） */}
                    <button onClick={() => { setCurrentPhotoId(photo.id); setModalOpen(true); }} className={`w-full p-4 sm:p-8 text-base sm:text-2xl border-2 sm:border-4 rounded-xl sm:rounded-[2rem] text-left flex justify-between items-center transition-all ${photo.locationMap ? 'text-red-700 font-black border-red-200 bg-red-50 shadow-md sm:shadow-lg shadow-red-100' : 'text-gray-400 font-bold border-gray-200 bg-white hover:border-gray-400'}`}>
                      <span className="truncate">{photo.locationMap || '▼ 場所を選択（符号と連動）'}</span> <MapPin className={`w-6 h-6 sm:w-10 sm:h-10 shrink-0 ${photo.locationMap ? 'text-red-500' : 'text-gray-300'}`} />
                    </button>

                    {/* 工程プルダウン */}
                    <div className="space-y-1 sm:space-y-3">
                      <div className="flex items-center justify-between pl-2 sm:pl-4">
                        <label className="text-[10px] sm:text-sm font-black text-gray-400 uppercase tracking-[0.1em] sm:tracking-[0.2em]">工程 / PROCESS</label>
                        <div className="flex items-center gap-2">
                          <PhotoMasterCombobox masters={photoMasters} onApply={(m) => applyPhotoMaster(photo.id, m)} />
                          <button type="button" onClick={() => saveToPhotoMaster(photo)} className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1.5 rounded-lg transition-colors" title="テンプレートとして保存">
                            <BookmarkPlus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <select className="w-full p-4 sm:p-6 text-lg sm:text-2xl font-black border-2 sm:border-4 border-gray-100 rounded-xl sm:rounded-[2rem] bg-gray-50 focus:border-blue-500 focus:bg-white transition-all outline-none" value={photo.process} onChange={(e) => updatePhoto(photo.id, "process", e.target.value)}>
                        <option value="">-- 工程を選択 --</option>
                        {processOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>

                    {/* 説明文テキストエリア＆定型文 */}
                    <div className="space-y-2 sm:space-y-4 flex-1 flex flex-col">
                      <label className="text-[10px] sm:text-sm font-black text-gray-400 pl-2 sm:pl-4 uppercase tracking-[0.1em] sm:tracking-[0.2em]">説明 / DESCRIPTION</label>
                      <div className="flex flex-wrap gap-2 sm:gap-3 mb-1 sm:mb-2">
                        {descTemplates.map((tmpl, i) => (
                          <button key={i} type="button" onClick={() => updatePhoto(photo.id, "description", (photo.description || "") + tmpl.text)} className="text-xs sm:text-base font-black text-blue-700 bg-blue-50 border border-blue-100 px-3 py-2 sm:px-6 sm:py-3 rounded-lg sm:rounded-2xl hover:bg-blue-100 active:scale-95 shadow-sm">＋{tmpl.label}</button>
                        ))}
                      </div>
                      <textarea rows={4} className="w-full flex-1 p-4 sm:p-8 text-base sm:text-2xl font-bold border-2 sm:border-4 border-gray-100 rounded-xl sm:rounded-[2.5rem] bg-gray-50 focus:border-blue-500 focus:bg-white transition-all outline-none shadow-inner resize-y min-h-[120px]" value={photo.description} onChange={(e) => updatePhoto(photo.id, "description", e.target.value)} placeholder="現場状況の詳細を入力" />
                    </div>

                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={addPhotoSlot} className="w-full mt-12 sm:mt-24 bg-gray-900 text-white font-black py-5 sm:py-8 text-xl sm:text-3xl rounded-2xl sm:rounded-[3rem] shadow-[0_10px_30px_rgba(0,0,0,0.2)] sm:shadow-[0_20px_60px_rgba(0,0,0,0.3)] flex items-center justify-center gap-3 sm:gap-6 hover:bg-black transition-all active:scale-95 mb-10 sm:mb-20"><Plus className="w-6 h-6 sm:w-10 sm:h-10" strokeWidth={4} /> 写真枠を追加する</button>

      </div>
      <PinSelectModal isOpen={modalOpen} onClose={() => setModalOpen(false)} pins={project?.mapPins} onSelect={(label) => currentPhotoId && updatePhoto(currentPhotoId, "locationMap", label)} />
    </div>
  );
}