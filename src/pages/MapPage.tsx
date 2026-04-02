import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, MapPin, CaseUpper, FileText, LayoutGrid, Ruler, Paintbrush, Save, UploadCloud } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';
import type { MapPin as MapPinT, MapRow, Project, DimensionLine } from '../types';
import { useDraggablePin, proxyUrl } from '../shared/utils';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';

// ★ 妥協なし！PDF変換ライブラリを本気で導入
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const DEFAULT_MAP_PART_NAMES = ['軒先', '袖', 'ケラバ', '谷', '棟', '隅棟', '平'];

const COLOR_PALETTE = [
  { name: "Yellow", value: "#FFD700" },
  { name: "White", value: "#FFFFFF" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Red", value: "#ef4444" },
];

const DimensionLineMarker = React.memo(({ line, isSelected, onSelect, onRemove, onTextChange, onUpdate }: { line: DimensionLine; isSelected: boolean; onSelect: () => void; onRemove: () => void; onTextChange: (text: string) => void; onUpdate: (props: Partial<DimensionLine>) => void; }) => {
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
    const rect = (e.currentTarget as Element).closest('.relative.inline-block')?.getBoundingClientRect();
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
  const safePopupX = Math.max(20, Math.min(80, midPoint.x));
  const isUpperHalf = midPoint.y < 50;
  const offsetY = isUpperHalf ? '+ 140px' : '- 140px';
  const color = line.color || "#FFFFFF"; 
  const thickness = Number(line.size || 2); 

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
        <div style={{ left: `${safePopupX}%`, top: `calc(${midPoint.y}% ${offsetY})` }} className="absolute z-30 translate-x-[-50%] translate-y-[-50%] flex flex-col items-center gap-3 bg-white p-5 rounded-2xl shadow-3xl border-2 border-gray-100 min-w-[300px]" onPointerDown={e => e.stopPropagation()}>
          <div className="flex w-full gap-2 items-center justify-between border-b border-gray-100 pb-2">
             <h4 className="text-base font-black text-gray-900 flex items-center gap-1"><CaseUpper className="w-4 h-4 text-blue-500"/> 文字と線</h4>
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
              <button key={name} onClick={() => addPartName(name)} className="text-sm font-black text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all">＋{name}</button>
            ))}
          </div>
          <input ref={inputRef} type="text" value={line.text} onChange={(e) => onTextChange(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-3 text-lg font-bold rounded-xl outline-none focus:border-blue-400 focus:bg-white text-center shadow-inner placeholder:font-normal" placeholder="例: 軒先 5.5m (空欄も可)" />
        </div>
      )}

      {isSelected && (
        <>
          <div
            className="absolute z-40 w-12 h-12 -ml-6 -mt-6 bg-blue-500/30 border-4 border-blue-500 rounded-full cursor-move touch-none backdrop-blur-sm"
            style={{ left: `${localStart.x}%`, top: `${localStart.y}%` }}
            onPointerDown={(e) => startDrag(e, 'start')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          <div
            className="absolute z-40 w-12 h-12 -ml-6 -mt-6 bg-blue-500/30 border-4 border-blue-500 rounded-full cursor-move touch-none backdrop-blur-sm"
            style={{ left: `${localEnd.x}%`, top: `${localEnd.y}%` }}
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
            fontSize: `${14 + (thickness - 2) * 4}px` 
          }}
          className={`absolute translate-x-[-50%] translate-y-[-50%] font-bold px-2 py-0.5 rounded pointer-events-none whitespace-nowrap border border-white/20 shadow-sm ${isSelected ? 'z-40' : 'z-20'}`}
        >
          {line.text}
        </div>
      )}
    </>
  );
});

const MapMarker = React.memo(({ pin, isSelected, onDragEnd, onClick, onSizeChange, onRemove }: { pin: MapPinT; isSelected: boolean; onDragEnd: (x: number, y: number) => void; onClick: () => void; onSizeChange: (newSize: number) => void; onRemove: () => void; }) => {
  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(pin.x, pin.y, onDragEnd);
  const currentSize = pin.size || 1; 

  return (
    <>
      <div
        ref={containerRef}
        onPointerDown={(e) => { e.stopPropagation(); onMouseDown(e as any); }}
        onTouchStart={(e) => { e.stopPropagation(); onTouchStart(e); }}
        onClick={(e) => { e.stopPropagation(); if (!dragging) onClick(); }}
        style={{ left: `${position.x}%`, top: `${position.y}%`, transform: `translate(-50%, -50%) scale(${currentSize})`, touchAction: 'none', zIndex: isSelected ? 100 : (dragging ? 30 : 10) }}
        className={`absolute flex items-center justify-center cursor-pointer transition-all duration-75 ${dragging ? 'opacity-80' : ''} ${isSelected && !dragging ? 'ring-4 ring-red-500 ring-offset-2 ring-offset-white/50 rounded-full' : ''}`}
      >
        {pin.type === 'arrow' ? (
          <div className="flex items-center gap-1 drop-shadow-md bg-white/70 px-2 py-0.5 rounded-lg border border-red-200"><span className="text-red-600 font-black text-2xl leading-none" style={{ transform: `rotate(${pin.rotation || 0}deg)` }}>➡</span><span className="text-red-600 font-bold text-xl">{pin.label}</span></div>
        ) : (
          <div className="relative flex items-center justify-center"><div className="w-14 h-14 rounded-full border-[4px] border-red-600 shadow-sm bg-red-600/10"></div><span className="absolute text-red-600 font-black text-xl drop-shadow-md bg-white/50 px-1 rounded">{pin.label}</span></div>
        )}
      </div>

      {isSelected && !dragging && (
        <div style={{ left: `${position.x}%`, top: `${position.y + 10 * currentSize}%`, transform: 'translateX(-50%)' }} className="absolute z-40 flex bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden" onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => onSizeChange(Math.min(3, Math.round((currentSize + 0.1) * 10) / 10))} className="px-4 py-2 text-xl font-bold hover:bg-gray-100 text-gray-700 border-r">＋</button>
          <button onClick={() => onSizeChange(Math.max(0.3, Math.round((currentSize - 0.1) * 10) / 10))} className="px-4 py-2 text-xl font-bold hover:bg-gray-100 text-gray-700 border-r">ー</button>
          <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="px-4 py-2 text-red-500 hover:bg-red-50 active:bg-red-100"><Trash2 className="w-5 h-5"/></button>
        </div>
      )}
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
  
  const [selectedPinId, setSelectedPinId] = useState<number | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [selectedDimensionLineId, setSelectedDimensionLineId] = useState<number | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentMapIndex, setCurrentMapIndex] = useState(0);

  const [editingMode, setEditingMode] = useState<'pin' | 'dimension'>('pin');
  const [drawingStartPoint, setDrawingStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeColor, setActiveColor] = useState<string>(COLOR_PALETTE[0].value); 

  const [showLegendTable, setShowLegendTable] = useState(true);

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
        } else { setError('プロジェクトが見つかりません。'); }
      } catch { setError('データの読み込みに失敗しました。'); } finally { setLoading(false); }
    };
    fetchData();
  }, [id]);

  const saveProjectMapData = useCallback(async (newPins: MapPinT[], newRows: MapRow[], newDimLines: DimensionLine[], newTableShow: boolean) => {
    if (!id) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'projects', id), {
        mapPins: newPins,
        mapRows: newRows,
        mapDimensionLines: newDimLines,
        showLegendTable: newTableShow,
      });
    } catch { setError('保存に失敗しました。'); } finally { setIsSaving(false); }
  }, [id]);

  // ★ 復活＆完全版！PDFファイルを超高画質の画像（JPEG）に自動変換してアップロード！
  const uploadMapImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!project || !id || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setIsSaving(true);

    try {
      let fileToUpload = file;

      if (file.type === 'application/pdf') {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const page = await pdf.getPage(1); 

          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas context not found');

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          // ★ TypeScriptのエラー（赤い波線）を回避する魔法（any型によるキャスト）
          const renderContext: any = {
            canvasContext: ctx,
            viewport: viewport
          };
          await page.render(renderContext).promise;

          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
          if (!blob) throw new Error('Blob conversion failed');

          fileToUpload = new File([blob], file.name.replace(/\.pdf$/i, '.jpg'), { type: 'image/jpeg' });
        } catch (pdfError) {
          console.error("PDFの画像変換に失敗しました:", pdfError);
          alert('PDFの読み取りに失敗しました。パスワード保護されているか、特殊な形式の可能性があります。');
          setIsSaving(false);
          return;
        }
      }

      const storageRef = ref(storage, `maps/${id}/${Date.now()}_${fileToUpload.name}`);
      await uploadBytes(storageRef, fileToUpload);
      const url = await getDownloadURL(storageRef);

      const newMapUrls = [...(project.mapUrls || [])];
      newMapUrls[currentMapIndex] = url;

      setProject(prev => prev ? { ...prev, mapUrls: newMapUrls } : null);
      await updateDoc(doc(db, 'projects', id), { mapUrls: newMapUrls });
    } catch (error) {
      alert('図面のアップロードに失敗しました。電波の良いところでお試しください。');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteMapPhoto = useCallback(async (mapIndex: number) => {
    if (!project || !id) return;
    if (!window.confirm('この位置図を削除しますか？ピンや凡例データも削除されます。')) return;

    const urlToDelete = project.mapUrls?.[mapIndex];
    if (urlToDelete) {
      try { await deleteObject(ref(storage, urlToDelete)); } catch { /* Storage削除失敗は無視 */ }
    }

    const newMapUrls = (project.mapUrls || []).filter((_, i) => i !== mapIndex);
    const reindex = (idx: number) => idx > mapIndex ? idx - 1 : idx;
    const newPins = mapPins.filter(p => (p.mapIndex || 0) !== mapIndex).map(p => ({ ...p, mapIndex: reindex(p.mapIndex || 0) }));
    const newRows = mapRows.filter(r => (r.mapIndex || 0) !== mapIndex).map(r => ({ ...r, mapIndex: reindex(r.mapIndex || 0) }));
    const newDimLines = mapDimensionLines.filter(l => (l.mapIndex || 0) !== mapIndex).map(l => ({ ...l, mapIndex: reindex(l.mapIndex || 0) }));

    setMapPins(newPins);
    setMapRows(newRows);
    setMapDimensionLines(newDimLines);
    setProject({ ...project, mapUrls: newMapUrls });
    
    const nextIndex = currentMapIndex >= newMapUrls.length ? Math.max(0, newMapUrls.length - 1) : currentMapIndex;
    setCurrentMapIndex(nextIndex);

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'projects', id), { mapUrls: newMapUrls, mapPins: newPins, mapRows: newRows, mapDimensionLines: newDimLines });
    } catch { setError('削除に失敗しました。'); } finally { setIsSaving(false); }
  }, [project, id, mapPins, mapRows, mapDimensionLines, currentMapIndex]);

  const handleMapPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (editingMode === 'pin') {
      if (selectedPinId !== null) { setSelectedPinId(null); return; }
      const newLabel = String(mapPins.filter(p => p.type === 'circle').length + 1);
      const newPins: MapPinT[] = [...mapPins, { id: Date.now(), x, y, label: newLabel, type: 'circle', size: 1, rotation: 0, mapIndex: currentMapIndex }];
      setMapPins(newPins);
      setSelectedPinId(null);
      const newRows: MapRow[] = [...mapRows, { id: Date.now(), symbol: newLabel, part: '', photoNo: '', remarks: '', mapIndex: currentMapIndex }];
      setMapRows(newRows);
      saveProjectMapData(newPins, newRows, mapDimensionLines, showLegendTable);

    } else if (editingMode === 'dimension') {
      if (selectedDimensionLineId !== null) { setSelectedDimensionLineId(null); return; }
      
      if (!drawingStartPoint) {
        setDrawingStartPoint({ x, y }); 
      } else {
        const newLineId = Date.now();
        const newDimLines: DimensionLine[] = [...mapDimensionLines, {
          id: newLineId, start: drawingStartPoint, end: { x, y }, text: "", size: 2, color: activeColor, mapIndex: currentMapIndex
        }];
        setMapDimensionLines(newDimLines);
        saveProjectMapData(mapPins, mapRows, newDimLines, showLegendTable);
        setDrawingStartPoint(null); 
        setSelectedDimensionLineId(newLineId); 
      }
    }
  }, [editingMode, selectedPinId, selectedDimensionLineId, mapPins, mapRows, mapDimensionLines, currentMapIndex, drawingStartPoint, activeColor, showLegendTable, saveProjectMapData]);

  const updateDimensionLine = useCallback((lineId: number, newProps: Partial<DimensionLine>) => {
    setMapDimensionLines(prev => {
      const newDimLines = prev.map(l => l.id === lineId ? { ...l, ...newProps } : l);
      saveProjectMapData(mapPins, mapRows, newDimLines, showLegendTable);
      return newDimLines;
    });
  }, [mapPins, mapRows, showLegendTable, saveProjectMapData]);

  const removeDimensionLine = useCallback((lineId: number) => {
    setMapDimensionLines(prev => {
      const newDimLines = prev.filter(l => l.id !== lineId);
      saveProjectMapData(mapPins, mapRows, newDimLines, showLegendTable);
      return newDimLines;
    });
    setSelectedDimensionLineId(null);
  }, [mapPins, mapRows, showLegendTable, saveProjectMapData]);

  const updateMapMarker = useCallback((pinId: number, newProps: Partial<MapPinT>) => {
    setMapPins(prev => {
      const newPins = prev.map(p => p.id === pinId ? { ...p, ...newProps } : p);
      saveProjectMapData(newPins, mapRows, mapDimensionLines, showLegendTable);
      return newPins;
    });
  }, [mapRows, mapDimensionLines, showLegendTable, saveProjectMapData]);

  const removeMapMarker = useCallback((pinId: number) => {
    setMapPins(prev => {
      const newPins = prev.filter(p => p.id !== pinId);
      saveProjectMapData(newPins, mapRows, mapDimensionLines, showLegendTable);
      return newPins;
    });
    setSelectedPinId(null);
  }, [mapRows, mapDimensionLines, showLegendTable, saveProjectMapData]);

  const updateMapRow = useCallback((rowId: number, newProps: Partial<MapRow>) => {
    setMapRows(prev => prev.map(r => r.id === rowId ? { ...r, ...newProps } : r));
  }, []);

  const removeMapRow = useCallback((rowId: number) => {
    setMapRows(prev => {
      const newRows = prev.filter(r => r.id !== rowId);
      saveProjectMapData(mapPins, newRows, mapDimensionLines, showLegendTable);
      return newRows;
    });
    setSelectedRowId(null);
  }, [mapPins, mapDimensionLines, showLegendTable, saveProjectMapData]);

  const currentMapPins = useMemo(() => mapPins.filter(p => (p.mapIndex || 0) === currentMapIndex), [mapPins, currentMapIndex]);
  const currentMapDimensionLines = useMemo(() => mapDimensionLines.filter(l => (l.mapIndex || 0) === currentMapIndex), [mapDimensionLines, currentMapIndex]);
  const currentMapRows = useMemo(() => mapRows.filter(r => (r.mapIndex || 0) === currentMapIndex), [mapRows, currentMapIndex]);

  const currentMapUrl = project?.mapUrls?.[currentMapIndex];
  const totalMaps = project?.mapUrls?.length || 0;

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 lg:p-6 font-sans pb-40 select-none overflow-x-hidden" onPointerDown={() => { setSelectedPinId(null); setSelectedRowId(null); setSelectedDimensionLineId(null); }}>
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
                 <button onClick={() => { const newState = !showLegendTable; setShowLegendTable(newState); saveProjectMapData(mapPins, mapRows, mapDimensionLines, newState); }} className={`relative inline-flex h-9 w-18 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${showLegendTable ? 'bg-blue-600' : 'bg-gray-200'}`}>
                    <span className="sr-only">Toggle Legend</span>
                    <span aria-hidden="true" className={`inline-block h-8 w-8 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showLegendTable ? 'translate-x-9' : 'translate-x-0'}`} />
                 </button>
                 <span className={`font-black w-10 ${showLegendTable ? 'text-blue-600' : 'text-gray-400'}`}>{showLegendTable ? '表示' : '非表示'}</span>
               </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-gray-500 mr-1 w-full sm:w-auto">描画ツール:</span>
              <button onClick={() => { setEditingMode('pin'); setDrawingStartPoint(null); }} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 lg:px-6 py-3 rounded-xl font-black transition-all ${editingMode === 'pin' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}><MapPin className="w-5 h-5"/> 番号ピン</button>
              <button onClick={() => { setEditingMode('dimension'); setDrawingStartPoint(null); }} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 lg:px-6 py-3 rounded-xl font-black transition-all ${editingMode === 'dimension' ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}><Ruler className="w-5 h-5"/> 線・寸法</button>
            </div>
          </div>
        </div>

        {/* タブと追加ボタン */}
        <div className="flex flex-wrap gap-2 mb-6 no-print p-2 bg-gray-100 rounded-2xl w-fit items-center">
          {project?.mapUrls?.map((_, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <button onClick={() => setCurrentMapIndex(idx)} className={`px-6 py-3 rounded-xl text-lg font-black transition-all ${currentMapIndex === idx ? 'bg-white text-blue-600 shadow-md' : 'text-gray-500 hover:bg-white/50'}`}>図面 {idx + 1}</button>
              <button onClick={() => deleteMapPhoto(idx)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-100 rounded-lg transition-colors" title="この位置図を削除"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button
            onClick={() => setCurrentMapIndex(totalMaps)}
            className={`px-4 py-3 rounded-xl text-lg font-black transition-all border-2 border-dashed ${currentMapIndex === totalMaps ? 'bg-white text-blue-600 border-blue-300 shadow-md' : 'text-gray-500 border-gray-300 hover:bg-white/50'}`}
          >
            <Plus className="w-5 h-5 inline-block" /> 追加
          </button>
        </div>

        <div className={`grid ${showLegendTable ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'} gap-8 items-start`}>
          
          <div className={`${showLegendTable ? 'lg:col-span-8' : ''} bg-white p-4 lg:p-8 rounded-[2rem] lg:rounded-[3rem] border-2 border-gray-100 shadow-2xl relative`}>
            {editingMode === 'dimension' && (
              <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-100 rounded-2xl border border-gray-200 mb-6">
                 <Paintbrush className="w-5 h-5 text-gray-500"/>
                 <span className="font-bold text-gray-600 mr-2">線の色：</span>
                {COLOR_PALETTE.map(color => (
                  <button key={color.name} onClick={() => setActiveColor(color.value)} className={`w-10 h-10 rounded-full border-4 transition-all ${activeColor === color.value ? 'border-gray-900 scale-110 shadow-lg' : 'border-white hover:scale-105'}`} style={{ backgroundColor: color.value }} />
                ))}
              </div>
            )}
            
            <div className="w-full min-h-[400px] mt-2 bg-[#f1f5f9] rounded-3xl flex items-center justify-center overflow-hidden border-4 border-dashed border-gray-200 relative">
              {currentMapUrl ? (
                <div className="relative inline-block pointer-events-auto shadow-md">
                  <img src={proxyUrl(currentMapUrl, `map_${currentMapIndex}_${sessionId}`)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full pointer-events-none" style={{ maxHeight: '70vh' }} alt="" />
                  
                  <div 
                    className="absolute inset-0 z-0 cursor-crosshair touch-none"
                    onPointerDown={handleMapPointerDown}
                  />
                  
                  {currentMapDimensionLines.map((line) => (
                    <DimensionLineMarker 
                      key={line.id} line={line} isSelected={selectedDimensionLineId === line.id} 
                      onSelect={() => setSelectedDimensionLineId(line.id)} onRemove={() => removeDimensionLine(line.id)} 
                      onTextChange={(text) => updateDimensionLine(line.id, {text})} onUpdate={(newProps) => updateDimensionLine(line.id, newProps)}
                    />
                  ))}

                  {drawingStartPoint && editingMode === 'dimension' && (
                    <div style={{ left: `${drawingStartPoint.x}%`, top: `${drawingStartPoint.y}%`, backgroundColor: activeColor }} className="absolute w-4 h-4 rounded-full border-2 border-white shadow-xl pointer-events-none z-20 transform -translate-x-1/2 -translate-y-1/2" />
                  )}

                  <div className="absolute top-4 left-4 lg:top-6 lg:left-6 bg-black/80 backdrop-blur text-white text-xs lg:text-sm px-4 lg:px-6 py-2 lg:py-3 rounded-full font-black pointer-events-none shadow-2xl border-2 border-white/20 z-10 flex items-center gap-2">
                    {editingMode === 'pin' ? <><LayoutGrid className="w-4 h-4 text-red-400"/> タップでピンを追加</> : !drawingStartPoint ? <><Ruler className="w-4 h-4 text-blue-400"/> 線の始点をタップ</> : <><Ruler className="w-4 h-4 text-yellow-400"/> 線の終点をタップ</>}
                  </div>

                  {currentMapPins.map(pin => (
                    <MapMarker 
                      key={pin.id} 
                      pin={pin} 
                      isSelected={selectedPinId === pin.id} 
                      onDragEnd={(x, y) => updateMapMarker(pin.id, { x, y })} 
                      onClick={() => setSelectedPinId(pin.id)} 
                      onSizeChange={(size) => updateMapMarker(pin.id, { size })} 
                      onRemove={() => removeMapMarker(pin.id)} 
                    />
                  ))}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors w-full h-full py-24 group">
                  <UploadCloud className="w-20 h-20 mb-4 text-blue-400 group-hover:scale-110 transition-transform" />
                  <span className="text-2xl font-black text-blue-600 block mb-2">図面・位置図をアップロード</span>
                  <span className="text-sm font-bold text-gray-500">ここをタップして画像またはPDFを選択してください</span>
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={uploadMapImage} disabled={isSaving} />
                </label>
              )}
            </div>
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
              <button onClick={() => { const newRows = [...mapRows, { id: Date.now(), symbol: '', part: '', photoNo: '', remarks: '', mapIndex: currentMapIndex }]; setMapRows(newRows); saveProjectMapData(mapPins, newRows, mapDimensionLines, showLegendTable); }} className="w-full bg-gray-100 text-gray-800 font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-200 active:scale-95"><Plus className="w-5 h-5"/> 行を手動追加</button>
            </div>
          )}
        </div>

        <button onClick={() => saveProjectMapData(mapPins, mapRows, mapDimensionLines, showLegendTable).then(() => alert('保存しました'))} disabled={isSaving} className="fixed bottom-6 right-6 lg:bottom-10 lg:right-10 z-50 bg-blue-600 text-white font-black px-6 py-4 lg:px-10 lg:py-6 text-xl lg:text-2xl rounded-full lg:rounded-3xl shadow-3xl hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50"><Save className="w-6 h-6 lg:w-8 lg:h-8"/> {isSaving ? '保存中...' : '位置図を保存'}</button>

      </div>
    </div>
  );
}