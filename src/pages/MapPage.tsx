import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, MapPin, CaseUpper, FileText, LayoutGrid, Ruler, Paintbrush, Save, UploadCloud, RotateCcw, RotateCw, Eraser, Move } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import type { MapPin as MapPinT, MapRow, Project, DimensionLine, WhiteoutBox } from '../types';
import { proxyUrl } from '../shared/utils';
import { canUpload, trackUpload, deleteStorageFileWithAccounting, genId } from '../shared/storageUtils';
import { resolveMapAspect, isLegacyMapCoord, migrateMapToImageAspect } from '../shared/mapCoords';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';
import { ConfirmModal } from '../shared/ConfirmModal';

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DEFAULT_MAP_PART_NAMES = ['軒先', '袖', 'ケラバ', '谷', '棟', '隅棟', '平'];

type MapLayout = NonNullable<Project['mapLayouts']>[number];

const Btn = ({ onClick, children, className = '' }: { onClick: () => void; children: React.ReactNode; className?: string }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold text-base active:scale-90 transition-all select-none ${className}`}
  >{children}</button>
);

const COLOR_PALETTE = [
  { name: "Yellow", value: "#FFD700" },
  { name: "White", value: "#FFFFFF" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Red", value: "#ef4444" },
];

/** ピンラベルから一貫した色を返す（PDF出力と同じ6色パレット） */
const SYMBOL_COLORS = ['#16a34a', '#2563eb', '#92400e', '#7c3aed', '#db2777', '#065f46'];
function colorForSymbol(label: string): string {
  const s = (label ?? '').trim();
  if (!s) return SYMBOL_COLORS[0];
  return SYMBOL_COLORS[s.charCodeAt(0) % SYMBOL_COLORS.length];
}

const getLocalPointFromRect = (clientX: number, clientY: number, rect: DOMRect, angle: number) => {
  let localX = 0, localY = 0;
  let w = rect.width, h = rect.height;
  const normAngle = ((angle % 360) + 360) % 360;

  if (normAngle === 0) { localX = clientX - rect.left; localY = clientY - rect.top; }
  else if (normAngle === 90) { localX = clientY - rect.top; localY = rect.right - clientX; w = rect.height; h = rect.width; }
  else if (normAngle === 180) { localX = rect.right - clientX; localY = rect.bottom - clientY; }
  else if (normAngle === 270) { localX = rect.bottom - clientY; localY = clientX - rect.left; w = rect.height; h = rect.width; }

  return { x: Math.max(0, Math.min(100, (localX / w) * 100)), y: Math.max(0, Math.min(100, (localY / h) * 100)) };
};

const useRotatedDraggable = (initialX: number, initialY: number, rotation: number, onDragEnd: (x: number, y: number) => void) => {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0, clientX: 0, clientY: 0 });
  const pointerDownRef = useRef(false);
  const isMovedRef = useRef(false);

  useEffect(() => {
    if (dragging) return;
    const frame = requestAnimationFrame(() => setPosition({ x: initialX, y: initialY }));
    return () => cancelAnimationFrame(frame);
  }, [initialX, initialY, dragging]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerDownRef.current = true;
    isMovedRef.current = false;
    startPosRef.current = { x: position.x, y: position.y, clientX: e.clientX, clientY: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointerDownRef.current || !containerRef.current) return;
    
    const dx = e.clientX - startPosRef.current.clientX;
    const dy = e.clientY - startPosRef.current.clientY;

    if (!isMovedRef.current) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isMovedRef.current = true;
        setDragging(true);
      } else {
        return;
      }
    }

    const parent = containerRef.current.closest('.map-content-wrapper') as HTMLDivElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    
    const normAngle = ((rotation % 360) + 360) % 360;
    let localDx = 0, localDy = 0;
    let w = rect.width, h = rect.height;

    if (normAngle === 0) { localDx = dx; localDy = dy; }
    else if (normAngle === 90) { localDx = dy; localDy = -dx; w = rect.height; h = rect.width; }
    else if (normAngle === 180) { localDx = -dx; localDy = -dy; }
    else if (normAngle === 270) { localDx = -dy; localDy = dx; w = rect.height; h = rect.width; }

    const newX = startPosRef.current.x + (localDx / w) * 100;
    const newY = startPosRef.current.y + (localDy / h) * 100;
    setPosition({ x: Math.max(0, Math.min(100, newX)), y: Math.max(0, Math.min(100, newY)) });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointerDownRef.current) return;
    pointerDownRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (isMovedRef.current) {
      setDragging(false);
      onDragEnd(position.x, position.y);
    }
  };

  const handleClick = (e: React.MouseEvent | React.PointerEvent, onClickCallback: () => void) => {
    e.stopPropagation();
    if (!isMovedRef.current) {
      onClickCallback();
    }
  };

  return { position, dragging, onPointerDown, onPointerMove, onPointerUp, containerRef, handleClick };
};

// ★ 追加：自由にドラッグできるタイトルマーカー
const TitleMarker = React.memo(({ layout, mapRotation, currentScale, isSelected, onDragEnd, onClick, mapCount, mapIndex }: { layout: MapLayout; mapRotation: number; currentScale: number; isSelected: boolean; onDragEnd: (x: number, y: number) => void; onClick: () => void; mapCount: number; mapIndex: number }) => {
  const { position, onPointerDown, onPointerMove, onPointerUp, dragging, containerRef, handleClick } = useRotatedDraggable(layout.x ?? 15, layout.y ?? 10, mapRotation, onDragEnd);
  const visualScale = 1 / currentScale;

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => handleClick(e, onClick)}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: `translate(-50%, -50%) rotate(${layout.rotation || 0}deg) scale(${visualScale})`,
        touchAction: 'none',
        zIndex: isSelected ? 100 : (dragging ? 60 : 50),
        position: 'absolute',
        background: 'rgba(255,255,255,0.95)',
        padding: '6px 16px',
        borderRadius: '4px',
        fontWeight: 'bold',
        fontSize: '20px',
        color: '#111',
        border: '2px solid #333',
        cursor: 'move',
        whiteSpace: 'nowrap',
        boxShadow: dragging ? '0 10px 15px rgba(0,0,0,0.2)' : (isSelected ? '0 0 0 4px rgba(59, 130, 246, 0.5)' : '0 4px 6px rgba(0,0,0,0.1)')
      }}
      title="ドラッグで移動 / タップで編集"
    >
      {layout.title}{mapCount > 1 ? ` (${mapIndex + 1}/${mapCount})` : ''}
        </div>
  );
});

// ── WhiteoutMarker ────────────────────────────────────────────────────────
// 設計方針（再設計）:
//  ・マップ内には「白いボックス」だけ置く。ハンドル類は一切出さない。
//    → ズーム・回転・コンテナ端でUIが見切れる問題を根本解決
//  ・移動: ボックス全体をドラッグ（短いタップは選択）
//  ・リサイズ・削除: 画面下部の固定パネル（WhiteoutControlPanel）で行う
// ─────────────────────────────────────────────────────────────────────────
const WhiteoutMarker = React.memo(({ box, rotation, currentScale, isSelected, onDragEnd, onClick }: {
  box: WhiteoutBox; rotation: number; currentScale: number; isSelected: boolean;
  onDragEnd: (x: number, y: number) => void; onClick: () => void;
}) => {
  const moveRef = useRef<{ active: boolean; startClientX: number; startClientY: number; startX: number; startY: number; moved: boolean }>({ active: false, startClientX: 0, startClientY: 0, startX: 0, startY: 0, moved: false });
  const [livePos, setLivePos] = useState({ x: box.x, y: box.y });

  useEffect(() => {
    if (moveRef.current.active) return;
    const frame = requestAnimationFrame(() => setLivePos({ x: box.x, y: box.y }));
    return () => cancelAnimationFrame(frame);
  }, [box.x, box.y]);

  const getParentRect = (el: Element) => {
    const parent = el.closest('.map-content-wrapper') as HTMLDivElement;
    return parent ? parent.getBoundingClientRect() : null;
  };

  const toLocalDelta = (dx: number, dy: number, rect: DOMRect) => {
    const norm = ((rotation % 360) + 360) % 360;
    let ldx = dx, ldy = dy, w = rect.width, h = rect.height;
    if (norm === 90)  { ldx = dy;  ldy = -dx; w = rect.height; h = rect.width; }
    else if (norm === 180) { ldx = -dx; ldy = -dy; }
    else if (norm === 270) { ldx = -dy; ldy = dx;  w = rect.height; h = rect.width; }
    return { ldx: (ldx / w) * 100, ldy: (ldy / h) * 100 };
  };

  const onMoveDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    moveRef.current = { active: true, startClientX: e.clientX, startClientY: e.clientY, startX: box.x, startY: box.y, moved: false };
  };
  const onMoveMove = (e: React.PointerEvent) => {
    if (!moveRef.current.active) return;
    const rect = getParentRect(e.currentTarget);
    if (!rect) return;
    const { ldx, ldy } = toLocalDelta(e.clientX - moveRef.current.startClientX, e.clientY - moveRef.current.startClientY, rect);
    if (Math.abs(ldx) > 0.3 || Math.abs(ldy) > 0.3) moveRef.current.moved = true;
    setLivePos({ x: Math.max(0, Math.min(100, moveRef.current.startX + ldx)), y: Math.max(0, Math.min(100, moveRef.current.startY + ldy)) });
  };
  const onMoveUp = (e: React.PointerEvent) => {
    if (!moveRef.current.active) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    moveRef.current.active = false;
    if (moveRef.current.moved) {
      onDragEnd(livePos.x, livePos.y);
    } else {
      setLivePos({ x: box.x, y: box.y });
      onClick();
    }
  };

  const borderW = Math.max(1, 2 / currentScale);

  return (
    <div
      onPointerDown={onMoveDown}
      onPointerMove={onMoveMove}
      onPointerUp={onMoveUp}
      onPointerCancel={onMoveUp}
      style={{
        position: 'absolute',
        left: `${livePos.x}%`, top: `${livePos.y}%`,
        width: `${box.width}%`, height: `${box.height}%`,
        transform: 'translate(-50%,-50%)',
        touchAction: 'none',
        zIndex: 30,
        cursor: isSelected ? 'move' : 'pointer',
        boxSizing: 'border-box',
        // 選択中のみ内側に破線枠
        outline: isSelected ? `${borderW}px dashed #6b7280` : 'none',
        outlineOffset: `-${borderW}px`,
        // SVG背景で確実に白塗り（printColorAdjustに依存しない）
        background: 'none',
      }}
    >
      {/* SVG rect で白塗り — div の background はブラウザ印刷で消えることがある */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="none">
        <rect x="0" y="0" width="100%" height="100%" fill="white" />
      </svg>
        </div>
  );
});

// ── WhiteoutControlPanel ───────────────────────────────────────────────────
// 画面下部に固定表示。ズーム・回転の影響を受けず常に操作可能。
// ─────────────────────────────────────────────────────────────────────────
const WhiteoutControlPanel = React.memo(({ box, onUpdate, onRemove, onDeselect }: {
  box: WhiteoutBox;
  onUpdate: (updates: Partial<WhiteoutBox>) => void;
  onRemove: () => void;
  onDeselect: () => void;
}) => {
  const nudge = (dx: number, dy: number) => onUpdate({
    x: Math.max(0, Math.min(100, box.x + dx)),
    y: Math.max(0, Math.min(100, box.y + dy)),
  });
  const resize = (dw: number, dh: number) => onUpdate({
    width: Math.max(1, box.width + dw),
    height: Math.max(1, box.height + dh),
  });

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[300] bg-gray-900/95 backdrop-blur text-white shadow-2xl border-t border-gray-700">
      <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
        <span className="text-[11px] font-bold text-yellow-400 whitespace-nowrap">✏️ 文字消し編集</span>

        {/* 移動 */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400 mr-0.5">移動</span>
          <Btn onClick={() => nudge(0, -1)} className="bg-gray-700 hover:bg-gray-600 text-lg">↑</Btn>
          <Btn onClick={() => nudge(0, 1)}  className="bg-gray-700 hover:bg-gray-600 text-lg">↓</Btn>
          <Btn onClick={() => nudge(-1, 0)} className="bg-gray-700 hover:bg-gray-600 text-lg">←</Btn>
          <Btn onClick={() => nudge(1, 0)}  className="bg-gray-700 hover:bg-gray-600 text-lg">→</Btn>
    </div>

        {/* 幅 */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400 mr-0.5">幅</span>
          <Btn onClick={() => resize(-2, 0)} className="bg-gray-700 hover:bg-gray-600">－</Btn>
          <span className="text-xs font-bold w-9 text-center tabular-nums">{Math.round(box.width)}%</span>
          <Btn onClick={() => resize(2, 0)}  className="bg-gray-700 hover:bg-gray-600">＋</Btn>
        </div>

        {/* 高さ */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400 mr-0.5">高さ</span>
          <Btn onClick={() => resize(0, -2)} className="bg-gray-700 hover:bg-gray-600">－</Btn>
          <span className="text-xs font-bold w-9 text-center tabular-nums">{Math.round(box.height)}%</span>
          <Btn onClick={() => resize(0, 2)}  className="bg-gray-700 hover:bg-gray-600">＋</Btn>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button type="button" onClick={onRemove}   className="px-3 py-1.5 bg-red-600 hover:bg-red-500 active:scale-95 rounded-lg font-bold text-sm transition-all">削除</button>
          <button type="button" onClick={onDeselect} className="px-3 py-1.5 active:scale-95 rounded-lg font-bold text-sm transition-all" style={{ background: '#ff6b35', color: '#fff' }}>完了</button>
        </div>
      </div>
    </div>
  );
});

const DimensionLineMarker = React.memo(({ line, rotation, currentScale, isSelected, onSelect, onRemove, onTextChange, onUpdate, onDeselect }: { line: DimensionLine; rotation: number; currentScale: number; isSelected: boolean; onSelect: () => void; onRemove: () => void; onTextChange: (text: string) => void; onUpdate: (props: Partial<DimensionLine>) => void; onDeselect: () => void; }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localStart, setLocalStart] = useState(line.start);
  const [localEnd, setLocalEnd] = useState(line.end);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);
  const dragStartPos = useRef({ clientX: 0, clientY: 0, started: false });

  useEffect(() => {
    if (isDragging) return;
    const frame = requestAnimationFrame(() => {
      setLocalStart(line.start);
      setLocalEnd(line.end);
    });
    return () => cancelAnimationFrame(frame);
  }, [line.start, line.end, isDragging]);

  useEffect(() => {
    if (isSelected && inputRef.current && !isDragging && !line.text) inputRef.current.focus();
  }, [isSelected, isDragging, line.text]);

  const startDrag = (e: React.PointerEvent, type: 'start' | 'end') => {
    e.stopPropagation(); 
    (e.currentTarget as Element).setPointerCapture(e.pointerId); 
    dragStartPos.current = { clientX: e.clientX, clientY: e.clientY, started: false };
    setIsDragging(type);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    
    const dx = e.clientX - dragStartPos.current.clientX;
    const dy = e.clientY - dragStartPos.current.clientY;
    
    if (!dragStartPos.current.started) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        dragStartPos.current.started = true;
      } else {
        return;
      }
    }

    const parent = (e.currentTarget as Element).closest('.map-content-wrapper') as HTMLElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const point = getLocalPointFromRect(e.clientX, e.clientY, rect, rotation);
    if (isDragging === 'start') setLocalStart(point);
    else setLocalEnd(point);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    if (dragStartPos.current.started) {
      onUpdate({ start: localStart, end: localEnd }); 
    } else {
      setLocalStart(line.start);
      setLocalEnd(line.end);
    }
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
  const safePopupX = Math.max(10, Math.min(90, midPoint.x));
  const isUpperHalf = midPoint.y < 50;
  const popupMarginTop = isUpperHalf ? (80 / currentScale) : (-80 / currentScale);
  
  const color = line.color || "#FFFFFF"; 
  const thickness = Number(line.size || 2); 
  const handleRadius = Math.max(12, 12 / currentScale);

  return (
    <>
      <svg className="absolute inset-0 z-20 pointer-events-none w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <marker id={`cad-tick-map-${line.id}`} markerWidth="16" markerHeight="16" refX="8" refY="8" orient="auto" markerUnits="userSpaceOnUse">
            <line x1="0" y1="8" x2="16" y2="8" stroke={color} strokeWidth={thickness} />
            <line x1="4" y1="12" x2="12" y2="4" stroke={color} strokeWidth={thickness * 1.5} />
          </marker>
        </defs>
        <line
          x1={`${localStart.x}%`} y1={`${localStart.y}%`}
          x2={`${localEnd.x}%`} y2={`${localEnd.y}%`}
          stroke={color} strokeWidth={thickness} fill="none"
          markerStart={`url(#cad-tick-map-${line.id})`}
          markerEnd={`url(#cad-tick-map-${line.id})`}
          className="pointer-events-auto cursor-pointer"
          onPointerDown={(e) => { e.stopPropagation(); onSelect(); }}
        />
      </svg>
      
      {isSelected && !isDragging && (
        <div
          style={{ left: `${safePopupX}%`, top: `${midPoint.y}%`, marginTop: `${popupMarginTop}px`, transform: `translate(-50%, -50%) rotate(${-rotation}deg) scale(${1 / currentScale})`, background: '#1c1c30', borderColor: '#2e2e50' }}
          className="absolute z-30 flex flex-col items-center gap-3 p-4 rounded-2xl shadow-2xl border min-w-[280px]"
          onPointerDown={e => e.stopPropagation()}
        >
          <div className="flex w-full gap-2 items-center justify-between border-b pb-2" style={{ borderColor: '#2e2e50' }}>
             <h4 className="text-sm font-black flex items-center gap-1" style={{ color: '#f0ede8' }}><CaseUpper className="w-4 h-4" style={{ color: '#ff6b35' }}/> 文字と線</h4>
             <div className="flex items-center gap-1">
               <button onClick={(e) => { e.stopPropagation(); onUpdate({ size: Math.max(1, thickness - 1) }); }} className="w-7 h-7 flex items-center justify-center rounded font-bold transition-colors" style={{ background: '#2e2e50', color: '#f0ede8' }}>ー</button>
               <span className="text-xs font-bold mx-1" style={{ color: '#8b8ba8' }}>{thickness}</span>
               <button onClick={(e) => { e.stopPropagation(); onUpdate({ size: Math.min(10, thickness + 1) }); }} className="w-7 h-7 flex items-center justify-center rounded font-bold transition-colors mr-1" style={{ background: '#2e2e50', color: '#f0ede8' }}>＋</button>
               <div className="w-px h-5 mx-1" style={{ background: '#2e2e50' }}></div>
               <button onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label="削除" className="p-1.5 rounded-lg transition-colors" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}><Trash2 className="w-4 h-4" /></button>
        </div>
        </div>
          <div className="flex flex-wrap gap-1.5 w-full">
            {DEFAULT_MAP_PART_NAMES.map(name => (
              <button key={name} onClick={() => addPartName(name)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors" style={{ color: '#ff6b35', background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.25)' }}>＋{name}</button>
            ))}
          </div>
          <div className="flex gap-2 w-full">
            <input ref={inputRef} type="text" value={line.text} onChange={(e) => onTextChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onDeselect(); } }} className="flex-1 p-2.5 text-sm font-bold rounded-xl outline-none text-center" style={{ background: '#12122a', border: '1px solid #3d3d60', color: '#f0ede8' }} placeholder="例: 軒先 5.5m" />
            <button type="button" onClick={(e) => { e.stopPropagation(); onDeselect(); }} className="px-3 py-2 font-black rounded-xl shadow transition-all whitespace-nowrap" style={{ background: '#ff6b35', color: '#fff' }}>✓ 完了</button>
        </div>
            </div>
      )}

      {isSelected && (
        <>
          <div
            className="absolute z-40 rounded-full cursor-move touch-none"
            style={{ left: `${localStart.x}%`, top: `${localStart.y}%`, width: `${handleRadius * 2}px`, height: `${handleRadius * 2}px`, marginLeft: `-${handleRadius}px`, marginTop: `-${handleRadius}px`, background: 'rgba(255,107,53,0.25)', border: '2px solid #ff6b35' }}
            onPointerDown={(e) => startDrag(e, 'start')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          <div
            className="absolute z-40 rounded-full cursor-move touch-none"
            style={{ left: `${localEnd.x}%`, top: `${localEnd.y}%`, width: `${handleRadius * 2}px`, height: `${handleRadius * 2}px`, marginLeft: `-${handleRadius}px`, marginTop: `-${handleRadius}px`, background: 'rgba(255,107,53,0.25)', border: '2px solid #ff6b35' }}
            onPointerDown={(e) => startDrag(e, 'end')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </>
      )}
      
      {line.text && (
        <div
          style={{
            left: `${midPoint.x}%`,
            top: `${midPoint.y}%`,
            color: color,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(2px)',
            fontSize: `${14 + (thickness - 2) * 4}px`,
            transform: `translate(-50%, -50%) rotate(${line.textRotation ?? 0}deg) scale(${1 / currentScale})`
          }}
          className={`absolute font-bold px-2 py-0.5 rounded pointer-events-none whitespace-nowrap border border-white/20 shadow-sm ${isSelected ? 'z-40' : 'z-20'}`}
        >
          {line.text}
          </div>
        )}
    </>
  );
});

const MapMarker = React.memo(({ pin, rotation, currentScale, isSelected, onDragEnd, onClick }: { pin: MapPinT; rotation: number; currentScale: number; isSelected: boolean; onDragEnd: (x: number, y: number) => void; onClick: () => void; }) => {
  const { position, onPointerDown, onPointerMove, onPointerUp, dragging, containerRef, handleClick } = useRotatedDraggable(pin.x, pin.y, rotation, onDragEnd);
  const visualScale = (pin.size || 1) / currentScale; 

  return (
    <>
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => handleClick(e, onClick)}
        style={{ left: `${position.x}%`, top: `${position.y}%`, transform: `translate(-50%, -50%) scale(${visualScale})`, touchAction: 'none', zIndex: isSelected ? 100 : (dragging ? 30 : 10) }}
        className={`absolute flex items-center justify-center cursor-pointer transition-all duration-75 ${dragging ? 'opacity-80' : ''} ${isSelected && !dragging ? 'ring-4 ring-red-500 ring-offset-2 ring-offset-white/50 rounded-full' : ''}`}
      >
        <div style={{ transform: `rotate(${pin.textRotation ?? 0}deg)` }}>
          {pin.type === 'arrow' ? (
            <div className="flex items-center gap-1 drop-shadow-md bg-white/70 px-2 py-0.5 rounded-lg border" style={{ borderColor: colorForSymbol(pin.label) + '80' }}><span className="font-black text-2xl leading-none" style={{ color: colorForSymbol(pin.label), transform: `rotate(${pin.rotation || 0}deg)` }}>➡</span><span className="font-bold text-xl" style={{ color: colorForSymbol(pin.label) }}>{pin.label}</span></div>
          ) : (
            <div className="relative flex items-center justify-center"><div className="w-14 h-14 rounded-full border-[4px] shadow-sm" style={{ borderColor: colorForSymbol(pin.label), backgroundColor: colorForSymbol(pin.label) + '1a' }}></div><span className="absolute font-black text-xl drop-shadow-md bg-white/50 px-1 rounded" style={{ color: colorForSymbol(pin.label) }}>{pin.label}</span></div>
          )}
        </div>
      </div>
    </>
  );
});

const LegendRow = React.memo(({ row, isSelected, onSelect, onChange, onRemove }: { row: MapRow; isSelected: boolean; onSelect: () => void; onChange: (updates: Partial<MapRow>) => void; onRemove: () => void; }) => {
  return (
    <div
      onPointerDown={onSelect}
      className="grid grid-cols-12 text-sm border-b last:border-b-0 cursor-pointer transition-colors"
      style={{ borderColor: '#2e2e50', background: isSelected ? 'rgba(59,130,246,0.08)' : 'transparent' }}
      onPointerEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}
      onPointerLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <input type="text" value={row.symbol} onChange={(e) => onChange({ symbol: e.target.value })} className="col-span-2 py-2.5 text-xs sm:text-sm text-center font-black bg-transparent outline-none border-r" style={{ color: colorForSymbol(row.symbol), borderColor: '#2e2e50' }} />
      <input type="text" value={row.part} placeholder="軒先" onChange={(e) => onChange({ part: e.target.value })} className="col-span-4 py-2.5 px-2 text-xs sm:text-sm font-bold bg-transparent outline-none border-r" style={{ color: '#f0ede8', borderColor: '#2e2e50' }} />
      <input type="text" value={row.remarks} placeholder="..." onChange={(e) => onChange({ remarks: e.target.value })} className="col-span-5 py-2.5 px-2 text-xs sm:text-sm font-bold bg-transparent outline-none border-r" style={{ color: '#f0ede8', borderColor: '#2e2e50' }} />
      <div className="col-span-1 flex items-center justify-center">
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label="削除" className="p-1.5 rounded-lg transition-colors" style={{ color: '#3d3d60' }} onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')} onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}><Trash2 className="w-4 h-4"/></button>
    </div>
    </div>
  );
});

export default function MapPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sessionId] = useState(() => Date.now().toString());

  const [project, setProject] = useState<Project | null>(null);
  const [mapPins, setMapPins] = useState<MapPinT[]>([]);
  const [mapRows, setMapRows] = useState<MapRow[]>([]);
  const [mapDimensionLines, setMapDimensionLines] = useState<DimensionLine[]>([]);
  const [mapRotations, setMapRotations] = useState<number[]>([]);
  const [whiteoutBoxes, setWhiteoutBoxes] = useState<WhiteoutBox[]>([]);
  const [mapTransforms, setMapTransforms] = useState<{ scale: number; x: number; y: number }[]>([]);
  
  const [mapLayouts, setMapLayouts] = useState<{ title: string; x?: number; y?: number; rotation?: number }[]>([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingTitleSnapshot, setEditingTitleSnapshot] = useState<string>('');
  const [selectedPinId, setSelectedPinId] = useState<number | null>(null);
  const [editingPinLabel, setEditingPinLabel] = useState<string>('');
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [selectedDimensionLineId, setSelectedDimensionLineId] = useState<number | null>(null);
  const [selectedWhiteoutId, setSelectedWhiteoutId] = useState<number | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [confirmDeleteMapIndex, setConfirmDeleteMapIndex] = useState<number | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [currentMapIndex, setCurrentMapIndex] = useState(0);

  const [uid, setUid] = useState<string | null>(null);
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [editingMode, setEditingMode] = useState<'pin' | 'dimension' | 'whiteout' | 'pan'>('pin');
  const [showAdvancedModes, setShowAdvancedModes] = useState(false);
  const [drawingStartPoint, setDrawingStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeColor, setActiveColor] = useState<string>(COLOR_PALETTE[0].value); 
  const showLegendTable = true; // フルブリードモード廃止済み。常に凡例表示

  const [whiteoutStart, setWhiteoutStart] = useState<{ x: number; y: number } | null>(null);
  const [whiteoutCurrent, setWhiteoutCurrent] = useState<{ x: number; y: number } | null>(null);
  const isDraggingWhiteout = whiteoutStart !== null;

  const [pendingActionInfo, setPendingActionInfo] = useState<{ clientX: number, clientY: number, localX: number, localY: number, time: number } | null>(null);
  const startDragPan = useRef({ x: 0, y: 0, startX: 0, startY: 0, isDragging: false });
  const zoomSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    setError(null);
    const abortController = new AbortController();
    const fetchData = async () => {
      try {
        const d = await getDoc(doc(db, 'projects', id));
        if (abortController.signal.aborted) return;
        if (d.exists()) {
          const data = d.data() as Project;
          setProject(data);
          setMapPins(data.mapPins || []);
          setMapRows(data.mapRows || []);
          setMapDimensionLines(data.mapDimensionLines || []);
          setMapRotations(data.mapRotations || []);
          setWhiteoutBoxes(data.whiteoutBoxes || []);
          setMapTransforms(data.mapTransforms || []);
          setMapLayouts(data.mapLayouts || []);
        } else { setError('プロジェクトが見つかりません。既に削除されている可能性があります。'); }
      } catch (err) {
        logFirebaseError(err, '位置図読込');
        if (!abortController.signal.aborted) setError(firebaseErrorMessage(err, 'データの読み込み'));
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    };
    fetchData();
    const user = auth.currentUser;
    if (user) {
      setUid(user.uid);
      getDoc(doc(db, 'users', user.uid)).then((s) => {
        if (abortController.signal.aborted || !s.exists()) return;
        const data = s.data();
        if (typeof data.storageUsedBytes === 'number') setStorageUsedBytes(data.storageUsedBytes);
      });
    }
    return () => { abortController.abort(); };
  }, [id]);

  // エラーメッセージの自動消去（他ページと統一）
  useEffect(() => {
    if (!saveError) return;
    const t = window.setTimeout(() => setSaveError(null), 8000);
    return () => clearTimeout(t);
  }, [saveError]);

  // Firestore は undefined / スパース配列を直列化できないため、ホールをデフォルト値で埋める
  const cleanTransforms = (arr: { scale: number; x: number; y: number }[]) =>
    Array.from({ length: arr.length }, (_, i) => arr[i] ?? { scale: 1, x: 0, y: 0 });
  const cleanLayouts = (arr: { title: string; x?: number; y?: number; rotation?: number }[]) =>
    Array.from({ length: arr.length }, (_, i) => arr[i] ?? { title: '位置図', x: 15, y: 10, rotation: 0 });
  const cleanRotations = (arr: number[]) =>
    Array.from({ length: arr.length }, (_, i) => arr[i] ?? 0);

  const saveProjectMapData = useCallback(async (newPins: MapPinT[], newRows: MapRow[], newDimLines: DimensionLine[], newWhiteouts: WhiteoutBox[], newTableShow: boolean, newTransforms: { scale: number; x: number; y: number }[], newLayouts: { title: string; x?: number; y?: number; rotation?: number }[], newRotations?: number[]) => {
    if (!id) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'projects', id), {
        mapPins: newPins,
        mapRows: newRows,
        mapDimensionLines: newDimLines,
        whiteoutBoxes: newWhiteouts,
        showLegendTable: newTableShow,
        mapTransforms: cleanTransforms(newTransforms),
        mapLayouts: cleanLayouts(newLayouts),
        ...(newRotations !== undefined ? { mapRotations: cleanRotations(newRotations) } : {}),
      });
    } catch (err) {
      logFirebaseError(err, '位置図保存');
      setSaveError(firebaseErrorMessage(err, '保存'));
    } finally { setIsSaving(false); }
  }, [id]);

  const debouncedSaveFromZoom = useCallback(() => {
    if (zoomSaveTimerRef.current) clearTimeout(zoomSaveTimerRef.current);
    zoomSaveTimerRef.current = setTimeout(() => {
      saveProjectMapData(mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts);
    }, 200);
  }, [mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts, saveProjectMapData]);

  useEffect(() => {
    return () => {
      if (zoomSaveTimerRef.current) clearTimeout(zoomSaveTimerRef.current);
    };
  }, []);

  /**
   * 旧形式 (194:120 コンテナ基準) の地図を新形式 (画像アスペクト基準) に移行する。
   *
   * 画像 onLoad のタイミングで、その地図がまだ旧形式 (mapImageAspects に未記録)
   * なら呼ばれる。
   *   1. 全座標 (ピン・寸法線・マップライン・白塗り) を変換
   *   2. mapImageAspects[mapIndex] に自然アスペクトを記録
   *   3. Firestore に書き戻し
   *   4. ローカル state も同期して、変換後の座標で再描画
   *
   * 多重発火防止のため migratedIndicesRef で 1度だけ実行を保証する。
   */
  const migratedIndicesRef = useRef<Set<number>>(new Set());

  // C2: プロジェクト切り替え時にマイグレーション済みキャッシュをリセット
  useEffect(() => {
    migratedIndicesRef.current = new Set();
  }, [id]);

  const migrateLegacyMap = useCallback(async (mapIndex: number, naturalAspect: number) => {
    if (!id || !project) return;
    if (migratedIndicesRef.current.has(mapIndex)) return; // 多重発火防止 (同セッション)
    // 既に新形式なら何もしない
    if (!isLegacyMapCoord(project.mapImageAspects, mapIndex)) return;

    migratedIndicesRef.current.add(mapIndex);

    // 現在の state ベースで変換する (Firestore の最新 project ではなく、
    // 編集中の最新を含む state を変換対象にする)
    const result = migrateMapToImageAspect(
      {
        mapPins,
        mapDimensionLines,
        mapLines: project.mapLines,
        whiteoutBoxes,
        mapImageAspects: project.mapImageAspects,
      },
      mapIndex,
      naturalAspect,
    );

    // ローカル state を更新 (画面の再描画で新座標系に切り替わる)
    setMapPins(result.mapPins);
    setMapDimensionLines(result.mapDimensionLines);
    setWhiteoutBoxes(result.whiteoutBoxes);
    setProject(prev => prev ? {
      ...prev,
      mapPins: result.mapPins,
      mapDimensionLines: result.mapDimensionLines,
      mapLines: result.mapLines,
      whiteoutBoxes: result.whiteoutBoxes,
      mapImageAspects: result.mapImageAspects,
    } : prev);

    // Firestore に書き戻し
    try {
      setIsSaving(true);
      await updateDoc(doc(db, 'projects', id), {
        mapPins: result.mapPins,
        mapDimensionLines: result.mapDimensionLines,
        mapLines: result.mapLines,
        whiteoutBoxes: result.whiteoutBoxes,
        mapImageAspects: result.mapImageAspects,
      });
      if (import.meta.env.DEV) {
        console.info(`[mapMigrate] mapIndex=${mapIndex} migrated to natural aspect ${naturalAspect.toFixed(3)}`);
      }
    } catch (err) {
      logFirebaseError(err, '位置図座標系移行');
      // 失敗してもセッション内では再試行しない (再ロードで再挑戦)
      migratedIndicesRef.current.delete(mapIndex);
    } finally {
      setIsSaving(false);
    }
  }, [id, project, mapPins, mapDimensionLines, whiteoutBoxes]);

  const updateMapLayout = (updates: Partial<{ title: string; x?: number; y?: number; rotation?: number }>) => {
    const newLayouts = [...mapLayouts];
    const current = newLayouts[currentMapIndex] || { title: '位置図', x: 15, y: 10, rotation: 0 };
    newLayouts[currentMapIndex] = { ...current, ...updates };
    setMapLayouts(newLayouts);
    saveProjectMapData(mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, newLayouts);
  };

  const updateTransform = (index: number, updates: Partial<{ scale: number; x: number; y: number }>) => {
    setMapTransforms(prev => {
      const newTransforms = [...prev];
      const current = newTransforms[index] || { scale: 1, x: 0, y: 0 };
      newTransforms[index] = { ...current, ...updates };
      return newTransforms;
    });
  };

  const uploadMapImage = async (e: React.ChangeEvent<HTMLInputElement>, mode: 'add' | 'replace') => {
    if (!project || !id || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    e.target.value = '';
    setIsSaving(true);

    try {
      const imageFiles: File[] = [];

      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        setUploadProgress('PDFを読み込み中...');
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          setUploadProgress(`PDFを変換中... (${pageNum}/${numPages}ページ)`);
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas context not found');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          const renderContext = { canvasContext: ctx, viewport, canvas };
          await page.render(renderContext).promise;
          
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
          if (!blob) throw new Error('Blob変換失敗');
          canvas.width = 0; canvas.height = 0;
          const baseName = file.name.replace(/\.pdf$/i, '');
          imageFiles.push(new File([blob], `${baseName}_p${pageNum}.jpg`, { type: 'image/jpeg' }));
        }
      } else {
        imageFiles.push(file);
      }

      const newMapUrls = [...(project.mapUrls || [])];
      const newMapLayouts = [...mapLayouts];
      const insertAt = mode === 'replace' ? currentMapIndex : newMapUrls.length;
      // ループ内で state が古いままにならないよう累積をローカルに持つ
      let virtualUsed = storageUsedBytes;

      for (let i = 0; i < imageFiles.length; i++) {
        setUploadProgress(`アップロード中... (${i + 1}/${imageFiles.length})`);
        const f = imageFiles[i];
        if (!canUpload(virtualUsed, f.size)) {
          setError('ストレージ容量が上限（500MB）に達しています。不要な図面を削除してください。');
          break;
        }
        const storageRef = ref(storage, `maps/${id}/${genId()}_${f.name}`);
        await uploadBytes(storageRef, f);
        const url = await getDownloadURL(storageRef);
        if (uid) {
          await trackUpload(uid, f.size);
        }
        virtualUsed += f.size;
        setStorageUsedBytes(virtualUsed);
        if (mode === 'replace' && i === 0) {
          newMapUrls[insertAt] = url;
        } else {
          newMapUrls.splice(insertAt + i, 0, url);
          newMapLayouts.splice(insertAt + i, 0, { title: '位置図', x: 15, y: 10, rotation: 0 });
        }
      }

      setProject(prev => prev ? { ...prev, mapUrls: newMapUrls } : null);
      setMapLayouts(newMapLayouts);
      await updateDoc(doc(db, 'projects', id), { mapUrls: newMapUrls, mapLayouts: newMapLayouts });
      setCurrentMapIndex(insertAt);
      setEditingMode('pan');
    } catch (err) {
      logFirebaseError(err, '図面アップロード');
      setError(firebaseErrorMessage(err, '図面のアップロード'));
    } finally {
      setIsSaving(false);
      setUploadProgress('');
    }
  };

  const rotateCurrentMap = useCallback(async (delta: number) => {
    if (!id) return;
    const newRotations = [...mapRotations];
    newRotations[currentMapIndex] = ((newRotations[currentMapIndex] ?? 0) + delta + 360) % 360;
    const safe = cleanRotations(newRotations);
    setMapRotations(safe);
    // mapRotations を他のマップデータと一緒に保存して確実に反映させる
    await saveProjectMapData(mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts, safe);
  }, [id, mapRotations, currentMapIndex, mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts, saveProjectMapData]);

  const deleteMapPhoto = useCallback(async (mapIndex: number) => {
    if (!project || !id) return;

    const urlToDelete = project.mapUrls?.[mapIndex];
    if (urlToDelete) {
      const bytes = await deleteStorageFileWithAccounting(urlToDelete, uid ?? undefined);
      if (bytes > 0) setStorageUsedBytes((prev) => Math.max(0, prev - bytes));
    }

    const newMapUrls = (project.mapUrls || []).filter((_, i) => i !== mapIndex);
    const newRotations = mapRotations.filter((_, i) => i !== mapIndex);
    const newTransforms = mapTransforms.filter((_, i) => i !== mapIndex);
    const newMapLayouts = mapLayouts.filter((_, i) => i !== mapIndex);
    const reindex = (idx: number) => idx > mapIndex ? idx - 1 : idx;
    const newPins = mapPins.filter(p => (p.mapIndex || 0) !== mapIndex).map(p => ({ ...p, mapIndex: reindex(p.mapIndex || 0) }));
    const newRows = mapRows.filter(r => (r.mapIndex || 0) !== mapIndex).map(r => ({ ...r, mapIndex: reindex(r.mapIndex || 0) }));
    const newDimLines = mapDimensionLines.filter(l => (l.mapIndex || 0) !== mapIndex).map(l => ({ ...l, mapIndex: reindex(l.mapIndex || 0) }));
    const newWhiteouts = whiteoutBoxes.filter(b => (b.mapIndex || 0) !== mapIndex).map(b => ({ ...b, mapIndex: reindex(b.mapIndex || 0) }));

    setMapPins(newPins);
    setMapRows(newRows);
    setMapDimensionLines(newDimLines);
    setMapRotations(newRotations);
    setWhiteoutBoxes(newWhiteouts);
    setMapTransforms(newTransforms);
    setMapLayouts(newMapLayouts);
    setProject({ ...project, mapUrls: newMapUrls });

    const nextIndex = currentMapIndex >= newMapUrls.length ? Math.max(0, newMapUrls.length - 1) : currentMapIndex;
    setCurrentMapIndex(nextIndex);

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'projects', id), { mapUrls: newMapUrls, mapRotations: newRotations, mapTransforms: newTransforms, mapLayouts: newMapLayouts, mapPins: newPins, mapRows: newRows, mapDimensionLines: newDimLines, whiteoutBoxes: newWhiteouts });
    } catch (err) {
      logFirebaseError(err, '位置図削除');
      setError(firebaseErrorMessage(err, '位置図の削除'));
    } finally { setIsSaving(false); }
  }, [project, id, uid, mapPins, mapRows, mapDimensionLines, whiteoutBoxes, mapRotations, mapTransforms, mapLayouts, currentMapIndex]);

  const handlePanPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (editingMode !== 'pan') return;
    const current = mapTransforms[currentMapIndex] || { scale: 1, x: 0, y: 0 };
    startDragPan.current = { x: current.x, y: current.y, startX: e.clientX, startY: e.clientY, isDragging: true };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePanPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startDragPan.current.isDragging || editingMode !== 'pan') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - startDragPan.current.startX) / rect.width) * 100;
    const dy = ((e.clientY - startDragPan.current.startY) / rect.height) * 100;
    updateTransform(currentMapIndex, { x: startDragPan.current.x + dx, y: startDragPan.current.y + dy });
  };

  const handlePanPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startDragPan.current.isDragging || editingMode !== 'pan') return;
    startDragPan.current.isDragging = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    saveProjectMapData(mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts);
  };

  const handleMapPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (selectedPinId !== null) setSelectedPinId(null);
    if (selectedRowId !== null) setSelectedRowId(null);
    if (selectedDimensionLineId !== null) setSelectedDimensionLineId(null);

    const rotation = mapRotations[currentMapIndex] || 0;

    if (editingMode === 'pan') return;

    // whiteout モード: 選択済みの場合は空白タップで選択解除するだけ（新ドラッグは開始しない）
    if (editingMode === 'whiteout' && selectedWhiteoutId !== null) {
      setSelectedWhiteoutId(null);
      return;
    }
    if (selectedWhiteoutId !== null) setSelectedWhiteoutId(null);

    const parent = e.currentTarget.closest('.map-content-wrapper') as HTMLDivElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const point = getLocalPointFromRect(e.clientX, e.clientY, rect, rotation);

    if (editingMode === 'whiteout') {
      e.currentTarget.setPointerCapture(e.pointerId);
      setWhiteoutStart({ x: point.x, y: point.y });
      setWhiteoutCurrent({ x: point.x, y: point.y });
      return;
    }

    setPendingActionInfo({ clientX: e.clientX, clientY: e.clientY, localX: point.x, localY: point.y, time: Date.now() });
  }, [editingMode, selectedPinId, selectedRowId, selectedDimensionLineId, selectedWhiteoutId, mapRotations, currentMapIndex]);

  const handleMapPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (editingMode === 'whiteout' && whiteoutStart) {
      const rotation = mapRotations[currentMapIndex] || 0;
      const parent = e.currentTarget.closest('.map-content-wrapper') as HTMLDivElement;
      if (!parent) return;
      const point = getLocalPointFromRect(e.clientX, e.clientY, parent.getBoundingClientRect(), rotation);
      setWhiteoutCurrent(point);
    }
  }, [editingMode, whiteoutStart, mapRotations, currentMapIndex]);

  const handleMapPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (editingMode === 'pan') return;

    if (editingMode === 'whiteout' && whiteoutStart && whiteoutCurrent) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      const width = Math.abs(whiteoutStart.x - whiteoutCurrent.x);
      const height = Math.abs(whiteoutStart.y - whiteoutCurrent.y);

      // 最小 1% × 1% 以上ドラッグしたときのみ作成（小さすぎるタップは無視）
      if (width > 1 && height > 1) {
        const centerX = Math.min(whiteoutStart.x, whiteoutCurrent.x) + width / 2;
        const centerY = Math.min(whiteoutStart.y, whiteoutCurrent.y) + height / 2;
        const newBox: WhiteoutBox = { id: Date.now(), x: centerX, y: centerY, width, height, mapIndex: currentMapIndex };
        const newBoxes = [...whiteoutBoxes, newBox];
        setWhiteoutBoxes(newBoxes);
        saveProjectMapData(mapPins, mapRows, mapDimensionLines, newBoxes, showLegendTable, mapTransforms, mapLayouts);
        // 自動選択しない — ユーザーが次のドラッグを始められる
      }
      setWhiteoutStart(null);
      setWhiteoutCurrent(null);
      return;
    }

    if (pendingActionInfo) {
      const dx = e.clientX - pendingActionInfo.clientX;
      const dy = e.clientY - pendingActionInfo.clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const timeElapsed = Date.now() - pendingActionInfo.time;

      if (distance < 10 && timeElapsed < 500) {
        const { localX: x, localY: y } = pendingActionInfo;

        if (editingMode === 'pin') {
          // 全マップ横断の欠番を埋める採番（削除後の番号が再利用される）
          const existingNums = new Set(
            mapPins
              .filter(p => p.type === 'circle')
              .map(p => parseInt(p.label))
              .filter(n => !isNaN(n) && n > 0)
          );
          let nextNum = 1;
          while (existingNums.has(nextNum)) nextNum++;
          const newLabel = String(nextNum);
          const newPins: MapPinT[] = [...mapPins, { id: Date.now(), x, y, label: newLabel, type: 'circle', size: 1, rotation: 0, mapIndex: currentMapIndex, textRotation: -(mapRotations[currentMapIndex] || 0) }];
          setMapPins(newPins);
          const newRows: MapRow[] = [...mapRows, { id: Date.now(), symbol: newLabel, part: '', photoNo: '', remarks: '', mapIndex: currentMapIndex }];
          setMapRows(newRows);
          saveProjectMapData(newPins, newRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts);

        } else if (editingMode === 'dimension') {
          if (!drawingStartPoint) {
            setDrawingStartPoint({ x, y }); 
          } else {
            const newLineId = Date.now();
            const newDimLines: DimensionLine[] = [...mapDimensionLines, {
              id: newLineId, start: drawingStartPoint, end: { x, y }, text: "", size: 2, color: activeColor, mapIndex: currentMapIndex, textRotation: -(mapRotations[currentMapIndex] || 0)
            }];
            setMapDimensionLines(newDimLines);
            saveProjectMapData(mapPins, mapRows, newDimLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts);
            setDrawingStartPoint(null); 
            setSelectedDimensionLineId(newLineId); 
          }
        }
      }
      setPendingActionInfo(null);
    }
  }, [editingMode, whiteoutStart, whiteoutCurrent, pendingActionInfo, mapPins, mapRows, mapDimensionLines, whiteoutBoxes, currentMapIndex, drawingStartPoint, activeColor, showLegendTable, mapRotations, mapTransforms, mapLayouts, saveProjectMapData]);

  const updateDimensionLine = useCallback((lineId: number, newProps: Partial<DimensionLine>) => {
    setMapDimensionLines(prev => {
      const newDimLines = prev.map(l => l.id === lineId ? { ...l, ...newProps } : l);
      saveProjectMapData(mapPins, mapRows, newDimLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts);
      return newDimLines;
    });
  }, [mapPins, mapRows, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts, saveProjectMapData]);

  const removeDimensionLine = useCallback((lineId: number) => {
    setMapDimensionLines(prev => {
      const newDimLines = prev.filter(l => l.id !== lineId);
      saveProjectMapData(mapPins, mapRows, newDimLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts);
      return newDimLines;
    });
    setSelectedDimensionLineId(null);
  }, [mapPins, mapRows, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts, saveProjectMapData]);

  const updateMapMarker = useCallback((pinId: number, newProps: Partial<MapPinT>) => {
    const pin = mapPins.find(p => p.id === pinId);
    const newPins = mapPins.map(p => p.id === pinId ? { ...p, ...newProps } : p);
    setMapPins(newPins);
    // ラベル変更時は対応するmapRowのsymbolも同期
    let currentRows = mapRows;
    if (newProps.label !== undefined && pin && newProps.label !== pin.label) {
      currentRows = mapRows.map(r =>
        r.symbol === pin.label && (r.mapIndex || 0) === (pin.mapIndex || 0)
          ? { ...r, symbol: newProps.label! }
          : r
      );
      setMapRows(currentRows);
    }
    saveProjectMapData(newPins, currentRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts);
  }, [mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts, saveProjectMapData]);

  const removeMapMarker = useCallback((pinId: number) => {
    const pin = mapPins.find(p => p.id === pinId);
    const newPins = mapPins.filter(p => p.id !== pinId);
    // ピン削除時に対応する凡例行を1件だけ削除（同ラベルが複数ある場合は1件だけ）
    let removedRow = false;
    const newRows = pin
      ? mapRows.filter(r => {
          if (!removedRow && r.symbol === pin.label && (r.mapIndex || 0) === (pin.mapIndex || 0)) {
            removedRow = true;
            return false;
          }
          return true;
        })
      : mapRows;
    setMapPins(newPins);
    setMapRows(newRows);
    saveProjectMapData(newPins, newRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts);
    setSelectedPinId(null);
  }, [mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts, saveProjectMapData]);

  const updateWhiteout = useCallback((boxId: number, newProps: Partial<WhiteoutBox>) => {
    setWhiteoutBoxes(prev => {
      const newBoxes = prev.map(b => b.id === boxId ? { ...b, ...newProps } : b);
      saveProjectMapData(mapPins, mapRows, mapDimensionLines, newBoxes, showLegendTable, mapTransforms, mapLayouts);
      return newBoxes;
    });
  }, [mapPins, mapRows, mapDimensionLines, showLegendTable, mapTransforms, mapLayouts, saveProjectMapData]);

  const removeWhiteout = useCallback((boxId: number) => {
    setWhiteoutBoxes(prev => {
      const newBoxes = prev.filter(b => b.id !== boxId);
      saveProjectMapData(mapPins, mapRows, mapDimensionLines, newBoxes, showLegendTable, mapTransforms, mapLayouts);
      return newBoxes;
    });
    setSelectedWhiteoutId(null);
  }, [mapPins, mapRows, mapDimensionLines, showLegendTable, mapTransforms, mapLayouts, saveProjectMapData]);

  const updateMapRow = useCallback((rowId: number, newProps: Partial<MapRow>) => {
    setMapRows(prev => prev.map(r => r.id === rowId ? { ...r, ...newProps } : r));
  }, []);

  const removeMapRow = useCallback((rowId: number) => {
    setMapRows(prev => {
      const newRows = prev.filter(r => r.id !== rowId);
      saveProjectMapData(mapPins, newRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts);
      return newRows;
    });
    setSelectedRowId(null);
  }, [mapPins, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts, saveProjectMapData]);

  const currentMapPins = useMemo(() => mapPins.filter(p => (p.mapIndex || 0) === currentMapIndex), [mapPins, currentMapIndex]);
  const currentMapDimensionLines = useMemo(() => mapDimensionLines.filter(l => (l.mapIndex || 0) === currentMapIndex), [mapDimensionLines, currentMapIndex]);
  const currentMapRows = useMemo(() => mapRows.filter(r => (r.mapIndex || 0) === currentMapIndex), [mapRows, currentMapIndex]);
  const currentWhiteoutBoxes = useMemo(() => whiteoutBoxes.filter(b => (b.mapIndex || 0) === currentMapIndex), [whiteoutBoxes, currentMapIndex]);

  const currentMapUrl = project?.mapUrls?.[currentMapIndex];
  const currentRotation = mapRotations[currentMapIndex] || 0;
  const currentTransform = mapTransforms[currentMapIndex] || { scale: 1, x: 0, y: 0 };
  
  const currentLayout = mapLayouts[currentMapIndex] || { title: '位置図', x: 15, y: 10, rotation: 0 };

  /**
   * コンテナアスペクトの解決:
   *   新形式 (project.mapImageAspects[currentMapIndex] が記録済み)
   *     → その自然アスペクト (画像とコンテナがぴったり一致)
   *   旧形式 (mapImageAspects に未記録)
   *     → 194/120 (LEGACY_MAP_ASPECT)
   *
   * 旧形式のドキュメントは、画像読み込みが完了したタイミングで
   * 自動的に新形式に移行される (onLoad ハンドラ内で migrateMapToImageAspect)。
   * 一度移行すれば以降は常に新形式として動く。
   *
   * showLegendTable === false (旧モードA: フルブリード) は廃止しているため
   * 分岐は残さない。
   */
  const containerAspectNum = resolveMapAspect(project?.mapImageAspects, currentMapIndex);
  const aspectStr = `${containerAspectNum}`;
  const aspectNum = containerAspectNum;
  const isLegacyMap = isLegacyMapCoord(project?.mapImageAspects, currentMapIndex);

  /**
   * セーフゾーン (印刷セーフエリア) 枠は新形式では不要。
   *
   * 新形式: コンテナ = 画像 なので、コンテナ全体 (0..100%) が印刷範囲。
   *         追加の枠表示は冗長で、むしろユーザー混乱の元になる。
   * 旧形式: 旧 194:120 コンテナに画像が object-contain でレターボックスされて
   *         いた都合上、画像の表示範囲を示す枠に意味があった。ただし旧形式の
   *         地図は編集された瞬間に新形式に自動移行するので、ここでセーフゾーン
   *         枠が出るのは「初回ロード ~ onLoad」のごく短時間だけ。
   *
   * 上記から、セーフゾーン枠表示は撤去する。
   */

  const mapCount = project?.mapUrls?.length || 0;

  // ピン選択時にラベル編集用ローカル状態を同期
  React.useEffect(() => {
    if (selectedPinId !== null) {
      const pin = mapPins.find(p => p.id === selectedPinId);
      if (pin) setEditingPinLabel(pin.label);
    }
  }, [selectedPinId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
                
                return (
    <div className="min-h-screen p-4 lg:p-6 font-sans pb-40 select-none overflow-x-hidden" style={{ background: '#0f0f1a', color: '#f0ede8' }}>

      {/* 保存エラートースト */}
      {saveError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-3 bg-red-600 text-white px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm">
          <span>⚠️ {saveError}</span>
          <button onClick={() => setSaveError(null)} className="ml-2 text-white/80 hover:text-white font-black text-lg leading-none">×</button>
        </div>
      )}

      {editingTitle && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.7)' }} onPointerDown={() => setEditingTitle(false)}>
          <div className="p-6 rounded-2xl shadow-2xl flex flex-col gap-5 w-[90%] max-w-sm" style={{ background: '#1c1c30', border: '1px solid #2e2e50' }} onPointerDown={e => e.stopPropagation()}>
             <h4 className="font-black border-b pb-2 text-lg text-center" style={{ color: '#f0ede8', borderColor: '#2e2e50' }}>タイトル設定</h4>

             <div>
                <label className="text-xs font-bold block mb-1" style={{ color: '#6b7280' }}>図面名 (例: 1階平面図)</label>
                <input
                  value={currentLayout.title}
                  onChange={e => updateMapLayout({ title: e.target.value })}
                  className="p-3 rounded-xl w-full font-black text-base outline-none transition-all"
                  style={{ background: '#12122a', border: '1px solid #3d3d60', color: '#f0ede8' }}
                  placeholder="位置図"
                />
             </div>

             <div>
                <label className="text-xs font-bold block mb-1" style={{ color: '#6b7280' }}>文字の向き（回転）</label>
                <div className="grid grid-cols-4 gap-2">
                   {[0, 90, 180, 270].map(deg => (
                     <button key={deg} onClick={() => updateMapLayout({ rotation: deg })} className="p-3 rounded-xl font-black border transition-colors" style={currentLayout.rotation === deg ? { background: '#3b82f6', color: '#fff', borderColor: '#3b82f6' } : { background: '#12122a', color: '#8b8ba8', borderColor: '#2e2e50' }}>{deg}°</button>
                      ))}
                    </div>
                  </div>

             <div className="flex gap-2 mt-1">
               <button
                 onClick={() => {
                   updateMapLayout({ title: editingTitleSnapshot });
                   setEditingTitle(false);
                 }}
                 className="flex-1 font-black py-3 rounded-xl transition-colors"
                 style={{ background: '#2e2e50', color: '#8b8ba8' }}
               >
                 キャンセル
               </button>
               <button
                 onClick={() => setEditingTitle(false)}
                 className="flex-1 font-black py-3 rounded-xl shadow-lg transition-colors"
                 style={{ background: '#ff6b35', color: '#fff' }}
               >
                 ✓ 完了
               </button>
                          </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto pb-12">
        <div className="flex flex-col xl:flex-row justify-between xl:items-center mb-6 gap-4 no-print">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/project/${id}`)}
              className="flex items-center gap-2 font-bold text-sm transition-colors"
              style={{ color: '#8b8ba8' }}
              onPointerEnter={e => (e.currentTarget.style.color = '#ff6b35')}
              onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
            >
              <ArrowLeft className="w-4 h-4" /> もどる
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-wide" style={{ color: '#f0ede8' }}>位置図の編集</h1>
              <div className="mt-1 h-0.5 w-8 rounded-full" style={{ background: '#3b82f6' }} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl border" style={{ background: '#1c1c30', borderColor: '#2e2e50' }}>
            {/* メインモード: ピン・移動 */}
            <button
              onClick={() => { setEditingMode('pin'); setDrawingStartPoint(null); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-sm transition-colors"
              style={editingMode === 'pin' ? { background: '#ef4444', color: '#fff' } : { background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}
            >
              <MapPin className="w-4 h-4" /> ピン追加
            </button>
            <button
              onClick={() => { setEditingMode('pan'); setDrawingStartPoint(null); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-sm transition-colors"
              style={editingMode === 'pan' ? { background: '#4f46e5', color: '#fff' } : { background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}
            >
              <Move className="w-4 h-4" /> 移動/ズーム
            </button>

            {/* 詳細トグル */}
            <button
              onClick={() => setShowAdvancedModes(v => !v)}
              className="flex items-center gap-1 px-3 py-2 rounded-xl font-bold text-xs transition-colors"
              style={{
                background: (editingMode === 'dimension' || editingMode === 'whiteout') ? 'rgba(245,158,11,0.15)' : '#12122a',
                color: (editingMode === 'dimension' || editingMode === 'whiteout') ? '#f59e0b' : '#6b7280',
                border: `1px solid ${(editingMode === 'dimension' || editingMode === 'whiteout') ? 'rgba(245,158,11,0.4)' : '#2e2e50'}`,
              }}
            >
              詳細 {showAdvancedModes ? '▲' : '▼'}
            </button>

            {/* 詳細モード: 寸法・消し */}
            {showAdvancedModes && (
              <>
                <button
                  onClick={() => { setEditingMode('dimension'); setDrawingStartPoint(null); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs transition-colors"
                  style={editingMode === 'dimension' ? { background: '#f0ede8', color: '#0f0f1a' } : { background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}
                >
                  <Ruler className="w-4 h-4" /> 寸法線
                </button>
                <button
                  onClick={() => { setEditingMode('whiteout'); setDrawingStartPoint(null); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs transition-colors"
                  style={editingMode === 'whiteout' ? { background: '#eab308', color: '#0f0f1a' } : { background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}
                >
                  <Eraser className="w-4 h-4" /> 消し
                </button>
              </>
            )}
          </div>
        </div>

        {/* 図面タブバー */}
        <div className="flex flex-wrap gap-2 mb-5 no-print p-2 rounded-2xl w-fit items-center" style={{ background: '#1c1c30' }}>
          {project?.mapUrls?.map((_, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <button onClick={() => setCurrentMapIndex(idx)} className="px-5 py-2.5 rounded-xl text-sm font-black transition-colors" style={currentMapIndex === idx ? { background: '#12122a', color: '#3b82f6', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' } : { color: '#8b8ba8' }}>図面 {idx + 1}</button>
              <button onClick={() => setConfirmDeleteMapIndex(idx)} aria-label="削除" className="p-1.5 rounded-lg transition-colors" style={{ color: '#3d3d60' }} onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')} onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')} title="削除"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
          <label className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black cursor-pointer transition-colors border-2 border-dashed" style={{ color: '#8b8ba8', borderColor: '#3d3d60' }} title="図面を追加">
            <Plus className="w-4 h-4" /> 追加
            <input ref={addInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => uploadMapImage(e, 'add')} disabled={isSaving} />
          </label>
                    </div>

        <div className={`grid ${showLegendTable ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'} gap-6 items-start`}>

          <div className={`${showLegendTable ? 'lg:col-span-8' : 'w-full max-w-4xl mx-auto'} p-4 lg:p-6 rounded-2xl border relative`} style={{ background: '#1c1c30', borderColor: '#2e2e50' }}>
            {editingMode === 'dimension' && (
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border mb-4" style={{ background: '#12122a', borderColor: '#2e2e50' }}>
                 <Paintbrush className="w-4 h-4" style={{ color: '#6b7280' }}/>
                 <span className="font-bold text-xs mr-1" style={{ color: '#8b8ba8' }}>線の色：</span>
                {COLOR_PALETTE.map(color => (
                  <button key={color.name} onClick={() => setActiveColor(color.value)} className="w-7 h-7 rounded-full transition-all" style={{ backgroundColor: color.value, border: activeColor === color.value ? '3px solid #ff6b35' : '2px solid #2e2e50', transform: activeColor === color.value ? 'scale(1.2)' : 'scale(1)' }} />
                ))}
                <label className="w-7 h-7 rounded-full cursor-pointer overflow-hidden flex items-center justify-center transition-all hover:scale-105" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)', border: !COLOR_PALETTE.some(c => c.value === activeColor) ? '3px solid #ff6b35' : '2px solid #2e2e50' }} title="自由色">
                  <input type="color" value={activeColor} onChange={(e) => setActiveColor(e.target.value)} className="opacity-0 absolute w-px h-px" />
                </label>
                  </div>
            )}

            {uploadProgress && (
              <div className="mt-2 mb-2 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}>
                <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: '#3b82f6', borderTopColor: 'transparent' }} />
                {uploadProgress}
                </div>
            )}

            {currentMapUrl && (
              <div className={`w-full flex flex-col lg:flex-row justify-between items-center gap-4 mb-4 transition-opacity duration-200 ${isDraggingWhiteout ? 'opacity-0' : 'opacity-100'}`}>
                
                <div className="hidden lg:flex flex-1 justify-start">
                   <div className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: '#60a5fa' }}>
                     💡 枠内のタイトルを指で移動・タップで編集
                   </div>
                </div>

                <div className="flex-1 flex justify-center">
                  {editingMode !== 'pan' && (
                    <div className="px-5 py-2 rounded-full font-black flex items-center gap-2 shadow-md text-xs whitespace-nowrap" style={{ background: '#12122a', border: '1px solid #3d3d60', color: '#f0ede8' }}>
                      {editingMode === 'pin' && <><LayoutGrid className="w-4 h-4" style={{ color: '#ef4444' }}/> タップでピンを追加</>}
                      {editingMode === 'dimension' && !drawingStartPoint && <><Ruler className="w-4 h-4" style={{ color: '#3b82f6' }}/> 線の始点をタップ</>}
                      {editingMode === 'dimension' && drawingStartPoint && (
                        <>
                          <Ruler className="w-4 h-4" style={{ color: '#eab308' }}/> 線の終点をタップ
                          <button type="button" onClick={(e) => { e.stopPropagation(); setDrawingStartPoint(null); }} className="ml-1 px-2 py-0.5 rounded-full font-bold text-xs transition-colors" style={{ background: 'rgba(255,255,255,0.15)', color: '#f0ede8' }}>✕ 取消</button>
                        </>
                      )}
                      {editingMode === 'whiteout' && <><Eraser className="w-4 h-4" style={{ color: '#eab308' }}/> 隠したい文字の上をドラッグ</>}
                    </div>
                  )}
                </div>

                <div className="flex-1 flex justify-end gap-2 w-full lg:w-auto">
                  <button onClick={() => rotateCurrentMap(-90)} aria-label="左回転" className="p-2 rounded-xl transition-colors" style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }} onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')} onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')} title="左に90°回転"><RotateCcw className="w-4 h-4" /></button>
                  <button onClick={() => rotateCurrentMap(90)} aria-label="右回転" className="p-2 rounded-xl transition-colors" style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }} onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')} onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')} title="右に90°回転"><RotateCw className="w-4 h-4" /></button>
                  <label className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl cursor-pointer transition-colors" style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }} onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')} onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')} title="この図面を差し替え">
                    <UploadCloud className="w-4 h-4" /> 差し替え
                    <input ref={replaceInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => uploadMapImage(e, 'replace')} disabled={isSaving} />
                  </label>
                </div>
              </div>
            )}

            <div className="w-full flex justify-center mt-2 relative">
              {currentMapUrl ? (
                <div className="relative flex flex-col items-center w-full">
                  
                  {editingMode === 'pan' && (
                     <div className="absolute -top-14 z-50 flex items-center gap-3 px-5 py-2.5 rounded-full shadow-2xl" style={{ background: '#12122a', border: '1px solid #3d3d60' }}>
                        <span className="font-black text-xs whitespace-nowrap" style={{ color: '#f0ede8' }}>🔍 ズーム:</span>
                        <input type="range" min="0.2" max="4" step="0.05" value={currentTransform.scale} onChange={(e) => updateTransform(currentMapIndex, { scale: parseFloat(e.target.value) })} onMouseUp={debouncedSaveFromZoom} onTouchEnd={debouncedSaveFromZoom} className="w-28 lg:w-40 accent-orange-500 cursor-pointer" />
                        <span className="font-bold w-10 text-center text-xs" style={{ color: '#8b8ba8' }}>{Math.round(currentTransform.scale * 100)}%</span>
                        <button onClick={() => { updateTransform(currentMapIndex, { scale: 1, x: 0, y: 0 }); saveProjectMapData(mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts); }} className="ml-1 px-3 py-1 rounded-full font-bold text-xs transition-colors whitespace-nowrap" style={{ background: '#2e2e50', color: '#8b8ba8' }}>リセット</button>
                     </div>
                  )}

                  <div className="w-full flex justify-center items-center overflow-hidden rounded-xl border" style={{ background: '#12122a', borderColor: '#2e2e50' }}>
                    <div
                      className={`relative w-full transition-all ${editingMode === 'pan' ? 'ring-4 ring-indigo-500 ring-offset-4 cursor-move' : ''}`}
                      style={{ 
                        aspectRatio: aspectStr,
                        maxHeight: '70vh',
                        maxWidth: `calc(70vh * ${aspectNum})`,
                      }}
                      onPointerDown={handlePanPointerDown}
                      onPointerMove={handlePanPointerMove}
                      onPointerUp={handlePanPointerUp}
                      onPointerCancel={handlePanPointerUp}
                    >
                      {/* 印刷セーフエリア枠は撤去 (詳細は aspectStr のコメント参照)。
                          新形式 (画像=コンテナ) では枠を出す意味がなく、混乱の元になる。 */}

                      <div
                        className="map-content-wrapper absolute inset-0 flex items-center justify-center transition-transform duration-75"
                        style={{ transform: `translate(${currentTransform.x}%, ${currentTransform.y}%) scale(${currentTransform.scale}) rotate(${currentRotation}deg)`, transformOrigin: 'center center' }}
                      >
                        <img
                          src={proxyUrl(currentMapUrl, `map_${currentMapIndex}_${sessionId}`)}
                          crossOrigin="anonymous"
                          className="block w-full h-full object-contain pointer-events-none"
                          alt=""
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            if (!img.naturalWidth || !img.naturalHeight) return;
                            const naturalAspect = img.naturalWidth / img.naturalHeight;
                            // 不正な aspect（0・NaN・極端な値）はマイグレーション対象外
                            // 範囲外なら次回ロード時に再試行するため、ここで中断する
                            const ASPECT_MIN = 0.2;
                            const ASPECT_MAX = 5.0;
                            if (!Number.isFinite(naturalAspect) || naturalAspect < ASPECT_MIN || naturalAspect > ASPECT_MAX) {
                              import.meta.env.DEV && console.warn(
                                `[mapMigrate] 不正なアスペクト比 ${naturalAspect} を検出。マイグレーションをスキップ。`
                              );
                              return;
                            }
                            // 旧形式なら新形式に自動移行 (Firestore + 全座標変換)
                            if (isLegacyMap) {
                              void migrateLegacyMap(currentMapIndex, naturalAspect);
                            }
                          }}
                        />
                        
                        <div 
                          className="absolute inset-0 z-0 touch-none"
                          style={{ cursor: editingMode === 'pan' ? 'move' : 'crosshair' }}
                          onPointerDown={handleMapPointerDown}
                          onPointerMove={handleMapPointerMove}
                          onPointerUp={handleMapPointerUp}
                          onPointerCancel={handleMapPointerUp}
                        />

                        {/* ★ 追加：ドラッグ可能なタイトルマーカー */}
                        <TitleMarker
                           layout={currentLayout}
                           mapRotation={currentRotation}
                           currentScale={currentTransform.scale}
                           isSelected={editingTitle}
                           onClick={() => {
                             setEditingTitleSnapshot(mapLayouts[currentMapIndex]?.title ?? '');
                             setEditingTitle(true);
                           }}
                           onDragEnd={(x, y) => updateMapLayout({ x, y })}
                           mapCount={mapCount}
                           mapIndex={currentMapIndex}
                        />

                        {isDraggingWhiteout && whiteoutCurrent && (
                          <div
                            className="absolute pointer-events-none z-50"
                            style={{
                              left: `${Math.min(whiteoutStart.x, whiteoutCurrent.x)}%`,
                              top: `${Math.min(whiteoutStart.y, whiteoutCurrent.y)}%`,
                              width: `${Math.abs(whiteoutStart.x - whiteoutCurrent.x)}%`,
                              height: `${Math.abs(whiteoutStart.y - whiteoutCurrent.y)}%`,
                              backgroundColor: 'rgba(255,255,255,0.7)',
                              border: '2px dashed #6b7280',
                            }}
                          />
                        )}

                        {currentWhiteoutBoxes.map(box => (
                          <WhiteoutMarker key={box.id} box={box} rotation={currentRotation} currentScale={currentTransform.scale} isSelected={selectedWhiteoutId === box.id} onDragEnd={(x, y) => updateWhiteout(box.id, { x, y })} onClick={() => { if (editingMode !== 'pan') setSelectedWhiteoutId(box.id); }} />
                        ))}
                        
                        {currentMapDimensionLines.map((line) => (
                          <DimensionLineMarker key={line.id} line={line} rotation={currentRotation} currentScale={currentTransform.scale} isSelected={selectedDimensionLineId === line.id} onSelect={() => {if(editingMode !== 'pan') setSelectedDimensionLineId(line.id)}} onRemove={() => removeDimensionLine(line.id)} onTextChange={(text) => updateDimensionLine(line.id, {text})} onUpdate={(newProps) => updateDimensionLine(line.id, newProps)} onDeselect={() => setSelectedDimensionLineId(null)} />
                        ))}

                        {drawingStartPoint && editingMode === 'dimension' && (
                          <div style={{ left: `${drawingStartPoint.x}%`, top: `${drawingStartPoint.y}%`, backgroundColor: activeColor }} className="absolute w-4 h-4 rounded-full border-2 border-white shadow-xl pointer-events-none z-20 transform -translate-x-1/2 -translate-y-1/2" />
                        )}

                        {currentMapPins.map(pin => (
                          <MapMarker key={pin.id} pin={pin} rotation={currentRotation} currentScale={currentTransform.scale} isSelected={selectedPinId === pin.id} onDragEnd={(x, y) => updateMapMarker(pin.id, { x, y })} onClick={() => {if(editingMode !== 'pan') setSelectedPinId(pin.id)}} />
                        ))}
                      </div>
                    </div>
                  </div>
            </div>
          ) : (
                <label className="flex flex-col items-center justify-center cursor-pointer w-full h-72 rounded-2xl border-2 border-dashed group transition-colors" style={{ borderColor: '#3d3d60' }} onPointerEnter={e => (e.currentTarget.style.borderColor = '#3b82f6')} onPointerLeave={e => (e.currentTarget.style.borderColor = '#3d3d60')}>
                  <UploadCloud className="w-14 h-14 mb-3 transition-transform group-hover:scale-110" style={{ color: '#3b82f6' }} />
                  <span className="text-lg font-black block mb-1" style={{ color: '#3b82f6' }}>図面・位置図をアップロード</span>
                  <span className="text-xs font-bold" style={{ color: '#6b7280' }}>画像またはPDFを選択してください</span>
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => uploadMapImage(e, 'add')} disabled={isSaving} />
                </label>
              )}
            </div>

            {selectedWhiteoutId !== null && (() => {
              const box = currentWhiteoutBoxes.find(b => b.id === selectedWhiteoutId);
              if (!box) return null;
              return (
                <WhiteoutControlPanel
                  box={box}
                  onUpdate={(updates) => updateWhiteout(selectedWhiteoutId, updates)}
                  onRemove={() => { removeWhiteout(selectedWhiteoutId); setSelectedWhiteoutId(null); }}
                  onDeselect={() => setSelectedWhiteoutId(null)}
                />
              );
            })()}

            {/* ── ピン編集ボトムシート ── */}
            {selectedPinId !== null && (() => {
              const pin = currentMapPins.find(p => p.id === selectedPinId);
              if (!pin) return null;
              const currentSize = pin.size || 1;
              return (
                <>
                  {/* バックドロップ */}
                  <div
                    className="fixed inset-0 z-[100]"
                    style={{ background: 'rgba(0,0,0,0.4)' }}
                    onClick={() => setSelectedPinId(null)}
                  />
                  {/* ボトムシート */}
                  <div
                    className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-2xl shadow-2xl"
                    style={{ background: '#1c1c30', border: '1px solid #3d3d60', borderBottom: 'none' }}
                  >
                    {/* ドラッグハンドル */}
                    <div className="flex justify-center pt-3 pb-1">
                      <div className="w-10 h-1 rounded-full" style={{ background: '#3d3d60' }} />
                    </div>
                    <div className="px-5 pb-8 pt-2 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-base" style={{ color: '#f0ede8' }}>ピンを編集</span>
                        <button onClick={() => setSelectedPinId(null)} className="p-1.5 rounded-full" style={{ background: '#2e2e50', color: '#8b8ba8' }}>
                          <span className="text-sm font-black">✕</span>
                        </button>
                      </div>
                      {/* 名称 */}
                      <div>
                        <label className="block text-xs font-bold mb-1.5" style={{ color: '#6b7280' }}>ピン番号・名称</label>
                        <input
                          type="text"
                          value={editingPinLabel}
                          onChange={e => setEditingPinLabel(e.target.value)}
                          onBlur={() => {
                            const trimmed = editingPinLabel.trim();
                            if (trimmed && trimmed !== pin.label) {
                              updateMapMarker(selectedPinId, { label: trimmed });
                            } else {
                              setEditingPinLabel(pin.label);
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') { setEditingPinLabel(pin.label); (e.target as HTMLInputElement).blur(); }
                          }}
                          className="w-full px-4 py-3 rounded-xl text-sm font-bold outline-none"
                          style={{ background: '#12122a', border: '1.5px solid #2e2e50', color: '#f0ede8', fontSize: '16px' }}
                          maxLength={20}
                          autoFocus
                        />
                      </div>
                      {/* サイズ */}
                      <div>
                        <label className="block text-xs font-bold mb-2" style={{ color: '#6b7280' }}>サイズ</label>
                        <div className="flex items-center gap-3">
                          <button type="button"
                            onClick={() => updateMapMarker(selectedPinId, { size: Math.max(0.3, Math.round((currentSize - 0.1) * 10) / 10) })}
                            className="w-12 h-12 flex items-center justify-center text-xl font-bold rounded-xl active:scale-90"
                            style={{ background: '#2e2e50', color: '#f0ede8' }}>ー</button>
                          <span className="flex-1 text-center font-black text-lg" style={{ color: '#f0ede8' }}>{currentSize.toFixed(1)}x</span>
                          <button type="button"
                            onClick={() => updateMapMarker(selectedPinId, { size: Math.min(3, Math.round((currentSize + 0.1) * 10) / 10) })}
                            className="w-12 h-12 flex items-center justify-center text-xl font-bold rounded-xl active:scale-90"
                            style={{ background: '#2e2e50', color: '#f0ede8' }}>＋</button>
                        </div>
                      </div>
                      {/* 削除 */}
                      <button type="button"
                        onClick={() => { removeMapMarker(selectedPinId); setSelectedPinId(null); }}
                        className="w-full py-3 rounded-xl font-black text-sm active:scale-95 transition-all"
                        style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                        <Trash2 className="w-4 h-4 inline mr-1.5" /> このピンを削除
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {showLegendTable && (
            <div className="lg:col-span-4 p-5 rounded-2xl border space-y-4" style={{ background: '#1c1c30', borderColor: '#2e2e50' }}>
              <h3 className="text-base font-black flex items-center gap-2 border-b pb-3" style={{ color: '#f0ede8', borderColor: '#2e2e50' }}>
                <FileText className="w-5 h-5" style={{ color: '#3b82f6' }}/> 凡例（項目欄）
              </h3>
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#2e2e50' }}>
                <div className="grid grid-cols-12 text-xs font-black border-b" style={{ background: '#12122a', borderColor: '#2e2e50', color: '#8b8ba8' }}>
                  <div className="col-span-2 py-2.5 text-center border-r" style={{ borderColor: '#2e2e50' }}>符号</div>
                  <div className="col-span-4 py-2.5 text-center border-r" style={{ borderColor: '#2e2e50' }}>部位</div>
                  <div className="col-span-5 py-2.5 text-center border-r" style={{ borderColor: '#2e2e50' }}>備考</div>
                  <div className="col-span-1 py-2.5 text-center" style={{ color: '#3d3d60' }}>削</div>
                </div>
                {currentMapRows.length > 0 ? currentMapRows.map((row) => (
                  <LegendRow
                    key={row.id} row={row} isSelected={selectedRowId === row.id}
                    onSelect={() => setSelectedRowId(row.id)} onChange={(updates) => updateMapRow(row.id, updates)}
                    onRemove={() => removeMapRow(row.id)}
                  />
                )) : (
                  <div className="text-center py-8 text-sm font-bold" style={{ background: '#12122a', color: '#6b7280' }}>ピンを追加すると<br/>ここに行が追加されます</div>
          )}
        </div>
              <button onClick={() => { const newRows = [...mapRows, { id: Date.now(), symbol: '', part: '', photoNo: '', remarks: '', mapIndex: currentMapIndex }]; setMapRows(newRows); saveProjectMapData(mapPins, newRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts); }} className="w-full font-black py-3 px-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-colors text-sm" style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }} onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')} onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}><Plus className="w-4 h-4"/> 行を手動追加</button>
      </div>
          )}
        </div>

        <button onClick={() => saveProjectMapData(mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, mapLayouts).then(() => { setSaveSuccess('保存しました'); setTimeout(() => setSaveSuccess(null), 3000); })} disabled={isSaving} className="fixed bottom-6 right-6 z-50 font-black px-6 py-4 rounded-2xl shadow-2xl transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 text-sm" style={{ background: '#ff6b35', color: '#fff', boxShadow: '0 0 24px rgba(255,107,53,0.4)' }}><Save className="w-5 h-5"/> {isSaving ? '保存中...' : '位置図を保存'}</button>

      </div>
      {saveSuccess && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#10b981', color: '#fff' }}>
          {saveSuccess}
        </div>
      )}
      <ConfirmModal
        isOpen={confirmDeleteMapIndex !== null}
        title="位置図を削除"
        message="この位置図を削除しますか？ピンや凡例データも削除されます。"
        confirmLabel="削除"
        variant="danger"
        onConfirm={async () => {
          if (confirmDeleteMapIndex !== null) {
            await deleteMapPhoto(confirmDeleteMapIndex);
            setConfirmDeleteMapIndex(null);
          }
        }}
        onCancel={() => setConfirmDeleteMapIndex(null)}
      />
    </div>
  );
}
