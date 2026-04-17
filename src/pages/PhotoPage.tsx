import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, Trash2, ArrowLeft, ArrowUp, ArrowDown, UploadCloud, MapPin, X, Plus, Edit2, Ruler, Paintbrush, CaseUpper, Copy, CheckSquare, Calendar, ChevronDown, BookmarkPlus } from 'lucide-react';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import imageCompression from 'browser-image-compression';
import { proxyUrl, useDraggablePin } from '../shared/utils';
import { canUpload, trackDelete, trackUpload } from '../shared/storageUtils';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';
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

const getRemoteFileSize = async (url: string): Promise<number | null> => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentLength = response.headers.get('content-length');
    return contentLength ? Number(contentLength) : null;
  } catch {
    return null;
  }
};

// 回転済みコンテナ上のスクリーン座標 → ローカル座標（%）変換
const getLocalPointFromRect = (clientX: number, clientY: number, rect: DOMRect, angle: number) => {
  let localX = 0, localY = 0;
  let w = rect.width, h = rect.height;
  const normAngle = ((angle % 360) + 360) % 360;
  if (normAngle === 0)   { localX = clientX - rect.left; localY = clientY - rect.top; }
  else if (normAngle === 90)  { localX = clientY - rect.top; localY = rect.right - clientX; w = rect.height; h = rect.width; }
  else if (normAngle === 180) { localX = rect.right - clientX; localY = rect.bottom - clientY; }
  else if (normAngle === 270) { localX = rect.bottom - clientY; localY = clientX - rect.left; w = rect.height; h = rect.width; }
  return { x: Math.max(0, Math.min(100, (localX / w) * 100)), y: Math.max(0, Math.min(100, (localY / h) * 100)) };
};

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

const DimensionLineMarker = React.memo(function DimensionLineMarker({ line, isSelected, onSelect, onRemove, onTextChange, onUpdate, onDeselect, rotation }: { line: DimensionLine; isSelected: boolean; onSelect: () => void; onRemove: () => void; onTextChange: (text: string) => void; onUpdate: (props: Partial<DimensionLine>) => void; onDeselect: () => void; rotation: number; }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [localStart, setLocalStart] = useState(line.start);
  const [localEnd, setLocalEnd] = useState(line.end);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);

  useEffect(() => {
    if (isDragging) return;
    const frame = requestAnimationFrame(() => {
      setLocalStart(line.start);
      setLocalEnd(line.end);
    });
    return () => cancelAnimationFrame(frame);
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
    const container = (e.currentTarget as Element).closest('.cursor-crosshair') as HTMLElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const { x, y } = getLocalPointFromRect(e.clientX, e.clientY, rect, rotation);
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
        <div
          style={{
            left: `${safePopupX}%`, top: `${safePopupY}%`,
            background: '#1c1c30', borderColor: '#2e2e50',
          }}
          className="absolute z-30 translate-x-[-50%] translate-y-[-50%] flex flex-col items-center gap-4 p-4 sm:p-5 rounded-2xl shadow-2xl border min-w-[280px] w-[90%] max-w-[320px] sm:w-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex w-full gap-3 items-center justify-between border-b pb-3" style={{ borderColor: '#2e2e50' }}>
            <h4 className="text-base font-black flex items-center gap-2" style={{ color: '#f0ede8' }}>
              <CaseUpper className="w-5 h-5" style={{ color: '#ff6b35' }} /> 部位と寸法を入力
            </h4>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-2 rounded-xl transition-colors"
              style={{ color: '#ef4444', background: 'rgba(239,68,68,0.12)' }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2 w-full">
            {DEFAULT_ROOF_PART_NAMES.map(name => (
              <button
                key={name}
                onClick={() => addPartName(name)}
                className="text-sm font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95"
                style={{ color: '#ff6b35', background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.25)' }}
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
              className="flex-1 p-3 text-base font-bold rounded-xl outline-none text-center"
              style={{ background: '#12122a', border: '1px solid #3d3d60', color: '#f0ede8' }}
              placeholder="部位 〇〇m"
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeselect(); }}
              className="px-4 py-2 font-black rounded-xl transition-all whitespace-nowrap"
              style={{ background: '#ff6b35', color: '#fff' }}
            >
              ✓ 完了
            </button>
          </div>
        </div>
      )}

      {isSelected && (
        <>
          <div
            className="absolute z-40 w-10 h-10 -ml-5 -mt-5 rounded-full cursor-move touch-none shadow-xl"
            style={{ left: `${localStart.x}%`, top: `${localStart.y}%`, background: 'rgba(255,107,53,0.2)', border: '3px solid #ff6b35' }}
            onPointerDown={(e) => startDrag(e, 'start')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="absolute z-40 w-10 h-10 -ml-5 -mt-5 rounded-full cursor-move touch-none shadow-xl"
            style={{ left: `${localEnd.x}%`, top: `${localEnd.y}%`, background: 'rgba(255,107,53,0.2)', border: '3px solid #ff6b35' }}
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
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(2px)'
          }}
          className="absolute z-20 translate-x-[-50%] translate-y-[-50%] font-bold text-sm px-2 py-0.5 rounded pointer-events-none whitespace-nowrap border border-white/10 shadow-sm"
        >
          {line.text}
        </div>
      )}
    </>
  );
});

function PhotoCircleMarker({ circle, isSelected, onSelect, onDragEnd, onSizeChange, onRemove, rotation }: { circle: Circle; isSelected: boolean; onSelect: () => void; onDragEnd: (x: number, y: number) => void; onSizeChange: (size: number) => void; onRemove: () => void; rotation: number; }) {
  const handleDragEnd = (x: number, y: number) => { onDragEnd(x, y); };
  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(circle.x, circle.y, handleDragEnd, rotation);
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
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            left: `${position.x}%`, top: `${position.y + size/2 + 8}%`,
            transform: 'translateX(-50%)',
            background: '#1c1c30', border: '1px solid #3d3d60',
          }}
          className="absolute z-[1000] flex rounded-xl shadow-2xl overflow-hidden"
        >
          <button onClick={(e) => { e.stopPropagation(); onSizeChange(Math.min(80, Math.round(size + 5))); }} className="px-4 py-2.5 text-lg font-bold transition-colors" style={{ color: '#f0ede8', borderRight: '1px solid #3d3d60' }} onPointerEnter={e => (e.currentTarget.style.background = '#2e2e50')} onPointerLeave={e => (e.currentTarget.style.background = 'transparent')}>＋</button>
          <button onClick={(e) => { e.stopPropagation(); onSizeChange(Math.max(5, Math.round(size - 5))); }} className="px-4 py-2.5 text-lg font-bold transition-colors" style={{ color: '#f0ede8', borderRight: '1px solid #3d3d60' }} onPointerEnter={e => (e.currentTarget.style.background = '#2e2e50')} onPointerLeave={e => (e.currentTarget.style.background = 'transparent')}>－</button>
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="px-4 py-2.5 transition-colors" style={{ color: '#ef4444' }} onPointerEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')} onPointerLeave={e => (e.currentTarget.style.background = 'transparent')}><Trash2 className="w-4 h-4" /></button>
        </div>
      )}
    </>
  );
}

function PinSelectModal({ isOpen, onClose, pins, onSelect }: { isOpen: boolean; onClose: () => void; pins: MapPinT[] | undefined; onSelect: (label: string) => void; }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-sm p-6 rounded-2xl shadow-2xl space-y-5" style={{ background: '#1c1c30', border: '1px solid #2e2e50' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center pb-3 border-b" style={{ borderColor: '#2e2e50' }}>
          <h3 className="text-base font-black flex items-center gap-2" style={{ color: '#f0ede8' }}>
            <MapPin className="w-5 h-5" style={{ color: '#ef4444' }} /> 位置図の場所を選択
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: '#8b8ba8' }} onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')} onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        {pins && pins.length > 0 ? (
          <div className="grid grid-cols-3 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {pins.map((pin) => (
              <button
                key={pin.id}
                onClick={() => { onSelect(pin.label); onClose(); }}
                className="font-black py-3 text-center rounded-xl text-sm transition-all active:scale-95"
                style={{ background: '#12122a', border: '1px solid #2e2e50', color: '#f0ede8' }}
                onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
                onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e50'; (e.currentTarget as HTMLButtonElement).style.color = '#f0ede8'; }}
              >
                {pin.label}
              </button>
            ))}
            <button onClick={() => { onSelect(""); onClose(); }} className="col-span-3 font-bold py-2.5 rounded-xl mt-1 transition-colors text-sm" style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}>
              選択を解除
            </button>
          </div>
        ) : (
          <div className="text-center py-10 px-4 rounded-2xl border-2 border-dashed" style={{ borderColor: '#2e2e50' }}>
            <p className="font-bold text-sm leading-relaxed" style={{ color: '#6b7280' }}>
              先に位置図画面で<br /><span style={{ color: '#ef4444' }}>マーカー（符号）</span>を<br />打ってください
            </p>
          </div>
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
        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
        style={{ color: '#ff6b35', background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.25)' }}
      >
        テンプレート <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-64 rounded-xl shadow-xl overflow-hidden" style={{ background: '#1c1c30', border: '1px solid #2e2e50' }}>
          <div className="p-2 border-b" style={{ borderColor: '#2e2e50' }}>
            <input
              type="text"
              placeholder="絞り込み..."
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: '#12122a', border: '1px solid #3d3d60', color: '#f0ede8' }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-center" style={{ color: '#6b7280' }}>該当なし</li>
            ) : (
              filtered.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 transition-colors border-b last:border-none"
                    style={{ borderColor: '#2e2e50' }}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(m); }}
                    onPointerEnter={e => (e.currentTarget.style.background = '#2e2e50')}
                    onPointerLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="font-bold text-sm" style={{ color: '#f0ede8' }}>{m.name}</div>
                    {m.process && <div className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{m.process}</div>}
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

  const [cardMode, setCardMode] = useState<{ photoId: number; mode: 'circle' | 'dimension' } | null>(null);
  const [selectedDimensionLineId, setSelectedDimensionLineId] = useState<number | null>(null);
  const [drawingStartPoint, setDrawingStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeColor, setActiveColor] = useState<string>(COLOR_PALETTE[0].value);

  const [processOptions, setProcessOptions] = useState<string[]>(DEFAULT_PROCESS_OPTIONS);
  const [descTemplates, setDescTemplates] = useState<{label: string, text: string}[]>(DEFAULT_DESC_TEMPLATES);
  const [photoMasters, setPhotoMasters] = useState<PhotoMaster[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<number[]>([]);
  const [batchDate, setBatchDate] = useState("");

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "projects", id)).then(d => d.exists() && setProject(d.data() as Project));
    const user = auth.currentUser;
    if (!user) return;
    setUid(user.uid);
    getDoc(doc(db, 'users', user.uid)).then((s) => {
      if (s.exists()) {
        const data = s.data();
        if (data.customProcesses && data.customProcesses.length > 0) setProcessOptions(data.customProcesses);
        if (data.customDescTemplates && data.customDescTemplates.length > 0) setDescTemplates(data.customDescTemplates);
        if (Array.isArray(data.photoMaster)) setPhotoMasters(data.photoMaster);
        if (typeof data.storageUsedBytes === 'number') setStorageUsedBytes(data.storageUsedBytes);
      }
    });
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
      const target = project.photos.find((p) => p.id === photoId);
      if (target?.image) {
        const bytes = await getRemoteFileSize(target.image);
        try {
          await deleteObject(ref(storage, target.image));
          if (uid && bytes && Number.isFinite(bytes)) {
            await trackDelete(uid, bytes);
            setStorageUsedBytes((prev) => Math.max(0, prev - bytes));
          }
          // TODO: 既存写真にはfileSizeがないため、HEADでサイズを取得できない環境では使用量を減算できない。
        } catch (err) {
          logFirebaseError(err, '写真ファイル削除');
        }
      }
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
      const targets = project.photos.filter((p) => selectedPhotoIds.includes(p.id) && p.image);
      for (const target of targets) {
        if (!target.image) continue;
        const bytes = await getRemoteFileSize(target.image);
        try {
          await deleteObject(ref(storage, target.image));
          if (uid && bytes && Number.isFinite(bytes)) {
            await trackDelete(uid, bytes);
            setStorageUsedBytes((prev) => Math.max(0, prev - bytes));
          }
          // TODO: 既存写真にはfileSizeがないため、HEADでサイズを取得できない環境では使用量を減算できない。
        } catch (err) {
          logFirebaseError(err, '写真ファイル削除');
        }
      }
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
    if (index < 0 || index >= project.photos.length) return;
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
    const newPhotos = [...project.photos];
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
        if (!canUpload(storageUsedBytes, compressedFile.size)) {
          alert('ストレージ容量が上限（500MB）に達しています。不要な写真を削除してください。');
          break;
        }
        const r = ref(storage, `photos/${id}/${Date.now()}_bulk_${i}.jpg`);
        await uploadBytes(r, compressedFile);
        const url = await getDownloadURL(r);
        if (uid) {
          await trackUpload(uid, compressedFile.size);
          setStorageUsedBytes((prev) => prev + compressedFile.size);
        }
        newPhotos[targetIndex] = { ...newPhotos[targetIndex], image: url, shootingDate: newPhotos[targetIndex].shootingDate || todayStr };
        setProject((prev) => prev ? { ...prev, photos: [...newPhotos] } : null);
        await updateDoc(doc(db, "projects", id), { photos: newPhotos });
      } catch (error) {
        logFirebaseError(error, `写真一括アップロード(${i + 1}枚目)`);
        alert(`${i + 1}枚目：${firebaseErrorMessage(error, 'アップロード')}`);
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
    if (index < 0 || index >= project.photos.length) return;
    const photoId = project.photos[index].id;
    setLoadingId(photoId);

    try {
      const compressedFile = await compressPhotoWithQuality(f);
      if (!canUpload(storageUsedBytes, compressedFile.size)) {
        alert('ストレージ容量が上限（500MB）に達しています。不要な写真を削除してください。');
        return;
      }
      const r = ref(storage, `photos/${id}/${Date.now()}.jpg`);
      await uploadBytes(r, compressedFile);
      const url = await getDownloadURL(r);
      if (uid) {
        await trackUpload(uid, compressedFile.size);
        setStorageUsedBytes((prev) => prev + compressedFile.size);
      }
      const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, image: url, shootingDate: p.shootingDate || getTodayStr() } : p);
      setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
      await updateDoc(doc(db, "projects", id), { photos: newPhotos });
    } catch (err) {
      logFirebaseError(err, '写真アップロード');
      alert(firebaseErrorMessage(err, '写真のアップロード'));
    } finally {
      setLoadingId(null);
    }
  };

  const setPhotoMode = (photoId: number, mode: 'circle' | 'dimension') => {
    setCardMode((prev) => (prev?.photoId === photoId && prev.mode === mode) ? null : { photoId, mode });
    setDrawingStartPoint(null);
    setSelectedCircleId(null);
    setSelectedDimensionLineId(null);
  };

  const handlePhotoClick = async (e: MouseEvent<HTMLDivElement>, photoId: number) => {
    if (!project || !id) return;
    const mode = cardMode?.photoId === photoId ? cardMode.mode : null;
    if (!mode) return;
    const photo = project.photos.find((p) => p.id === photoId);
    if (!photo) return;
    const rotation = Number(photo.rotation || 0);
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = getLocalPointFromRect(e.clientX, e.clientY, rect, rotation);

    if (mode === 'circle') {
      if (selectedCircleId !== null) { setSelectedCircleId(null); return; }
      const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: [...(p.circles || []), { id: Date.now(), x, y, size: 20 }] } : p);
      setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
      await updateDoc(doc(db, "projects", id), { photos: newPhotos });
    } else if (mode === 'dimension') {
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
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: (p.circles ?? []).map((c) => c.id === circleId ? { ...c, ...newProps } : c) } : p);
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await updateDoc(doc(db, "projects", id), { photos: newPhotos });
  };

  const removeCircle = async (photoId: number, circleId: number) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: (p.circles ?? []).filter((c) => c.id !== circleId) } : p);
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

  if (!project) return (
    <div className="min-h-screen flex items-center justify-center font-sans" style={{ background: '#0f0f1a' }}>
      <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#ff6b35', borderTopColor: 'transparent' }} />
    </div>
  );

  return (
    <div
      className="min-h-screen font-sans pb-40 select-none overflow-x-hidden"
      style={{ background: '#0f0f1a', color: '#f0ede8' }}
      onClick={() => { setSelectedCircleId(null); setSelectedDimensionLineId(null); }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">

        {/* ── 上部コントロールエリア ── */}
        <div className="max-w-3xl mx-auto">

          {/* ヘッダー */}
          <div className="flex items-center justify-between py-5">
            <button
              onClick={() => navigate(`/project/${id}`)}
              className="flex items-center gap-2 font-bold text-sm transition-colors"
              style={{ color: '#8b8ba8' }}
              onPointerEnter={e => (e.currentTarget.style.color = '#ff6b35')}
              onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
            >
              <ArrowLeft className="w-4 h-4" /> もどる
            </button>
          </div>

          {/* タイトル */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-wide" style={{ color: '#f0ede8' }}>工事写真の登録</h1>
            <div className="mt-1.5 h-0.5 w-12 rounded-full" style={{ background: '#ff6b35' }} />
          </div>

          {/* 一括アップロード */}
          <div className="rounded-2xl border p-4 mb-4" style={{ background: '#1c1c30', borderColor: '#2e2e50' }}>
            <label
              className="flex items-center justify-center gap-3 w-full font-black py-4 text-base rounded-xl cursor-pointer transition-all"
              style={{
                background: bulkUploading ? '#2e2e50' : '#ff6b35',
                color: '#fff',
                boxShadow: bulkUploading ? 'none' : '0 0 20px rgba(255,107,53,0.35)',
              }}
            >
              <UploadCloud className="w-5 h-5" />
              {bulkUploading ? `アップロード中... (${bulkProgress}枚)` : "複数写真を一括追加する"}
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleBulkUpload} disabled={bulkUploading} />
            </label>
          </div>

          {/* 日付一括 + 複数選択削除 */}
          <div
            className="flex flex-col sm:flex-row gap-3 p-4 rounded-2xl border mb-10"
            style={{ background: '#1c1c30', borderColor: '#2e2e50' }}
          >
            <div className="flex items-center gap-2 flex-1">
              <Calendar className="w-4 h-4 shrink-0" style={{ color: '#ff6b35' }} />
              <input
                type="date"
                value={batchDate}
                onChange={e => setBatchDate(e.target.value)}
                className="flex-1 p-2 rounded-lg font-bold text-sm outline-none"
                style={{ background: '#12122a', border: '1px solid #3d3d60', color: '#f0ede8', colorScheme: 'dark' }}
              />
              <button
                onClick={applyBatchDate}
                disabled={!batchDate}
                className="font-bold px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-40"
                style={{ background: 'rgba(255,107,53,0.15)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.3)' }}
              >
                全写真に適用
              </button>
            </div>

            <div className="flex items-center justify-end border-t sm:border-t-0 sm:border-l pt-3 sm:pt-0 sm:pl-4" style={{ borderColor: '#2e2e50' }}>
              {isSelectMode ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setIsSelectMode(false); setSelectedPhotoIds([]); }}
                    className="font-bold px-3 py-2 rounded-lg text-sm transition-colors"
                    style={{ background: '#2e2e50', color: '#8b8ba8' }}
                  >
                    取消
                  </button>
                  <button
                    onClick={deleteSelectedPhotos}
                    disabled={selectedPhotoIds.length === 0}
                    className="font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-all disabled:opacity-40"
                    style={{ background: '#ef4444', color: '#fff' }}
                  >
                    <Trash2 className="w-4 h-4" /> {selectedPhotoIds.length}件削除
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsSelectMode(true)}
                  className="font-bold px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
                  style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}
                  onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
                  onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
                >
                  <CheckSquare className="w-4 h-4" /> 複数選択して削除
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── 写真カードリスト ── */}
        <div className="space-y-6 mt-2">
          {project.photos.map((photo, index: number) => {
            const isRotated90 = Number(photo.rotation || 0) % 180 !== 0;
            const isCircleMode = cardMode?.photoId === photo.id && cardMode.mode === 'circle';
            const isDimensionMode = cardMode?.photoId === photo.id && cardMode.mode === 'dimension';

            return (
              <div
                key={photo.id}
                className="rounded-2xl border relative"
                style={{ background: '#1c1c30', borderColor: '#2e2e50' }}
              >
                {/* 一括削除モード時のオーバーレイ */}
                {isSelectMode && (
                  <div
                    onClick={() => toggleSelectPhoto(photo.id)}
                    className="absolute inset-0 z-50 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-center"
                    style={{
                      borderColor: selectedPhotoIds.includes(photo.id) ? '#ef4444' : 'transparent',
                      background: selectedPhotoIds.includes(photo.id) ? 'rgba(239,68,68,0.08)' : 'rgba(0,0,0,0.05)',
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-full border-2 flex items-center justify-center"
                      style={{
                        background: selectedPhotoIds.includes(photo.id) ? '#ef4444' : '#12122a',
                        borderColor: selectedPhotoIds.includes(photo.id) ? '#ef4444' : '#3d3d60',
                        color: '#fff',
                      }}
                    >
                      <CheckSquare className="w-5 h-5" />
                    </div>
                  </div>
                )}

                <div className="p-4 sm:p-6">
                  {/* ── ヘッダー行：番号 ＋ 順番入れ替え ── */}
                  <div className="flex justify-between items-center mb-4">
                    <div className="font-black text-lg flex items-center gap-3" style={{ color: '#f0ede8' }}>
                      <span
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-black"
                        style={{ background: '#ff6b35', color: '#fff' }}
                      >
                        {index + 1}
                      </span>
                      写真
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => movePhoto(index, 'up')}
                        className="p-2 rounded-lg transition-colors"
                        style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}
                        onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
                        onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
                        title="上へ"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => movePhoto(index, 'down')}
                        className="p-2 rounded-lg transition-colors"
                        style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}
                        onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
                        onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
                        title="下へ"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* ── アクション行 ── */}
                  <div className="flex gap-2 flex-wrap mb-5 pb-5 border-b" style={{ borderColor: '#2e2e50' }}>
                    <button
                      type="button"
                      onClick={() => duplicatePhotoSlot(index)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                      style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}
                    >
                      <Copy className="w-3.5 h-3.5" /> 複製
                    </button>
                    <button
                      type="button"
                      onClick={() => updatePhoto(photo.id, 'rotation', ((Number(photo.rotation || 0)) + 90) % 360)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                      style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}
                      onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
                      onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
                    >
                      ↻ 回転
                    </button>
                    <button
                      onClick={() => deletePhotoSlot(photo.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 削除
                    </button>
                    <label
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black cursor-pointer transition-all ml-auto"
                      style={{ background: '#ff6b35', color: '#fff' }}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {photo.image ? '写真を変更' : '写真を選択'}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e, index)} />
                    </label>
                  </div>

                  {/* ── 2カラムレイアウト ── */}
                  <div className="flex flex-col lg:flex-row gap-5">

                    {/* 左：写真エリア */}
                    <div className="w-full lg:w-[55%] flex flex-col gap-3">
                      <div
                        className={`w-full rounded-xl overflow-hidden flex items-center justify-center border ${photo.image && isRotated90 ? 'min-h-[50vh]' : 'min-h-[14rem] sm:min-h-[20rem]'}`}
                        style={{ background: '#12122a', borderColor: '#2e2e50' }}
                      >
                        {loadingId === photo.id ? (
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#ff6b35', borderTopColor: 'transparent' }} />
                            <span className="text-sm font-black" style={{ color: '#ff6b35' }}>保存中...</span>
                          </div>
                        ) : photo.image ? (
                          <div
                            className="relative cursor-crosshair"
                            style={{ display: 'inline-block', lineHeight: 0, transform: `rotate(${Number(photo.rotation || 0)}deg)` }}
                            onClick={(e) => handlePhotoClick(e, photo.id)}
                          >
                            <img
                              src={proxyUrl(photo.image, photo.id)}
                              crossOrigin="anonymous"
                              className="block w-auto h-auto max-w-full pointer-events-none rounded-lg object-contain"
                              style={{ maxHeight: isRotated90 ? '50vh' : '60vh' }}
                              alt=""
                            />

                            {(photo.circles || []).map((circle) => (
                              <PhotoCircleMarker
                                key={circle.id}
                                circle={circle}
                                isSelected={selectedCircleId === circle.id}
                                onSelect={() => setSelectedCircleId(circle.id)}
                                onDragEnd={(x, y) => updateCircle(photo.id, circle.id, { x, y })}
                                onSizeChange={(size) => updateCircle(photo.id, circle.id, { size })}
                                onRemove={() => removeCircle(photo.id, circle.id)}
                                rotation={Number(photo.rotation || 0)}
                              />
                            ))}

                            {(photo.dimensionLines || []).map((line) => (
                              <DimensionLineMarker
                                key={line.id}
                                line={line}
                                isSelected={selectedDimensionLineId === line.id}
                                onSelect={() => setSelectedDimensionLineId(line.id)}
                                onRemove={() => removeDimensionLine(photo.id, line.id)}
                                onTextChange={(text) => updateDimensionLine(photo.id, line.id, { text })}
                                onUpdate={(newProps) => updateDimensionLine(photo.id, line.id, newProps)}
                                onDeselect={() => setSelectedDimensionLineId(null)}
                                rotation={Number(photo.rotation || 0)}
                              />
                            ))}

                            {drawingStartPoint && cardMode?.photoId === photo.id && cardMode.mode === 'dimension' && (
                              <div
                                style={{ left: `${drawingStartPoint.x}%`, top: `${drawingStartPoint.y}%`, backgroundColor: activeColor }}
                                className="absolute w-3 h-3 rounded-full border-2 border-white shadow-xl pointer-events-none z-20"
                              />
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <Camera className="w-12 h-12 mx-auto mb-3 opacity-20" style={{ color: '#8b8ba8' }} />
                            <span className="text-sm font-bold block" style={{ color: '#6b7280' }}>画像を選択してください</span>
                          </div>
                        )}
                      </div>

                      {/* 編集ツール（写真がある場合のみ） */}
                      {photo.image && (
                        <div className="space-y-2">
                          {/* モード切替ボタン */}
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setPhotoMode(photo.id, 'circle')}
                              className="flex items-center gap-2 justify-center py-2.5 rounded-xl font-black text-xs transition-all border"
                              style={isCircleMode
                                ? { background: '#ef4444', color: '#fff', borderColor: '#ef4444' }
                                : { background: '#12122a', color: '#8b8ba8', borderColor: '#2e2e50' }
                              }
                              onPointerEnter={e => { if (!isCircleMode) (e.currentTarget.style.borderColor = '#ef4444'); }}
                              onPointerLeave={e => { if (!isCircleMode) (e.currentTarget.style.borderColor = '#2e2e50'); }}
                            >
                              <Edit2 className="w-4 h-4" /> 赤丸を追加
                            </button>
                            <button
                              onClick={() => setPhotoMode(photo.id, 'dimension')}
                              className="flex items-center gap-2 justify-center py-2.5 rounded-xl font-black text-xs transition-all border"
                              style={isDimensionMode
                                ? { background: '#f0ede8', color: '#0f0f1a', borderColor: '#f0ede8' }
                                : { background: '#12122a', color: '#8b8ba8', borderColor: '#2e2e50' }
                              }
                              onPointerEnter={e => { if (!isDimensionMode) (e.currentTarget.style.borderColor = '#8b8ba8'); }}
                              onPointerLeave={e => { if (!isDimensionMode) (e.currentTarget.style.borderColor = '#2e2e50'); }}
                            >
                              <Ruler className="w-4 h-4" /> 寸法記入
                            </button>
                          </div>

                          {/* カラーパレット（寸法モード時のみ） */}
                          {isDimensionMode && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border flex-wrap" style={{ background: '#12122a', borderColor: '#2e2e50' }}>
                              <Paintbrush className="w-3.5 h-3.5 shrink-0" style={{ color: '#6b7280' }} />
                              {COLOR_PALETTE.map(color => (
                                <button
                                  key={color.name}
                                  onClick={() => setActiveColor(color.value)}
                                  className="w-6 h-6 rounded-full transition-all"
                                  style={{
                                    backgroundColor: color.value,
                                    border: activeColor === color.value ? '3px solid #ff6b35' : '2px solid #2e2e50',
                                    transform: activeColor === color.value ? 'scale(1.15)' : 'scale(1)',
                                  }}
                                />
                              ))}
                              <label
                                className="w-6 h-6 rounded-full cursor-pointer overflow-hidden flex items-center justify-center transition-all"
                                style={{
                                  background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                                  border: !COLOR_PALETTE.some(c => c.value === activeColor) ? '3px solid #ff6b35' : '2px solid #2e2e50',
                                }}
                                title="自由色"
                              >
                                <input type="color" value={activeColor} onChange={(e) => setActiveColor(e.target.value)} className="opacity-0 absolute w-px h-px" />
                              </label>
                            </div>
                          )}

                          {/* ヒントバー */}
                          {(isCircleMode || isDimensionMode) && (
                            <div
                              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border"
                              style={isCircleMode
                                ? { background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', color: '#ef4444' }
                                : drawingStartPoint
                                  ? { background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.25)', color: '#eab308' }
                                  : { background: 'rgba(255,107,53,0.08)', borderColor: 'rgba(255,107,53,0.25)', color: '#ff6b35' }
                              }
                            >
                              {isCircleMode
                                ? <><span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 inline-block" /> 赤丸モード：画像をタップして追加</>
                                : !drawingStartPoint
                                  ? <><Ruler className="w-3 h-3 shrink-0" /> 寸法記入：始点をタップしてください</>
                                  : <><Ruler className="w-3 h-3 shrink-0" /> 寸法記入：終点をタップしてください</>
                              }
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 右：入力フォーム群 */}
                    <div className="w-full lg:w-[45%] flex flex-col gap-4">

                      {/* 日付 */}
                      <div className="flex items-center gap-3 p-3.5 rounded-xl border" style={{ background: '#12122a', borderColor: '#2e2e50' }}>
                        <div className="font-bold text-xs whitespace-nowrap" style={{ color: '#8b8ba8' }}>撮影日</div>
                        <input
                          type="date"
                          className="flex-1 bg-transparent text-sm font-bold outline-none"
                          style={{ color: '#f0ede8', colorScheme: 'dark' }}
                          value={formatToYMD(photo.shootingDate)}
                          onChange={(e) => updatePhoto(photo.id, "shootingDate", formatToYMDSlash(e.target.value))}
                        />
                      </div>

                      {/* 場所選択 */}
                      <button
                        onClick={() => { setCurrentPhotoId(photo.id); setModalOpen(true); }}
                        className="w-full p-3.5 rounded-xl border text-left flex justify-between items-center transition-all text-sm font-bold"
                        style={photo.locationMap
                          ? { color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.06)' }
                          : { color: '#6b7280', borderColor: '#2e2e50', background: '#12122a' }
                        }
                      >
                        <span className="truncate">{photo.locationMap || '場所を選択（符号と連動）'}</span>
                        <MapPin className="w-4 h-4 shrink-0" style={{ color: photo.locationMap ? '#ef4444' : '#3d3d60' }} />
                      </button>

                      {/* 工程 */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between px-1">
                          <label className="text-xs font-black uppercase tracking-widest" style={{ color: '#6b7280' }}>工程 / PROCESS</label>
                          <div className="flex items-center gap-1.5">
                            <PhotoMasterCombobox masters={photoMasters} onApply={(m) => applyPhotoMaster(photo.id, m)} />
                            <button
                              type="button"
                              onClick={() => saveToPhotoMaster(photo)}
                              className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg transition-colors"
                              style={{ color: '#10b981' }}
                              onPointerEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.1)')}
                              onPointerLeave={e => (e.currentTarget.style.background = 'transparent')}
                              title="テンプレートとして保存"
                            >
                              <BookmarkPlus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <select
                          className="w-full p-3 text-sm font-bold rounded-xl outline-none transition-all"
                          style={{ background: '#12122a', border: '1px solid #2e2e50', color: '#f0ede8', colorScheme: 'dark' }}
                          value={photo.process}
                          onChange={(e) => updatePhoto(photo.id, "process", e.target.value)}
                        >
                          <option value="">-- 工程を選択 --</option>
                          {processOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>

                      {/* 説明文 */}
                      <div className="space-y-1.5 flex-1 flex flex-col">
                        <label className="text-xs font-black uppercase tracking-widest px-1" style={{ color: '#6b7280' }}>説明 / DESCRIPTION</label>
                        <div className="flex flex-wrap gap-1.5">
                          {descTemplates.map((tmpl, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => updatePhoto(photo.id, "description", (photo.description || "") + tmpl.text)}
                              className="text-xs font-bold px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
                              style={{ color: '#ff6b35', background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.2)' }}
                            >
                              ＋{tmpl.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          rows={4}
                          className="w-full flex-1 p-3 text-sm font-bold rounded-xl outline-none resize-y min-h-[100px] transition-all"
                          style={{ background: '#12122a', border: '1px solid #2e2e50', color: '#f0ede8' }}
                          value={photo.description}
                          onChange={(e) => updatePhoto(photo.id, "description", e.target.value)}
                          placeholder="現場状況の詳細を入力"
                        />
                      </div>

                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 写真追加ボタン */}
        <button
          onClick={addPhotoSlot}
          className="w-full mt-8 mb-16 flex items-center justify-center gap-3 py-5 rounded-2xl font-black text-base transition-all border"
          style={{ background: '#1c1c30', borderColor: '#2e2e50', color: '#f0ede8' }}
          onPointerEnter={e => { (e.currentTarget.style.borderColor = '#ff6b35'); (e.currentTarget.style.color = '#ff6b35'); }}
          onPointerLeave={e => { (e.currentTarget.style.borderColor = '#2e2e50'); (e.currentTarget.style.color = '#f0ede8'); }}
        >
          <Plus className="w-5 h-5" /> 写真枠を追加する
        </button>

      </div>

      <PinSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        pins={project?.mapPins}
        onSelect={(label) => currentPhotoId && updatePhoto(currentPhotoId, "locationMap", label)}
      />
    </div>
  );
}
