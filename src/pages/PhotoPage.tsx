import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, Trash2, ArrowLeft, ArrowUp, ArrowDown, UploadCloud, MapPin, Plus, Edit2, Ruler, Paintbrush, CaseUpper, Copy, CheckSquare, Calendar, BookmarkPlus, GripVertical, LayoutGrid, List } from 'lucide-react';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { proxyUrl, useDraggablePin, nextId } from '../shared/utils';
import { canUpload, trackUpload, deleteStorageFileWithAccounting } from '../shared/storageUtils';
import { compressPhotoWithQuality } from '../shared/imageUtils';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';
import type { Circle, Photo, Project, DimensionLine, PhotoMaster } from '../types';
import type { ChangeEvent, MouseEvent } from 'react';
import { ConfirmModal } from '../shared/ConfirmModal';
import { PinSelectModal } from './photo/PinSelectModal';
import { PhotoMasterCombobox } from './photo/PhotoMasterCombobox';
import {
  DndContext, PointerSensor, TouchSensor,
  closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label="削除" className="px-4 py-2.5 transition-colors" style={{ color: '#ef4444' }} onPointerEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')} onPointerLeave={e => (e.currentTarget.style.background = 'transparent')}><Trash2 className="w-4 h-4" /></button>
        </div>
      )}
    </>
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

// ドラッグ可能な写真カードラッパー（Render Props パターン）
// カード本体のロジックをここに移さず、ドラッグ挙動だけを提供する
interface SortablePhotoCardProps {
  id: number;
  children: (props: {
    isDragging: boolean;
    dragHandleProps: React.HTMLAttributes<HTMLElement>;
  }) => React.ReactNode;
}
function SortablePhotoCard({ id, children }: SortablePhotoCardProps) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ isDragging, dragHandleProps: { ...attributes, ...listeners } })}
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
  const [bulkTotal, setBulkTotal] = useState(0);
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
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<number | null>(null);
  const [confirmDeleteSelectedPhotos, setConfirmDeleteSelectedPhotos] = useState(false);
  const [confirmBatchDate, setConfirmBatchDate] = useState(false);
  const [confirmOverwritePhotoMaster, setConfirmOverwritePhotoMaster] = useState<{ name: string; photo: Photo } | null>(null);
  const [masterSaveSuccess, setMasterSaveSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [templateNameTarget, setTemplateNameTarget] = useState<Photo | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [templateNameInput, setTemplateNameInput] = useState('');

  // ── デバウンス保存インフラ(C-5 対策) ─────────────────────────
  // テキスト入力を1キーストロークごとに Firestore へ書くと、1現場で
  // 数千 writes に達し、コスト・競合・ネットワーク詰まりの原因になる。
  // ローカル state は即時反映、Firestore 書き込みは入力停止後にまとめる。
  const DEBOUNCE_MS = 600;
  const mountedRef = useRef(true);
  const [photoSaveState, setPhotoSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveStateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  // 同一 photoId の異なる field を別キーで管理(同 field 連打のみ debounce)。
  // 加えて、最新の photos 配列をリングバッファ的に保持して
  // タイマー発火時に "そのとき最新" の photos を Firestore に書き込めるようにする。
  const pendingPhotosRef = useRef<Photo[] | null>(null);
  // updatePhoto の useCallback 依存を id だけにするため、
  // project の最新値を ref 経由で参照する
  const projectRef = useRef<Project | null>(null);

  // dnd-kit センサー設定
  // PointerSensor: 8px 移動後に発動（クリック誤検知防止）
  // TouchSensor: 250ms 長押しで発動（赤丸・寸法線タッチと競合しない）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // 全タイマーを停止
      Object.values(debounceTimers.current).forEach((t) => { if (t) clearTimeout(t); });
      debounceTimers.current = {};
      if (saveStateTimer.current) clearTimeout(saveStateTimer.current);
      // 未書き込みのデータがあれば最後に1回だけ書く
      // (await できないので fire-and-forget。失敗時は次回ロードで整合)
      if (pendingPhotosRef.current && id) {
        const finalPhotos = pendingPhotosRef.current;
        pendingPhotosRef.current = null;
        void updateDoc(doc(db, 'projects', id), { photos: finalPhotos })
          .catch((err) => import.meta.env.DEV && console.warn('[PhotoPage] flush on unmount failed:', err));
      }
    };
    // 依存に id を入れると id 切替時に flush できる利点がある。
    // unmount 同等扱いだが、現状の画面遷移では id が変わらない前提。
  }, [id]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    if (!id) return;
    let aborted = false;
    (async () => {
      try {
        const projectSnap = await getDoc(doc(db, "projects", id));
        if (aborted || !mountedRef.current) return;
        if (projectSnap.exists()) setProject(projectSnap.data() as Project);

        const user = auth.currentUser;
        if (!user) return;
        if (!aborted && mountedRef.current) setUid(user.uid);

        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (aborted || !mountedRef.current) return;
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.customProcesses && data.customProcesses.length > 0) setProcessOptions(data.customProcesses);
          if (data.customDescTemplates && data.customDescTemplates.length > 0) setDescTemplates(data.customDescTemplates);
          if (Array.isArray(data.photoMaster)) setPhotoMasters(data.photoMaster);
          if (typeof data.storageUsedBytes === 'number') setStorageUsedBytes(data.storageUsedBytes);
        }
      } catch (err) {
        logFirebaseError(err, '写真ページ初期ロード');
        if (!aborted && mountedRef.current) {
          setUploadError(firebaseErrorMessage(err, 'データ読み込み'));
        }
      }
    })();
    return () => { aborted = true; };
  }, [id]);

  const applyPhotoMaster = async (photoId: number, m: PhotoMaster) => {
    if (!project || !id) return;
    cancelPendingPhotoDebounces();
    const newPhotos = project.photos.map((p) =>
      p.id === photoId ? { ...p, process: m.process, description: m.description } : p
    );
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await safeUpdate(newPhotos);
  };

  const saveToPhotoMaster = (photo: Photo) => {
    if (!uid) { setUploadError('マスタに保存するにはログインが必要です。'); return; }
    setTemplateNameInput(photo.process || '');
    setTemplateNameTarget(photo);
  };

  const doSaveToPhotoMaster = async (name: string, photo: Photo, existing: PhotoMaster | undefined) => {
    // 末尾スペース等で重複検出をすり抜けないよう trim する。
    // 呼び出し側でも trim しているが、念のため二重に。
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const entry: PhotoMaster = { id: existing?.id ?? nextId(), name: trimmedName, process: photo.process, description: photo.description };
    const newMasters = existing ? photoMasters.map((m) => m.id === existing.id ? entry : m) : [...photoMasters, entry];
    setPhotoMasters(newMasters);
    await setDoc(doc(db, 'users', uid!), { photoMaster: newMasters }, { merge: true });
    setMasterSaveSuccess(`「${entry.name}」をマスタに保存しました。`);
    setTimeout(() => setMasterSaveSuccess(null), 3000);
  };

  /**
   * 進行中のデバウンスタイマーを全部止める。
   *
   * 即時書き込み系の関数(applyBatchDate / deletePhotoSlot / applyPhotoMaster 等)が
   * 自前の updateDoc を実行する前に呼ぶ。これをやらないと、
   * "デバウンス中の古い photos" が "即時書き込みで保存した最新 photos" を上書きする
   * race condition が発生する。
   */
  const cancelPendingPhotoDebounces = useCallback(() => {
    Object.values(debounceTimers.current).forEach((t) => { if (t) clearTimeout(t); });
    debounceTimers.current = {};
    pendingPhotosRef.current = null;
  }, []);

  /** photos 配列を Firestore に安全に書き込む。失敗時はトーストを表示。 */
  const safeUpdate = useCallback(async (photos: Photo[]): Promise<boolean> => {
    if (!id) return false;
    try {
      await updateDoc(doc(db, 'projects', id), { photos });
      return true;
    } catch (err) {
      logFirebaseError(err, '写真ページ保存');
      if (mountedRef.current) {
        setUploadError(firebaseErrorMessage(err, '保存に失敗しました'));
      }
      return false;
    }
  }, [id]);

  // ── デバウンス保存(テキスト入力など連打されるフィールド用) ──
  const TEXT_FIELDS = new Set<keyof Photo>([
    'description', 'photoNumber', 'locationMap', 'process', 'shootingDate',
  ]);

  /**
   * 写真フィールドを更新する。
   *
   * - TEXT_FIELDS に含まれるフィールドはデバウンス書き込み(600ms)。
   * - それ以外(circles / dimensionLines / rotation / image)は即時書き込み。
   *   ボタン操作・ドラッグ確定は「確定操作」なので遅延すべきでない。
   */
  const updatePhoto = useCallback(async (
    photoId: number,
    field: keyof Photo,
    value: Photo[keyof Photo],
  ) => {
    const current = projectRef.current; // ref 経由で最新値を取得
    if (!current || !id) return;

    const newPhotos = current.photos.map((p) =>
      p.id === photoId ? { ...p, [field]: value } : p,
    );
    pendingPhotosRef.current = newPhotos;
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : prev);

    // 保存中インジケータ表示
    if (saveStateTimer.current) clearTimeout(saveStateTimer.current);
    setPhotoSaveState('saving');

    if (TEXT_FIELDS.has(field)) {
      // デバウンス: 同一 photoId+field の連打は最後の1回だけ書く。
      // photoId 単位でタイマーキーを作ると、別フィールド(例: process)を
      // 触ったときに前のタイマーがキャンセルされてしまうので field も含める。
      const key = `${photoId}:${field}`;
      const existing = debounceTimers.current[key];
      if (existing) clearTimeout(existing);
      debounceTimers.current[key] = setTimeout(async () => {
        debounceTimers.current[key] = undefined;
        // タイマー発火時点で最新の photos を書く(他フィールドの変更も反映)
        const photosToSave = pendingPhotosRef.current ?? newPhotos;
        try {
          await updateDoc(doc(db, 'projects', id), { photos: photosToSave });
          if (pendingPhotosRef.current === photosToSave) {
            pendingPhotosRef.current = null;
          }
          if (mountedRef.current) {
            setPhotoSaveState('saved');
            saveStateTimer.current = setTimeout(() => {
              if (mountedRef.current) setPhotoSaveState('idle');
            }, 2000);
          }
        } catch (err) {
          logFirebaseError(err, '写真フィールド保存');
          if (mountedRef.current) {
            setPhotoSaveState('idle');
            setUploadError(firebaseErrorMessage(err, '写真の保存'));
          }
        }
      }, DEBOUNCE_MS);
    } else {
      // 即時書き込み: ボタン操作系は確定として扱う
      try {
        await updateDoc(doc(db, 'projects', id), { photos: newPhotos });
        if (pendingPhotosRef.current === newPhotos) {
          pendingPhotosRef.current = null;
        }
        if (mountedRef.current) {
          setPhotoSaveState('saved');
          saveStateTimer.current = setTimeout(() => {
            if (mountedRef.current) setPhotoSaveState('idle');
          }, 2000);
        }
      } catch (err) {
        logFirebaseError(err, '写真フィールド保存');
        if (mountedRef.current) {
          setPhotoSaveState('idle');
          setUploadError(firebaseErrorMessage(err, '写真の保存'));
        }
      }
    }
  }, [id]);

  const deletePhotoSlot = async (photoId: number) => {
    if (!project || !id) return;
    cancelPendingPhotoDebounces();
    const target = project.photos.find((p) => p.id === photoId);
    // Storage 削除 + storageUsedBytes 減算を統合関数で実施。
    // 戻り値の bytes でローカル state を整合更新する(0 なら未減算)。
    if (target?.image) {
      const bytes = await deleteStorageFileWithAccounting(target.image, uid ?? undefined);
      if (bytes > 0) setStorageUsedBytes((prev) => Math.max(0, prev - bytes));
    }
    const newPhotos = project.photos.filter((p) => p.id !== photoId);
    const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
    setProject((prev) => prev ? { ...prev, photos: renumbered } : null);
    await safeUpdate(renumbered);
  };

  const toggleSelectPhoto = (photoId: number) => {
    setSelectedPhotoIds(prev => prev.includes(photoId) ? prev.filter(pId => pId !== photoId) : [...prev, photoId]);
  };

  const deleteSelectedPhotos = async () => {
    if (!project || !id || selectedPhotoIds.length === 0) return;
    cancelPendingPhotoDebounces();
    const targets = project.photos.filter((p) => selectedPhotoIds.includes(p.id) && p.image);
    // 並列削除(逐次だと10枚で5秒級になりやすい)
    const results = await Promise.allSettled(
      targets.map((t) => t.image ? deleteStorageFileWithAccounting(t.image, uid ?? undefined) : Promise.resolve(0))
    );
    const totalDeleted = results.reduce(
      (sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0),
      0,
    );
    if (totalDeleted > 0) setStorageUsedBytes((prev) => Math.max(0, prev - totalDeleted));

    const newPhotos = project.photos.filter((p) => !selectedPhotoIds.includes(p.id));
    const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
    setProject((prev) => prev ? { ...prev, photos: renumbered } : null);
    await safeUpdate(renumbered);
    setSelectedPhotoIds([]);
    setIsSelectMode(false);
  };

  const applyBatchDate = async () => {
    if (!project || !id || !batchDate) return;
    cancelPendingPhotoDebounces();
    const formatted = formatToYMDSlash(batchDate);
    const newPhotos = project.photos.map(p => ({ ...p, shootingDate: formatted }));
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await safeUpdate(newPhotos);
    setBatchDate("");
  };

  const addPhotoSlot = async () => {
    if (!project || !id) return;
    cancelPendingPhotoDebounces();
    const newPhotos: Photo[] = [...project.photos, { id: nextId(), image: null, photoNumber: String(project.photos.length + 1), shootingDate: "", locationMap: "", process: "", description: "", circles: [], dimensionLines: [], rotation: 0 }];
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await safeUpdate(newPhotos);
  };

  const duplicatePhotoSlot = async (index: number) => {
    if (!project || !id) return;
    if (index < 0 || index >= project.photos.length) return;
    cancelPendingPhotoDebounces();
    const source = project.photos[index];
    const newPhoto: Photo = {
      id: nextId(),
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
    await safeUpdate(renumbered);
  };

  const movePhoto = async (index: number, direction: 'up' | 'down') => {
    if (!project || !id) return;
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === project.photos.length - 1)) return;
    cancelPendingPhotoDebounces();
    const newPhotos = [...project.photos];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    [newPhotos[index], newPhotos[targetIdx]] = [newPhotos[targetIdx], newPhotos[index]];
    const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
    setProject((prev) => prev ? { ...prev, photos: renumbered } : null);
    await safeUpdate(renumbered);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !project || !id) return;
    const oldIndex = project.photos.findIndex(p => p.id === active.id);
    const newIndex = project.photos.findIndex(p => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    cancelPendingPhotoDebounces();
    const newPhotos = arrayMove(project.photos, oldIndex, newIndex);
    const renumbered = newPhotos.map((p, i) => ({ ...p, photoNumber: String(i + 1) }));
    setProject(prev => prev ? { ...prev, photos: renumbered } : null);
    await safeUpdate(renumbered);
  };

  const handleGridPhotoClick = (photoId: number) => {
    setViewMode('list');
    setTimeout(() => {
      document.getElementById(`photo-card-${photoId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const handleBulkUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!project || !id) return;
    const files = Array.from(e.target.files as FileList);
    if (files.length === 0) return;
    cancelPendingPhotoDebounces();
    setBulkUploading(true);
    setBulkTotal(files.length);
    setBulkProgress(0);
    const newPhotos = [...project.photos];
    let uploadedCount = 0;
    const todayStr = getTodayStr();
    // ループ内では state closure が古いままなので、累積をローカル変数で持つ。
    // これがないと、5枚×100MB のように同一バッチ内で上限を超過してアップロード成功してしまう。
    let virtualUsed = storageUsedBytes;

    for (let i = 0; i < files.length; i++) {
      let targetIndex = newPhotos.findIndex(p => !p.image);
      if (targetIndex === -1) {
        newPhotos.push({ id: nextId(), image: null, photoNumber: String(newPhotos.length + 1), shootingDate: "", locationMap: "", process: "", description: "", circles: [], dimensionLines: [], rotation: 0 });
        targetIndex = newPhotos.length - 1;
      }

      try {
        const compressedFile = await compressPhotoWithQuality(files[i]);
        if (!canUpload(virtualUsed, compressedFile.size)) {
          setUploadError('ストレージ容量が上限（500MB）に達しています。不要な写真を削除してください。');
          break;
        }
        const r = ref(storage, `photos/${id}/${nextId()}_bulk_${i}.jpg`);
        await uploadBytes(r, compressedFile);
        const url = await getDownloadURL(r);
        if (uid) {
          await trackUpload(uid, compressedFile.size);
        }
        virtualUsed += compressedFile.size;
        setStorageUsedBytes(virtualUsed);
        newPhotos[targetIndex] = { ...newPhotos[targetIndex], image: url, shootingDate: newPhotos[targetIndex].shootingDate || todayStr };
        setProject((prev) => prev ? { ...prev, photos: [...newPhotos] } : null);
      } catch (error) {
        logFirebaseError(error, `写真一括アップロード(${i + 1}枚目)`);
        setUploadError(`${i + 1}枚目：${firebaseErrorMessage(error, 'アップロード')}`);
      }

      uploadedCount++;
      setBulkProgress(uploadedCount);
    }
    if (newPhotos.some(p => p.image)) {
      await safeUpdate(newPhotos);
    }
    setBulkUploading(false);
  };

  const uploadPhoto = async (e: ChangeEvent<HTMLInputElement>, index: number) => {
    if (!project || !id) return;
    const f = e.target.files?.[0];
    if (!f) return;
    if (index < 0 || index >= project.photos.length) return;
    cancelPendingPhotoDebounces();
    const photoId = project.photos[index].id;
    setLoadingId(photoId);

    try {
      const compressedFile = await compressPhotoWithQuality(f);
      if (!canUpload(storageUsedBytes, compressedFile.size)) {
        setUploadError('ストレージ容量が上限（500MB）に達しています。不要な写真を削除してください。');
        return;
      }
      const r = ref(storage, `photos/${id}/${nextId()}.jpg`);
      await uploadBytes(r, compressedFile);
      const url = await getDownloadURL(r);
      if (uid) {
        await trackUpload(uid, compressedFile.size);
        setStorageUsedBytes((prev) => prev + compressedFile.size);
      }
      const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, image: url, shootingDate: p.shootingDate || getTodayStr() } : p);
      setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
      await safeUpdate(newPhotos);
    } catch (err) {
      logFirebaseError(err, '写真アップロード');
      setUploadError(firebaseErrorMessage(err, '写真のアップロード'));
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
      const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: [...(p.circles || []), { id: nextId(), x, y, size: 20 }] } : p);
      setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
      await safeUpdate(newPhotos);
    } else if (mode === 'dimension') {
      if (selectedDimensionLineId !== null) { setSelectedDimensionLineId(null); return; }
      if (!drawingStartPoint) {
        setDrawingStartPoint({ x, y });
      } else {
        const newLineId = nextId();
        const newPhotos = project.photos.map((p) => p.id === photoId ? {
          ...p,
          dimensionLines: [...(p.dimensionLines || []), { id: newLineId, start: drawingStartPoint, end: { x, y }, text: "", size: 2, color: activeColor }]
        } : p);
        setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
        await safeUpdate(newPhotos);
        setDrawingStartPoint(null);
        setSelectedDimensionLineId(newLineId);
      }
    }
  };

  const updateCircle = async (photoId: number, circleId: number, newProps: Partial<Circle>) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: (p.circles ?? []).map((c) => c.id === circleId ? { ...c, ...newProps } : c) } : p);
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await safeUpdate(newPhotos);
  };

  const removeCircle = async (photoId: number, circleId: number) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, circles: (p.circles ?? []).filter((c) => c.id !== circleId) } : p);
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await safeUpdate(newPhotos);
    setSelectedCircleId(null);
  };

  const updateDimensionLine = async (photoId: number, lineId: number, newProps: Partial<DimensionLine>) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, dimensionLines: p.dimensionLines?.map((c) => c.id === lineId ? { ...c, ...newProps } : c) } : p);
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await safeUpdate(newPhotos);
  };

  const removeDimensionLine = async (photoId: number, lineId: number) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) => p.id === photoId ? { ...p, dimensionLines: p.dimensionLines?.filter((c) => c.id !== lineId) } : p);
    setProject((prev) => prev ? { ...prev, photos: newPhotos } : null);
    await safeUpdate(newPhotos);
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
            <div className="flex items-center gap-3">
              {/* 自動保存ステータス */}
              {photoSaveState !== 'idle' && (
                <span
                  className="text-xs font-bold flex items-center gap-1 transition-all"
                  style={{ color: photoSaveState === 'saved' ? '#10b981' : '#6b7280' }}
                >
                  {photoSaveState === 'saving' ? (
                    <><span className="inline-block w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6b7280', borderTopColor: 'transparent' }} /> 保存中…</>
                  ) : (
                    <>✓ 保存済み</>
                  )}
                </span>
              )}
              <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: '#1c1c30', border: '1px solid #2e2e50' }}>
                <button
                  onClick={() => setViewMode('grid')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{ background: viewMode === 'grid' ? '#ff6b35' : 'transparent', color: viewMode === 'grid' ? '#fff' : '#6b7280' }}
                  title="グリッド表示"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{ background: viewMode === 'list' ? '#ff6b35' : 'transparent', color: viewMode === 'list' ? '#fff' : '#6b7280' }}
                  title="リスト表示"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
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
              {bulkUploading ? `アップロード中... ${bulkProgress} / ${bulkTotal}枚` : "複数写真を一括追加する"}
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleBulkUpload} disabled={bulkUploading} />
            </label>
            {bulkUploading && bulkTotal > 0 && (
              <div className="mt-3">
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#12122a' }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round((bulkProgress / bulkTotal) * 100)}%`,
                      background: '#ff6b35',
                    }}
                  />
                </div>
                <div className="text-right mt-1 text-xs font-bold" style={{ color: '#8b8ba8' }}>
                  {Math.round((bulkProgress / bulkTotal) * 100)}%
                </div>
              </div>
            )}
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
                onClick={() => setConfirmBatchDate(true)}
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
                    onClick={() => setConfirmDeleteSelectedPhotos(true)}
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

        {/* ── グリッドビュー ── */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2 mb-4">
            {project.photos.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => handleGridPhotoClick(photo.id)}
                className="relative rounded-xl overflow-hidden border transition-all active:scale-95"
                style={{ background: '#1c1c30', borderColor: '#2e2e50', aspectRatio: '4/3' }}
                onPointerEnter={e => (e.currentTarget.style.borderColor = '#ff6b35')}
                onPointerLeave={e => (e.currentTarget.style.borderColor = '#2e2e50')}
              >
                {photo.image ? (
                  <img
                    src={proxyUrl(photo.image, `grid_${photo.id}`)}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    style={{ transform: `rotate(${Number(photo.rotation || 0)}deg)` }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Camera className="w-8 h-8" style={{ color: '#2e2e50' }} />
                  </div>
                )}
                {/* 写真番号バッジ */}
                <div className="absolute top-1.5 left-1.5 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black" style={{ background: '#ff6b35', color: '#fff' }}>
                  {index + 1}
                </div>
                {/* 説明プレビュー */}
                {(photo.description || photo.process) && (
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 text-xs font-bold truncate text-left" style={{ background: 'rgba(15,15,26,0.82)', color: '#f0ede8' }}>
                    {photo.process || photo.description}
                  </div>
                )}
                {/* 赤丸がある場合のインジケーター */}
                {(photo.circles?.length ?? 0) > 0 && (
                  <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black" style={{ background: '#ef4444', color: '#fff' }}>
                    {photo.circles!.length}
                  </div>
                )}
              </button>
            ))}
            {/* 写真追加ボタン */}
            <button
              type="button"
              onClick={addPhotoSlot}
              className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors active:scale-95"
              style={{ borderColor: '#2e2e50', color: '#3d3d60', aspectRatio: '4/3' }}
              onPointerEnter={e => { (e.currentTarget.style.borderColor = '#ff6b35'); (e.currentTarget.style.color = '#ff6b35'); }}
              onPointerLeave={e => { (e.currentTarget.style.borderColor = '#2e2e50'); (e.currentTarget.style.color = '#3d3d60'); }}
            >
              <Plus className="w-7 h-7" />
              <span className="text-xs font-bold">追加</span>
            </button>
          </div>
        )}

        {/* ── 写真カードリスト ── */}
        <div className={`space-y-6 mt-2 ${viewMode === 'grid' ? 'hidden' : ''}`}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={project.photos.map(p => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {project.photos.map((photo, index: number) => {
                const isRotated90 = Number(photo.rotation || 0) % 180 !== 0;
                const isCircleMode = cardMode?.photoId === photo.id && cardMode.mode === 'circle';
                const isDimensionMode = cardMode?.photoId === photo.id && cardMode.mode === 'dimension';

                return (
                  <SortablePhotoCard key={photo.id} id={photo.id}>
                    {({ isDragging, dragHandleProps }) => (
                      <div
                        id={`photo-card-${photo.id}`}
                        className="rounded-2xl border relative"
                        style={{ background: '#1c1c30', borderColor: '#2e2e50', opacity: isDragging ? 0.5 : 1 }}
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
                    <div className="flex gap-2 items-center">
                      {/* グリップ: PC のみ表示（スマホでは非表示） */}
                      <button
                        {...dragHandleProps}
                        className="hidden sm:flex p-2 rounded-lg transition-colors cursor-grab active:cursor-grabbing touch-none items-center justify-center"
                        style={{ background: '#12122a', color: '#3d3d60', border: '1px solid #2e2e50' }}
                        onPointerEnter={e => (e.currentTarget.style.color = '#8b8ba8')}
                        onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}
                        title="ドラッグして並び替え"
                        tabIndex={-1}
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                      {/* ↑↓ボタン: スマホのみ表示（PC では非表示） */}
                      <button
                        onClick={() => movePhoto(index, 'up')}
                        className="flex sm:hidden p-2 rounded-lg transition-colors"
                        style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}
                        onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
                        onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
                        title="上へ"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => movePhoto(index, 'down')}
                        className="flex sm:hidden p-2 rounded-lg transition-colors"
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
                      onClick={() => setConfirmDeletePhotoId(photo.id)}
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
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => uploadPhoto(e, index)} />
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
                              loading="lazy"
                              decoding="async"
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
                              aria-label="テンプレートに保存"
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
                    )}
                  </SortablePhotoCard>
                );
              })}
            </SortableContext>
          </DndContext>
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
      {masterSaveSuccess && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#10b981', color: '#fff' }}>
          {masterSaveSuccess}
        </div>
      )}
      {uploadError && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#ef4444', color: '#fff' }}>
          {uploadError}
          <button onClick={() => setUploadError(null)} className="ml-2">×</button>
        </div>
      )}
      <ConfirmModal
        isOpen={confirmDeletePhotoId !== null}
        title="写真枠を削除"
        message="この写真枠を完全に削除しますか？"
        confirmLabel="削除"
        variant="danger"
        onConfirm={async () => {
          if (confirmDeletePhotoId !== null) {
            await deletePhotoSlot(confirmDeletePhotoId);
            setConfirmDeletePhotoId(null);
          }
        }}
        onCancel={() => setConfirmDeletePhotoId(null)}
      />
      <ConfirmModal
        isOpen={confirmDeleteSelectedPhotos}
        title="選択写真を削除"
        message={`選択した ${selectedPhotoIds.length} 件の写真枠を完全に削除しますか？`}
        confirmLabel="削除"
        variant="danger"
        onConfirm={async () => {
          setConfirmDeleteSelectedPhotos(false);
          await deleteSelectedPhotos();
        }}
        onCancel={() => setConfirmDeleteSelectedPhotos(false)}
      />
      <ConfirmModal
        isOpen={confirmBatchDate}
        title="撮影日を一括設定"
        message={`すべての写真の撮影日を ${batchDate.replace(/-/g, '/')} に統一しますか？`}
        confirmLabel="設定する"
        variant="default"
        onConfirm={async () => {
          setConfirmBatchDate(false);
          await applyBatchDate();
        }}
        onCancel={() => setConfirmBatchDate(false)}
      />
      <ConfirmModal
        isOpen={confirmOverwritePhotoMaster !== null}
        title="テンプレートを上書き"
        message={`「${confirmOverwritePhotoMaster?.name}」はすでに存在します。上書きしますか？`}
        confirmLabel="上書き"
        variant="default"
        onConfirm={async () => {
          if (confirmOverwritePhotoMaster) {
            const existing = photoMasters.find((m) => m.name === confirmOverwritePhotoMaster.name);
            await doSaveToPhotoMaster(confirmOverwritePhotoMaster.name, confirmOverwritePhotoMaster.photo, existing);
            setConfirmOverwritePhotoMaster(null);
          }
        }}
        onCancel={() => setConfirmOverwritePhotoMaster(null)}
      />
      {templateNameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-2xl p-6 w-80 space-y-4" style={{ background: '#1c1c30', border: '1px solid #2e2e50' }}>
            <h3 className="text-sm font-black" style={{ color: '#f0ede8' }}>テンプレート名を入力</h3>
            <input
              type="text"
              value={templateNameInput}
              onChange={(e) => setTemplateNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              placeholder="テンプレート名"
              autoFocus
              className="w-full p-3 rounded-xl text-sm font-bold outline-none"
              style={{ background: '#12122a', border: '1px solid #2e2e50', color: '#f0ede8' }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setTemplateNameTarget(null); setTemplateNameInput(''); }}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                style={{ background: '#2e2e50', color: '#8b8ba8' }}
              >
                キャンセル
              </button>
              <button
                onClick={async () => {
                  const name = templateNameInput.trim();
                  if (!name) return;
                  const photo = templateNameTarget;
                  setTemplateNameTarget(null);
                  setTemplateNameInput('');
                  const existing = photoMasters.find((m) => (m.name ?? '').trim() === name);
                  if (existing) {
                    setConfirmOverwritePhotoMaster({ name, photo });
                    return;
                  }
                  await doSaveToPhotoMaster(name, photo, undefined);
                }}
                disabled={!templateNameInput.trim()}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
                style={{ background: '#ff6b35', color: '#fff' }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
