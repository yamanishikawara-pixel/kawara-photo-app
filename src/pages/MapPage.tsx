import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, MapPin, CaseUpper, FileText, LayoutGrid, Ruler, Paintbrush, Save, UploadCloud, RotateCcw, RotateCw, Eraser, Move } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';
import type { MapPin as MapPinT, MapRow, Project, DimensionLine, WhiteoutBox } from '../types';
import { proxyUrl } from '../shared/utils';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DEFAULT_MAP_PART_NAMES = ['軒先', '袖', 'ケラバ', '谷', '棟', '隅棟', '平'];

const COLOR_PALETTE = [
  { name: "Yellow", value: "#FFD700" },
  { name: "White", value: "#FFFFFF" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Red", value: "#ef4444" },
];

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

  useEffect(() => { if (!dragging) setPosition({ x: initialX, y: initialY }); }, [initialX, initialY, dragging]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerDownRef.current = true;
    isMovedRef.current = false;
    startPosRef.current = { x: position.x, y: position.y, clientX: e.clientX, clientY: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointerDownRef.current || !containerRef.current) return;
    
    let dx = e.clientX - startPosRef.current.clientX;
    let dy = e.clientY - startPosRef.current.clientY;

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

    let newX = startPosRef.current.x + (localDx / w) * 100;
    let newY = startPosRef.current.y + (localDy / h) * 100;
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

const WhiteoutMarker = React.memo(({ box, rotation, currentScale, isSelected, onDragEnd, onClick, onSizeChange, onRemove }: { box: WhiteoutBox; rotation: number; currentScale: number; isSelected: boolean; onDragEnd: (x: number, y: number) => void; onClick: () => void; onSizeChange: (updates: Partial<WhiteoutBox>) => void; onRemove: () => void; }) => {
  const { position, onPointerDown, onPointerMove, onPointerUp, dragging, containerRef, handleClick } = useRotatedDraggable(box.x, box.y, rotation, onDragEnd);
  
  return (
    <>
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => handleClick(e, onClick)}
        style={{ left: `${position.x}%`, top: `${position.y}%`, width: `${box.width}%`, height: `${box.height}%`, transform: `translate(-50%, -50%)`, touchAction: 'none', zIndex: isSelected ? 100 : (dragging ? 30 : 5) }}
        className={`absolute bg-white cursor-pointer transition-all duration-75 ${dragging ? 'opacity-80 shadow-md' : ''} ${isSelected && !dragging ? 'ring-2 ring-blue-500 shadow-lg' : ''}`}
      />
      {isSelected && !dragging && (
        <div style={{ left: `${position.x}%`, top: `${position.y + box.height/2}%`, marginTop: `${10 / currentScale}px`, transform: `translateX(-50%) rotate(${-rotation}deg) scale(${1 / currentScale})`, transformOrigin: 'top center' }} className="absolute z-40 flex flex-col gap-3 bg-white rounded-xl shadow-2xl border-2 border-gray-200 p-4 min-w-[200px]" onPointerDown={(e) => e.stopPropagation()}>
          <h4 className="text-sm font-black text-gray-700 text-center border-b pb-2">白塗り（文字隠し）</h4>
           <div className="flex items-center justify-between gap-4">
             <span className="text-xs font-bold text-gray-500">横幅</span>
             <div className="flex border-2 border-gray-100 rounded-lg overflow-hidden">
               <button onClick={() => onSizeChange({ width: Math.max(1, box.width - 1) })} className="w-10 h-8 bg-gray-50 hover:bg-gray-100 border-r-2 border-gray-100 font-bold">-</button>
               <button onClick={() => onSizeChange({ width: box.width + 1 })} className="w-10 h-8 bg-gray-50 hover:bg-gray-100 font-bold">+</button>
             </div>
           </div>
           <div className="flex items-center justify-between gap-4">
             <span className="text-xs font-bold text-gray-500">縦幅</span>
             <div className="flex border-2 border-gray-100 rounded-lg overflow-hidden">
               <button onClick={() => onSizeChange({ height: Math.max(1, box.height - 1) })} className="w-10 h-8 bg-gray-50 hover:bg-gray-100 border-r-2 border-gray-100 font-bold">-</button>
               <button onClick={() => onSizeChange({ height: box.height + 1 })} className="w-10 h-8 bg-gray-50 hover:bg-gray-100 font-bold">+</button>
             </div>
           </div>
           <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="mt-1 w-full py-2 text-red-500 bg-red-50 rounded-lg hover:bg-red-100 text-sm font-bold"><Trash2 className="w-4 h-4 inline mr-1" /> 削除</button>
        </div>
      )}
    </>
  );
});

const DimensionLineMarker = React.memo(({ line, rotation, currentScale, isSelected, onSelect, onRemove, onTextChange, onUpdate, onDeselect }: { line: DimensionLine; rotation: number; currentScale: number; isSelected: boolean; onSelect: () => void; onRemove: () => void; onTextChange: (text: string) => void; onUpdate: (props: Partial<DimensionLine>) => void; onDeselect: () => void; }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localStart, setLocalStart] = useState(line.start);
  const [localEnd, setLocalEnd] = useState(line.end);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);
  const dragStartPos = useRef({ clientX: 0, clientY: 0, started: false });

  useEffect(() => {
    if (!isDragging) { setLocalStart(line.start); setLocalEnd(line.end); }
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
    
    let dx = e.clientX - dragStartPos.current.clientX;
    let dy = e.clientY - dragStartPos.current.clientY;
    
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
  // ★ 修正：ズームスケールに合わせてオフセット値を逆算し、表示崩れを防ぐ
  const isUpperHalf = midPoint.y < 50;
  const popupMarginTop = isUpperHalf ? (80 / currentScale) : (-80 / currentScale);
  
  const color = line.color || "#FFFFFF"; 
  const thickness = Number(line.size || 2); 
  const handleRadius = Math.max(12, 12 / currentScale); // スケールに合わせてハンドルの大きさを維持

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
        <div style={{ left: `${safePopupX}%`, top: `${midPoint.y}%`, marginTop: `${popupMarginTop}px`, transform: `translate(-50%, -50%) rotate(${-rotation}deg) scale(${1 / currentScale})` }} className="absolute z-30 flex flex-col items-center gap-3 bg-white p-4 lg:p-5 rounded-2xl shadow-3xl border-2 border-gray-100 min-w-[280px]" onPointerDown={e => e.stopPropagation()}>
          <div className="flex w-full gap-2 items-center justify-between border-b border-gray-100 pb-2">
             <h4 className="text-sm lg:text-base font-black text-gray-900 flex items-center gap-1"><CaseUpper className="w-4 h-4 text-blue-500"/> 文字と線</h4>
             <div className="flex items-center gap-1">
               <button onClick={(e) => { e.stopPropagation(); onUpdate({ size: Math.max(1, thickness - 1) }); }} className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded font-bold text-gray-700">ー</button>
               <span className="text-xs font-bold text-gray-400 mx-1">{thickness}</span>
               <button onClick={(e) => { e.stopPropagation(); onUpdate({ size: Math.min(10, thickness + 1) }); }} className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded font-bold text-gray-700 mr-2">＋</button>
               <div className="w-px h-6 bg-gray-200 mx-1"></div>
               <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-2 text-red-500 bg-red-50 rounded-lg hover:bg-red-100 ml-1"><Trash2 className="w-5 h-5" /></button>
             </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full">
            {DEFAULT_MAP_PART_NAMES.map(name => (
              <button key={name} onClick={() => addPartName(name)} className="text-xs lg:text-sm font-black text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all">＋{name}</button>
            ))}
          </div>
          <div className="flex gap-2 w-full">
            <input ref={inputRef} type="text" value={line.text} onChange={(e) => onTextChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onDeselect(); } }} className="flex-1 bg-gray-50 border-2 border-gray-100 p-2 lg:p-3 text-base lg:text-lg font-bold rounded-xl outline-none focus:border-blue-400 focus:bg-white text-center shadow-inner placeholder:font-normal" placeholder="例: 軒先 5.5m" />
            <button type="button" onClick={(e) => { e.stopPropagation(); onDeselect(); }} className="px-3 lg:px-4 py-2 lg:py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black rounded-xl shadow transition-all whitespace-nowrap">✓ 完了</button>
          </div>
        </div>
      )}

      {isSelected && (
        <>
          <div
            className="absolute z-40 bg-blue-500/30 border-2 border-blue-500 rounded-full cursor-move touch-none backdrop-blur-sm"
            style={{ left: `${localStart.x}%`, top: `${localStart.y}%`, width: `${handleRadius * 2}px`, height: `${handleRadius * 2}px`, marginLeft: `-${handleRadius}px`, marginTop: `-${handleRadius}px` }}
            onPointerDown={(e) => startDrag(e, 'start')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          <div
            className="absolute z-40 bg-blue-500/30 border-2 border-blue-500 rounded-full cursor-move touch-none backdrop-blur-sm"
            style={{ left: `${localEnd.x}%`, top: `${localEnd.y}%`, width: `${handleRadius * 2}px`, height: `${handleRadius * 2}px`, marginLeft: `-${handleRadius}px`, marginTop: `-${handleRadius}px` }}
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
  // ★ 修正：ズームしていても、ピンの見た目上の大きさが一定になるように調整
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
            <div className="flex items-center gap-1 drop-shadow-md bg-white/70 px-2 py-0.5 rounded-lg border border-red-200"><span className="text-red-600 font-black text-2xl leading-none" style={{ transform: `rotate(${pin.rotation || 0}deg)` }}>➡</span><span className="text-red-600 font-bold text-xl">{pin.label}</span></div>
          ) : (
            <div className="relative flex items-center justify-center"><div className="w-14 h-14 rounded-full border-[4px] border-red-600 shadow-sm bg-red-600/10"></div><span className="absolute text-red-600 font-black text-xl drop-shadow-md bg-white/50 px-1 rounded">{pin.label}</span></div>
          )}
        </div>
      </div>
    </>
  );
});

const LegendRow = React.memo(({ row, isSelected, onSelect, onChange, onRemove }: { row: MapRow; isSelected: boolean; onSelect: () => void; onChange: (updates: Partial<MapRow>) => void; onRemove: () => void; }) => {
  return (
    <div onPointerDown={onSelect} className={`grid grid-cols-12 text-base lg:text-lg border-b border-gray-100 last:border-b-0 cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
      <input type="text" value={row.symbol} onChange={(e) => onChange({ symbol: e.target.value })} className="col-span-2 py-3 text-center font-black text-red-700 bg-transparent outline-none border-r border-gray-100" />
      <input type="text" value={row.part} placeholder="軒先" onChange={(e) => onChange({ part: e.target.value })} className="col-span-4 py-3 px-2 font-bold bg-transparent outline-none border-r border-gray-100" />
      <input type="text" value={row.remarks} placeholder="..." onChange={(e) => onChange({ remarks: e.target.value })} className="col-span-5 py-3 px-2 font-bold bg-transparent outline-none border-r border-gray-100" />
      <div className="col-span-1 flex items-center justify-center">
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-100 rounded-lg transition-colors"><Trash2 className="w-5 h-5"/></button>
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
  
  const [selectedPinId, setSelectedPinId] = useState<number | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [selectedDimensionLineId, setSelectedDimensionLineId] = useState<number | null>(null);
  const [selectedWhiteoutId, setSelectedWhiteoutId] = useState<number | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [currentMapIndex, setCurrentMapIndex] = useState(0);

  const [editingMode, setEditingMode] = useState<'pin' | 'dimension' | 'whiteout' | 'pan'>('pan');
  const [drawingStartPoint, setDrawingStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeColor, setActiveColor] = useState<string>(COLOR_PALETTE[0].value); 
  const [showLegendTable, setShowLegendTable] = useState(true);

  const [whiteoutStart, setWhiteoutStart] = useState<{ x: number; y: number } | null>(null);
  const [whiteoutCurrent, setWhiteoutCurrent] = useState<{ x: number; y: number } | null>(null);
  const isDraggingWhiteout = whiteoutStart !== null;

  const [pendingActionInfo, setPendingActionInfo] = useState<{ clientX: number, clientY: number, localX: number, localY: number, time: number } | null>(null);
  const startDragPan = useRef({ x: 0, y: 0, startX: 0, startY: 0, isDragging: false });

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const d = await getDoc(doc(db, 'projects', id));
        if (d.exists()) {
          const data = d.data() as Project;
          setProject(data);
          setMapPins(data.mapPins || []);
          setMapRows(data.mapRows || []);
          setMapDimensionLines(data.mapDimensionLines || []);
          setShowLegendTable(data.showLegendTable !== false);
          setMapRotations(data.mapRotations || []);
          setWhiteoutBoxes(data.whiteoutBoxes || []);
          setMapTransforms(data.mapTransforms || []);
        } else { setError('プロジェクトが見つかりません。'); }
      } catch { setError('データの読み込みに失敗しました。'); } finally { setLoading(false); }
    };
    fetchData();
  }, [id]);

  const saveProjectMapData = useCallback(async (newPins: MapPinT[], newRows: MapRow[], newDimLines: DimensionLine[], newWhiteouts: WhiteoutBox[], newTableShow: boolean, newTransforms: { scale: number; x: number; y: number }[]) => {
    if (!id) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'projects', id), {
        mapPins: newPins,
        mapRows: newRows,
        mapDimensionLines: newDimLines,
        whiteoutBoxes: newWhiteouts,
        showLegendTable: newTableShow,
        mapTransforms: newTransforms,
      });
    } catch { setError('保存に失敗しました。'); } finally { setIsSaving(false); }
  }, [id]);

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
          
          const renderContext: any = { canvasContext: ctx, viewport: viewport };
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
      let insertAt = mode === 'replace' ? currentMapIndex : newMapUrls.length;

      for (let i = 0; i < imageFiles.length; i++) {
        setUploadProgress(`アップロード中... (${i + 1}/${imageFiles.length})`);
        const f = imageFiles[i];
        const storageRef = ref(storage, `maps/${id}/${Date.now()}_${f.name}`);
        await uploadBytes(storageRef, f);
        const url = await getDownloadURL(storageRef);
        if (mode === 'replace' && i === 0) {
          newMapUrls[insertAt] = url;
        } else {
          newMapUrls.splice(insertAt + (mode === 'replace' ? 1 : 0) + (i > 0 ? i : 0), 0, url);
        }
      }

      setProject(prev => prev ? { ...prev, mapUrls: newMapUrls } : null);
      await updateDoc(doc(db, 'projects', id), { mapUrls: newMapUrls });
      setCurrentMapIndex(insertAt);
      setEditingMode('pan');
    } catch (err) {
      console.error(err);
      setError('図面のアップロードに失敗しました。');
    } finally {
      setIsSaving(false);
      setUploadProgress('');
    }
  };

  const rotateCurrentMap = useCallback(async (delta: number) => {
    if (!id) return;
    const newRotations = [...mapRotations];
    newRotations[currentMapIndex] = ((newRotations[currentMapIndex] || 0) + delta + 360) % 360;
    setMapRotations(newRotations);
    try {
      await updateDoc(doc(db, 'projects', id), { mapRotations: newRotations });
    } catch { setError('保存に失敗しました。'); }
  }, [id, mapRotations, currentMapIndex]);

  const deleteMapPhoto = useCallback(async (mapIndex: number) => {
    if (!project || !id) return;
    if (!window.confirm('この位置図を削除しますか？ピンや凡例データも削除されます。')) return;

    const urlToDelete = project.mapUrls?.[mapIndex];
    if (urlToDelete) {
      try { await deleteObject(ref(storage, urlToDelete)); } catch { setError('地図画像の削除に失敗しましたが、データは保存されました。'); }
    }

    const newMapUrls = (project.mapUrls || []).filter((_, i) => i !== mapIndex);
    const newRotations = mapRotations.filter((_, i) => i !== mapIndex);
    const newTransforms = mapTransforms.filter((_, i) => i !== mapIndex);
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
    setProject({ ...project, mapUrls: newMapUrls });

    const nextIndex = currentMapIndex >= newMapUrls.length ? Math.max(0, newMapUrls.length - 1) : currentMapIndex;
    setCurrentMapIndex(nextIndex);

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'projects', id), { mapUrls: newMapUrls, mapRotations: newRotations, mapTransforms: newTransforms, mapPins: newPins, mapRows: newRows, mapDimensionLines: newDimLines, whiteoutBoxes: newWhiteouts });
    } catch { setError('削除に失敗しました。'); } finally { setIsSaving(false); }
  }, [project, id, mapPins, mapRows, mapDimensionLines, whiteoutBoxes, mapRotations, mapTransforms, currentMapIndex]);

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
    saveProjectMapData(mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms);
  };

  const handleMapPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (selectedPinId !== null) setSelectedPinId(null);
    if (selectedRowId !== null) setSelectedRowId(null);
    if (selectedDimensionLineId !== null) setSelectedDimensionLineId(null);
    if (selectedWhiteoutId !== null) setSelectedWhiteoutId(null);

    const rotation = mapRotations[currentMapIndex] || 0;
    
    if (editingMode === 'pan') return;

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

      if (width > 0.5 && height > 0.5) {
        const centerX = Math.min(whiteoutStart.x, whiteoutCurrent.x) + width / 2;
        const centerY = Math.min(whiteoutStart.y, whiteoutCurrent.y) + height / 2;
        const newBox: WhiteoutBox = { id: Date.now(), x: centerX, y: centerY, width, height, mapIndex: currentMapIndex };
        const newBoxes = [...whiteoutBoxes, newBox];
        setWhiteoutBoxes(newBoxes);
        saveProjectMapData(mapPins, mapRows, mapDimensionLines, newBoxes, showLegendTable, mapTransforms);
        setSelectedWhiteoutId(newBox.id);
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
          const newLabel = String(mapPins.filter(p => p.type === 'circle').length + 1);
          const newPins: MapPinT[] = [...mapPins, { id: Date.now(), x, y, label: newLabel, type: 'circle', size: 1, rotation: 0, mapIndex: currentMapIndex, textRotation: -(mapRotations[currentMapIndex] || 0) }];
          setMapPins(newPins);
          const newRows: MapRow[] = [...mapRows, { id: Date.now(), symbol: newLabel, part: '', photoNo: '', remarks: '', mapIndex: currentMapIndex }];
          setMapRows(newRows);
          saveProjectMapData(newPins, newRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms);

        } else if (editingMode === 'dimension') {
          if (!drawingStartPoint) {
            setDrawingStartPoint({ x, y }); 
          } else {
            const newLineId = Date.now();
            const newDimLines: DimensionLine[] = [...mapDimensionLines, {
              id: newLineId, start: drawingStartPoint, end: { x, y }, text: "", size: 2, color: activeColor, mapIndex: currentMapIndex, textRotation: -(mapRotations[currentMapIndex] || 0)
            }];
            setMapDimensionLines(newDimLines);
            saveProjectMapData(mapPins, mapRows, newDimLines, whiteoutBoxes, showLegendTable, mapTransforms);
            setDrawingStartPoint(null); 
            setSelectedDimensionLineId(newLineId); 
          }
        }
      }
      setPendingActionInfo(null);
    }
  }, [editingMode, whiteoutStart, whiteoutCurrent, pendingActionInfo, mapPins, mapRows, mapDimensionLines, whiteoutBoxes, currentMapIndex, drawingStartPoint, activeColor, showLegendTable, mapRotations, mapTransforms, saveProjectMapData]);

  const updateDimensionLine = useCallback((lineId: number, newProps: Partial<DimensionLine>) => {
    setMapDimensionLines(prev => {
      const newDimLines = prev.map(l => l.id === lineId ? { ...l, ...newProps } : l);
      saveProjectMapData(mapPins, mapRows, newDimLines, whiteoutBoxes, showLegendTable, mapTransforms);
      return newDimLines;
    });
  }, [mapPins, mapRows, whiteoutBoxes, showLegendTable, mapTransforms, saveProjectMapData]);

  const removeDimensionLine = useCallback((lineId: number) => {
    setMapDimensionLines(prev => {
      const newDimLines = prev.filter(l => l.id !== lineId);
      saveProjectMapData(mapPins, mapRows, newDimLines, whiteoutBoxes, showLegendTable, mapTransforms);
      return newDimLines;
    });
    setSelectedDimensionLineId(null);
  }, [mapPins, mapRows, whiteoutBoxes, showLegendTable, mapTransforms, saveProjectMapData]);

  const updateMapMarker = useCallback((pinId: number, newProps: Partial<MapPinT>) => {
    setMapPins(prev => {
      const newPins = prev.map(p => p.id === pinId ? { ...p, ...newProps } : p);
      saveProjectMapData(newPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms);
      return newPins;
    });
  }, [mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, saveProjectMapData]);

  const removeMapMarker = useCallback((pinId: number) => {
    setMapPins(prev => {
      const newPins = prev.filter(p => p.id !== pinId);
      saveProjectMapData(newPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms);
      return newPins;
    });
    setSelectedPinId(null);
  }, [mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, saveProjectMapData]);

  const updateWhiteout = useCallback((boxId: number, newProps: Partial<WhiteoutBox>) => {
    setWhiteoutBoxes(prev => {
      const newBoxes = prev.map(b => b.id === boxId ? { ...b, ...newProps } : b);
      saveProjectMapData(mapPins, mapRows, mapDimensionLines, newBoxes, showLegendTable, mapTransforms);
      return newBoxes;
    });
  }, [mapPins, mapRows, mapDimensionLines, showLegendTable, mapTransforms, saveProjectMapData]);

  const removeWhiteout = useCallback((boxId: number) => {
    setWhiteoutBoxes(prev => {
      const newBoxes = prev.filter(b => b.id !== boxId);
      saveProjectMapData(mapPins, mapRows, mapDimensionLines, newBoxes, showLegendTable, mapTransforms);
      return newBoxes;
    });
    setSelectedWhiteoutId(null);
  }, [mapPins, mapRows, mapDimensionLines, showLegendTable, mapTransforms, saveProjectMapData]);

  const updateMapRow = useCallback((rowId: number, newProps: Partial<MapRow>) => {
    setMapRows(prev => prev.map(r => r.id === rowId ? { ...r, ...newProps } : r));
  }, []);

  const removeMapRow = useCallback((rowId: number) => {
    setMapRows(prev => {
      const newRows = prev.filter(r => r.id !== rowId);
      saveProjectMapData(mapPins, newRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms);
      return newRows;
    });
    setSelectedRowId(null);
  }, [mapPins, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms, saveProjectMapData]);

  const currentMapPins = useMemo(() => mapPins.filter(p => (p.mapIndex || 0) === currentMapIndex), [mapPins, currentMapIndex]);
  const currentMapDimensionLines = useMemo(() => mapDimensionLines.filter(l => (l.mapIndex || 0) === currentMapIndex), [mapDimensionLines, currentMapIndex]);
  const currentMapRows = useMemo(() => mapRows.filter(r => (r.mapIndex || 0) === currentMapIndex), [mapRows, currentMapIndex]);
  const currentWhiteoutBoxes = useMemo(() => whiteoutBoxes.filter(b => (b.mapIndex || 0) === currentMapIndex), [whiteoutBoxes, currentMapIndex]);

  const currentMapUrl = project?.mapUrls?.[currentMapIndex];
  const currentRotation = mapRotations[currentMapIndex] || 0;
  const currentTransform = mapTransforms[currentMapIndex] || { scale: 1, x: 0, y: 0 };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 lg:p-6 font-sans pb-40 select-none overflow-x-hidden">
      <div className="max-w-7xl mx-auto pb-12">
        <div className="flex flex-col xl:flex-row justify-between xl:items-center mb-8 gap-6 no-print">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-600 font-black text-xl px-4 py-2 hover:bg-blue-50 rounded-2xl transition-all active:scale-95"><ArrowLeft strokeWidth={4} /> 戻る</button>
            <h1 className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tighter">屋根伏図・位置図の編集</h1>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex justify-between sm:justify-start items-center gap-3 sm:pr-5 sm:border-r border-gray-100">
               <div className="flex items-center gap-2">
                 <FileText className={`w-6 h-6 ${showLegendTable ? 'text-blue-500' : 'text-gray-300'}`}/>
                 <span className="font-bold text-gray-600">凡例表を</span>
               </div>
               <div className="flex items-center gap-2">
                 <button onClick={() => { const newState = !showLegendTable; setShowLegendTable(newState); saveProjectMapData(mapPins, mapRows, mapDimensionLines, whiteoutBoxes, newState, mapTransforms); }} className={`relative inline-flex h-9 w-18 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${showLegendTable ? 'bg-blue-600' : 'bg-gray-200'}`}>
                    <span className="sr-only">Toggle Legend</span>
                    <span aria-hidden="true" className={`inline-block h-8 w-8 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showLegendTable ? 'translate-x-9' : 'translate-x-0'}`} />
                 </button>
                 <span className={`font-black w-10 ${showLegendTable ? 'text-blue-600' : 'text-gray-400'}`}>{showLegendTable ? '表示' : '非表示'}</span>
               </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-gray-500 mr-1 w-full sm:w-auto">描画ツール:</span>
              <button onClick={() => { setEditingMode('pan'); setDrawingStartPoint(null); }} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 lg:px-6 py-3 rounded-xl font-black transition-all ${editingMode === 'pan' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}><Move className="w-5 h-5"/> 印刷枠調整</button>
              <button onClick={() => { setEditingMode('pin'); setDrawingStartPoint(null); }} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 lg:px-6 py-3 rounded-xl font-black transition-all ${editingMode === 'pin' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}><MapPin className="w-5 h-5"/> 番号ピン</button>
              <button onClick={() => { setEditingMode('dimension'); setDrawingStartPoint(null); }} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 lg:px-6 py-3 rounded-xl font-black transition-all ${editingMode === 'dimension' ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}><Ruler className="w-5 h-5"/> 線・寸法</button>
              <button onClick={() => { setEditingMode('whiteout'); setDrawingStartPoint(null); }} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 lg:px-6 py-3 rounded-xl font-black transition-all ${editingMode === 'whiteout' ? 'bg-yellow-400 text-gray-900 shadow-lg' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}><Eraser className="w-5 h-5"/> 文字消し</button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6 no-print p-2 bg-gray-100 rounded-2xl w-fit items-center">
          {project?.mapUrls?.map((_, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <button onClick={() => setCurrentMapIndex(idx)} className={`px-6 py-3 rounded-xl text-lg font-black transition-all ${currentMapIndex === idx ? 'bg-white text-blue-600 shadow-md' : 'text-gray-500 hover:bg-white/50'}`}>図面 {idx + 1}</button>
              <button onClick={() => deleteMapPhoto(idx)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-100 rounded-lg transition-colors" title="この位置図を削除"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <label className="flex items-center gap-2 px-4 py-3 rounded-xl text-lg font-black text-gray-500 border-2 border-dashed border-gray-300 hover:bg-white/50 cursor-pointer transition-all" title="図面を追加">
            <Plus className="w-5 h-5" /> 追加
            <input ref={addInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => uploadMapImage(e, 'add')} disabled={isSaving} />
          </label>
        </div>

        <div className={`grid ${showLegendTable ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'} gap-8 items-start`}>
          
          <div className={`${showLegendTable ? 'lg:col-span-8' : 'w-full max-w-4xl mx-auto'} bg-white p-4 lg:p-8 rounded-[2rem] lg:rounded-[3rem] border-2 border-gray-100 shadow-2xl relative`}>
            {editingMode === 'dimension' && (
              <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-100 rounded-2xl border border-gray-200 mb-6">
                 <Paintbrush className="w-5 h-5 text-gray-500"/>
                 <span className="font-bold text-gray-600 mr-2">線の色：</span>
                {COLOR_PALETTE.map(color => (
                  <button key={color.name} onClick={() => setActiveColor(color.value)} className={`w-10 h-10 rounded-full border-4 transition-all ${activeColor === color.value ? 'border-gray-900 scale-110 shadow-lg' : 'border-white hover:scale-105'}`} style={{ backgroundColor: color.value }} />
                ))}
                <label className={`w-10 h-10 rounded-full border-4 transition-all cursor-pointer overflow-hidden flex items-center justify-center hover:scale-105 ${!COLOR_PALETTE.some(c => c.value === activeColor) ? 'border-gray-900 scale-110 shadow-lg' : 'border-white'}`} style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} title="自由色">
                  <input type="color" value={activeColor} onChange={(e) => setActiveColor(e.target.value)} className="opacity-0 absolute w-px h-px" />
                </label>
              </div>
            )}
            
            {uploadProgress && (
              <div className="mt-2 mb-2 flex items-center gap-3 px-5 py-3 bg-blue-50 border border-blue-200 rounded-2xl text-blue-700 font-bold text-sm">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                {uploadProgress}
              </div>
            )}

            <div className="w-full flex justify-center mt-2 relative">
              {currentMapUrl ? (
                <div className="relative flex flex-col items-center w-full">
                  
                  {editingMode === 'pan' && (
                     <div className="absolute -top-16 lg:-top-20 z-50 flex items-center gap-4 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl">
                        <span className="font-black whitespace-nowrap">🔍 ズーム:</span>
                        <input type="range" min="0.2" max="4" step="0.05" value={currentTransform.scale} onChange={(e) => updateTransform(currentMapIndex, { scale: parseFloat(e.target.value) })} onMouseUp={() => saveProjectMapData(mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms)} onTouchEnd={() => saveProjectMapData(mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms)} className="w-32 lg:w-48 accent-indigo-500 cursor-pointer" />
                        <span className="font-bold w-12 text-center text-sm">{Math.round(currentTransform.scale * 100)}%</span>
                        <button onClick={() => { updateTransform(currentMapIndex, { scale: 1, x: 0, y: 0 }); saveProjectMapData(mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms); }} className="ml-2 px-4 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-full font-bold text-xs transition-colors whitespace-nowrap">リセット</button>
                     </div>
                  )}

                  <div className={`absolute top-3 right-3 z-30 flex items-center gap-1.5 transition-opacity duration-200 ${isDraggingWhiteout ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    <button onClick={() => rotateCurrentMap(-90)} className="p-2 bg-white/90 hover:bg-white text-gray-700 rounded-xl shadow border border-gray-200 transition-all" title="左に90°回転"><RotateCcw className="w-4 h-4" /></button>
                    <button onClick={() => rotateCurrentMap(90)} className="p-2 bg-white/90 hover:bg-white text-gray-700 rounded-xl shadow border border-gray-200 transition-all" title="右に90°回転"><RotateCw className="w-4 h-4" /></button>
                    <label className="flex items-center gap-1.5 px-3 py-2 bg-white/90 hover:bg-white text-gray-700 text-xs font-bold rounded-xl shadow cursor-pointer border border-gray-200 transition-all" title="この図面を差し替え">
                      <UploadCloud className="w-4 h-4" /> 差し替え
                      <input ref={replaceInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => uploadMapImage(e, 'replace')} disabled={isSaving} />
                    </label>
                  </div>

                  <div
                    className={`relative overflow-hidden bg-[#e2e8f0] shadow-inner transition-all w-full flex items-center justify-center ${editingMode === 'pan' ? 'ring-4 ring-indigo-500 ring-offset-4 cursor-move' : 'border-2 border-gray-300'}`}
                    style={{ 
                      aspectRatio: showLegendTable ? '194/120' : '175/255',
                      maxHeight: '70vh',
                      maxWidth: showLegendTable ? '100%' : 'auto'
                    }}
                    onPointerDown={handlePanPointerDown}
                    onPointerMove={handlePanPointerMove}
                    onPointerUp={handlePanPointerUp}
                    onPointerCancel={handlePanPointerUp}
                  >
                    <div className={`absolute inset-0 border-4 border-red-500 border-dashed z-40 pointer-events-none transition-opacity ${editingMode === 'pan' ? 'opacity-100' : 'opacity-0'}`}>
                      <div className="absolute top-0 left-0 bg-red-500 text-white font-black text-[10px] px-2 py-0.5 rounded-br-lg">印刷セーフエリア</div>
                    </div>

                    <div
                      className="map-content-wrapper absolute inset-0 flex items-center justify-center transition-transform duration-75"
                      style={{ transform: `translate(${currentTransform.x}%, ${currentTransform.y}%) scale(${currentTransform.scale}) rotate(${currentRotation}deg)`, transformOrigin: 'center center' }}
                    >
                      <img
                        src={proxyUrl(currentMapUrl, `map_${currentMapIndex}_${sessionId}`)}
                        crossOrigin="anonymous"
                        className="block w-full h-full object-contain pointer-events-none"
                        alt=""
                      />
                      
                      <div 
                        className="absolute inset-0 z-0 touch-none"
                        style={{ cursor: editingMode === 'pan' ? 'move' : 'crosshair' }}
                        onPointerDown={handleMapPointerDown}
                        onPointerMove={handleMapPointerMove}
                        onPointerUp={handleMapPointerUp}
                        onPointerCancel={handleMapPointerUp}
                      />

                      {isDraggingWhiteout && whiteoutCurrent && (
                        <div
                          className="absolute bg-blue-500/30 border-2 border-blue-500 pointer-events-none z-50"
                          style={{
                            left: `${Math.min(whiteoutStart.x, whiteoutCurrent.x)}%`,
                            top: `${Math.min(whiteoutStart.y, whiteoutCurrent.y)}%`,
                            width: `${Math.abs(whiteoutStart.x - whiteoutCurrent.x)}%`,
                            height: `${Math.abs(whiteoutStart.y - whiteoutCurrent.y)}%`,
                          }}
                        />
                      )}

                      {currentWhiteoutBoxes.map(box => (
                        <WhiteoutMarker key={box.id} box={box} rotation={currentRotation} currentScale={currentTransform.scale} isSelected={selectedWhiteoutId === box.id} onDragEnd={(x, y) => updateWhiteout(box.id, { x, y })} onClick={() => {if(editingMode !== 'pan') setSelectedWhiteoutId(box.id)}} onSizeChange={(updates) => updateWhiteout(box.id, updates)} onRemove={() => removeWhiteout(box.id)} />
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

                  {editingMode !== 'pan' && (
                    <div className={`absolute top-4 left-4 lg:top-6 lg:left-6 bg-black/80 backdrop-blur text-white text-xs lg:text-sm px-4 lg:px-6 py-2 lg:py-3 rounded-full font-black shadow-2xl border-2 border-white/20 z-10 flex items-center gap-2 transition-opacity duration-200 ${isDraggingWhiteout ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                      {editingMode === 'pin' && <><LayoutGrid className="w-4 h-4 text-red-400"/> タップでピンを追加</>}
                      {editingMode === 'dimension' && !drawingStartPoint && <><Ruler className="w-4 h-4 text-blue-400"/> 線の始点をタップ</>}
                      {editingMode === 'dimension' && drawingStartPoint && (
                        <>
                          <Ruler className="w-4 h-4 text-yellow-400"/> 線の終点をタップ
                          <button type="button" onClick={(e) => { e.stopPropagation(); setDrawingStartPoint(null); }} className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-white font-black text-xs border border-white/30 transition-colors">✕ 取消</button>
                        </>
                      )}
                      {editingMode === 'whiteout' && <><Eraser className="w-4 h-4 text-yellow-400"/> 隠したい文字の上をドラッグ</>}
                    </div>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors w-full h-96 border-4 border-dashed border-gray-300 rounded-3xl group">
                  <UploadCloud className="w-20 h-20 mb-4 text-blue-400 group-hover:scale-110 transition-transform" />
                  <span className="text-2xl font-black text-blue-600 block mb-2">図面・位置図をアップロード</span>
                  <span className="text-sm font-bold text-gray-500">ここをタップして画像またはPDFを選択してください</span>
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => uploadMapImage(e, 'add')} disabled={isSaving} />
                </label>
              )}
            </div>

            {selectedPinId !== null && (() => {
              const pin = currentMapPins.find(p => p.id === selectedPinId);
              if (!pin) return null;
              const currentSize = pin.size || 1;
              return (
                <div className="mt-4 flex items-center justify-center gap-3 p-3 bg-gray-50 border-2 border-red-100 rounded-2xl animate-fade-in-up">
                  <span className="text-sm font-bold text-gray-500">ピンサイズ</span>
                  <button type="button" onClick={() => updateMapMarker(selectedPinId, { size: Math.max(0.3, Math.round((currentSize - 0.1) * 10) / 10) })} className="w-10 h-10 flex items-center justify-center text-xl font-bold bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-100 active:scale-95 shadow-sm">ー</button>
                  <span className="w-12 text-center font-black text-gray-700">{currentSize.toFixed(1)}x</span>
                  <button type="button" onClick={() => updateMapMarker(selectedPinId, { size: Math.min(3, Math.round((currentSize + 0.1) * 10) / 10) })} className="w-10 h-10 flex items-center justify-center text-xl font-bold bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-100 active:scale-95 shadow-sm">＋</button>
                  <div className="w-px h-8 bg-gray-200 mx-1" />
                  <button type="button" onClick={() => { removeMapMarker(selectedPinId); setSelectedPinId(null); }} className="flex items-center gap-1.5 px-4 py-2 bg-red-50 border-2 border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-100 active:scale-95 text-sm">
                    <Trash2 className="w-4 h-4" /> 削除
                  </button>
                </div>
              );
            })()}
          </div>

          {showLegendTable && (
            <div className="lg:col-span-4 bg-white p-6 lg:p-8 rounded-[2rem] lg:rounded-[3rem] border-2 border-gray-100 shadow-2xl space-y-6">
              <h3 className="text-2xl lg:text-3xl font-black text-gray-900 flex items-center gap-3 border-b-4 border-gray-100 pb-4"><FileText className="text-blue-500 w-8 h-8"/> 凡例（項目欄）</h3>
              <div className="border-2 border-gray-200 rounded-2xl overflow-hidden shadow-inner">
                <div className="grid grid-cols-12 text-xs lg:text-sm font-black bg-gray-100 border-b-2 border-gray-200 text-gray-600">
                  <div className="col-span-2 py-3 text-center border-r-2 border-gray-200">符号</div>
                  <div className="col-span-4 py-3 text-center border-r-2 border-gray-200">部位</div>
                  <div className="col-span-5 py-3 text-center border-r-2 border-gray-200">備考</div>
                  <div className="col-span-1 py-3 text-center text-gray-400">削</div>
                </div>
                {currentMapRows.length > 0 ? currentMapRows.map((row) => (
                  <LegendRow 
                    key={row.id} row={row} isSelected={selectedRowId === row.id} 
                    onSelect={() => setSelectedRowId(row.id)} onChange={(updates) => updateMapRow(row.id, updates)} 
                    onRemove={() => removeMapRow(row.id)} 
                  />
                )) : (
                  <div className="text-center py-8 text-gray-400 font-bold bg-gray-50 text-sm">ピンを追加すると<br/>ここに行が追加されます</div>
                )}
              </div>
              <button onClick={() => { const newRows = [...mapRows, { id: Date.now(), symbol: '', part: '', photoNo: '', remarks: '', mapIndex: currentMapIndex }]; setMapRows(newRows); saveProjectMapData(mapPins, newRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms); }} className="w-full bg-gray-100 text-gray-800 font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-200 active:scale-95"><Plus className="w-5 h-5"/> 行を手動追加</button>
            </div>
          )}
        </div>

        <button onClick={() => saveProjectMapData(mapPins, mapRows, mapDimensionLines, whiteoutBoxes, showLegendTable, mapTransforms).then(() => alert('保存しました'))} disabled={isSaving} className="fixed bottom-6 right-6 lg:bottom-10 lg:right-10 z-50 bg-blue-600 text-white font-black px-6 py-4 lg:px-10 lg:py-6 text-xl lg:text-2xl rounded-full lg:rounded-3xl shadow-3xl hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50"><Save className="w-6 h-6 lg:w-8 lg:h-8"/> {isSaving ? '保存中...' : '位置図を保存'}</button>

      </div>
    </div>
  );
}