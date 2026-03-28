import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, MapPin, CaseUpper, FileText, LayoutGrid, Ruler, Paintbrush, Save } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
// ★ 標準の型をそのまま使うように修正
import type { MapPin as MapPinT, MapRow, MapLine, Project, DimensionLine } from '../types';
import { useDraggablePin, proxyUrl } from '../shared/utils';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';

const DEFAULT_MAP_PART_NAMES = ['軒先', '袖', 'ケラバ', '谷', '棟', '隅棟', '平'];

const COLOR_PALETTE = [
  { name: "Yellow", value: "#FFD700" },
  { name: "White", value: "#FFFFFF" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Red", value: "#ef4444" },
];

const LINE_TYPES = [
  { label: '流れ壁', color: '#3b82f6' },
  { label: '平行壁', color: '#eab308' },
  { label: '棟', color: '#22c55e' },
  { label: '軒先', color: '#f97316' },
  { label: '袖', color: '#ec4899' },
  { label: 'その他', color: '#ef4444' },
];

function safeStyle(val: string | number | undefined | null, defaultUnit: string): string {
  if (val == null || val === '') return `0${defaultUnit}`;
  if (typeof val === 'number') return `${val}${defaultUnit}`;
  return String(val);
}

function DimensionLineMarker({ line, isSelected, onSelect, onRemove, onTextChange, onUpdate }: { line: DimensionLine; isSelected: boolean; onSelect: () => void; onRemove: () => void; onTextChange: (text: string) => void; onUpdate: (props: Partial<DimensionLine>) => void; }) {
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
    const rect = (e.currentTarget as Element).closest('.map-canvas-area')?.getBoundingClientRect();
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
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        />
      </svg>
      
      {isSelected && !isDragging && (
        <div style={{ left: `${safePopupX}%`, top: `${safePopupY}%` }} className="absolute z-30 translate-x-[-50%] translate-y-[-50%] flex flex-col items-center gap-3 bg-white p-5 rounded-2xl shadow-3xl border-2 border-gray-100 min-w-[260px]" onClick={e => e.stopPropagation()}>
          <div className="flex w-full gap-2 items-center justify-between border-b border-gray-100 pb-2">
             <h4 className="text-lg font-black text-gray-900 flex items-center gap-2"><CaseUpper className="w-5 h-5 text-blue-500"/> 部位と寸法を入力</h4>
             <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-2 text-red-500 bg-red-50 rounded-lg hover:bg-red-100"><Trash2 className="w-5 h-5" /></button>
          </div>
          <div className="flex flex-wrap gap-2 w-full">
            {DEFAULT_MAP_PART_NAMES.map(name => (
              <button key={name} onClick={() => addPartName(name)} className="text-sm font-black text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all">＋{name}</button>
            ))}
          </div>
          <input ref={inputRef} type="text" value={line.text} onChange={(e) => onTextChange(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 p-3 text-lg font-bold rounded-xl outline-none focus:border-blue-400 focus:bg-white text-center shadow-inner placeholder:font-normal" placeholder="例: 軒先 5.5m" />
        </div>
      )}

      {isSelected && (
        <>
          <div
            className="absolute z-40 w-10 h-10 -ml-5 -mt-5 bg-blue-500/20 border-4 border-blue-500 rounded-full cursor-move touch-none backdrop-blur-sm"
            style={{ left: `${localStart.x}%`, top: `${localStart.y}%` }}
            onPointerDown={(e) => startDrag(e, 'start')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="absolute z-40 w-10 h-10 -ml-5 -mt-5 bg-blue-500/20 border-4 border-blue-500 rounded-full cursor-move touch-none backdrop-blur-sm"
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
          style={{ left: `${midPoint.x}%`, top: `${midPoint.y}%`, color: color, backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(2px)' }}
          className="absolute z-20 translate-x-[-50%] translate-y-[-50%] font-bold text-base px-2 py-0.5 rounded pointer-events-none whitespace-nowrap border border-white/10 shadow-sm"
        >
          {line.text}
        </div>
      )}
    </>
  );
}

function DraggableMapLine({ line, isSelected, onDragEnd, onClick, onRotate, onCopy }: { line: MapLine; isSelected: boolean; onDragEnd: (x: number, y: number) => void; onClick: () => void; onRotate: (newRotation: number) => void; onCopy: () => void; }) {
  const initialX = typeof line.x === 'number' ? line.x : parseFloat(line.x as string);
  const initialY = typeof line.y === 'number' ? line.y : parseFloat(line.y as string);
  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(initialX, initialY, onDragEnd);

  return (
    <>
      <div
        ref={containerRef}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onClick={(e) => { e.stopPropagation(); if (!dragging) onClick(); }}
        className={`map-line-marker absolute cursor-move flex items-center justify-center transition-all duration-75 ${dragging ? 'z-30 opacity-60' : 'z-10 hover:opacity-80'}`}
        style={{
          left: `${position.x}%`, top: `${position.y}%`,
          width: safeStyle(line.length, '%'), height: Math.max(typeof line.thickness === 'number' ? line.thickness : parseFloat(line.thickness as string) || 4, 20) + 'px', 
          transform: `translate(-50%, -50%) rotate(${line.rotation ?? 0}deg)`,
          transformOrigin: 'center center', touchAction: 'none',
          boxShadow: isSelected && !dragging ? '0 0 0 3px rgba(59, 130, 246, 0.4)' : 'none', borderRadius: '999px',
        }}
      >
        <div style={{ width: '100%', height: safeStyle(line.thickness, 'px'), backgroundColor: line.color || '#000000', borderRadius: '999px' }} />
      </div>

      {isSelected && !dragging && (
        <div style={{ left: `${position.x}%`, top: `calc(${position.y}% + 25px)`, transform: 'translateX(-50%)' }} className="absolute z-40 flex bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden items-center" onClick={(e) => e.stopPropagation()}>
          <button onClick={(e) => { e.stopPropagation(); onCopy(); }} className="px-4 py-2 text-sm font-black hover:bg-gray-100 text-blue-600 border-r">コピー</button>
          <button onClick={() => onRotate(((line.rotation || 0) - 1 + 360) % 360)} className="px-4 py-2 text-xl font-bold hover:bg-gray-100 text-gray-700 border-r">↺</button>
          <span className="px-3 text-xs font-bold text-gray-600 whitespace-nowrap">角度</span>
          <button onClick={() => onRotate(((line.rotation || 0) + 1) % 360)} className="px-4 py-2 text-xl font-bold hover:bg-gray-100 text-gray-700 border-l">↻</button>
        </div>
      )}
    </>
  );
}

function MapMarker({ pin, isSelected, onDragEnd, onClick, onSizeChange }: { pin: MapPinT; isSelected: boolean; onDragEnd: (x: number, y: number) => void; onClick: () => void; onSizeChange: (newSize: number) => void; }) {
  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(pin.x, pin.y, onDragEnd);
  const currentSize = pin.size || 1; 

  return (
    <>
      <div
        ref={containerRef}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onClick={(e) => { e.stopPropagation(); if (!dragging) onClick(); }}
        style={{ left: `${position.x}%`, top: `${position.y}%`, transform: `translate(-50%, -50%) scale(${currentSize})`, touchAction: 'none', zIndex: isSelected ? 100 : (dragging ? 30 : 10) }}
        className={`map-pin-marker absolute flex items-center justify-center cursor-pointer transition-all duration-75 ${dragging ? 'opacity-80' : ''} ${isSelected && !dragging ? 'ring-4 ring-red-500 ring-offset-2 ring-offset-white/50 rounded-full' : ''}`}
      >
        {pin.type === 'arrow' ? (
          <div className="flex items-center gap-1 drop-shadow-md bg-white/70 px-2 py-0.5 rounded-lg border border-red-200"><span className="text-red-600 font-black text-2xl leading-none" style={{ transform: `rotate(${pin.rotation || 0}deg)` }}>➡</span><span className="text-red-600 font-bold text-xl">{pin.label}</span></div>
        ) : (
          <div className="relative flex items-center justify-center"><div className="w-14 h-14 rounded-full border-[4px] border-red-600 shadow-sm bg-red-600/10"></div><span className="absolute text-red-600 font-black text-xl drop-shadow-md bg-white/50 px-1 rounded">{pin.label}</span></div>
        )}
      </div>

      {isSelected && !dragging && (
        <div style={{ left: `${position.x}%`, top: `${position.y + 10 * currentSize}%`, transform: 'translateX(-50%)' }} className="absolute z-40 flex bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onSizeChange(Math.min(3, Math.round((currentSize + 0.1) * 10) / 10))} className="px-4 py-2 text-xl font-bold hover:bg-gray-100 text-gray-700 border-r">＋</button>
          <button onClick={() => onSizeChange(Math.max(0.3, Math.round((currentSize - 0.1) * 10) / 10))} className="px-4 py-2 text-xl font-bold hover:bg-gray-100 text-gray-700">ー</button>
        </div>
      )}
    </>
  );
}

export default function MapPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const mapCanvasRef = useRef<HTMLDivElement>(null);
const [sessionId] = useState(() => Date.now().toString());
  const [project, setProject] = useState<Project | null>(null);
  const [mapPins, setMapPins] = useState<MapPinT[]>([]);
  const [mapRows, setMapRows] = useState<MapRow[]>([]);
  const [mapLines, setMapLines] = useState<MapLine[]>([]);
  const [mapDimensionLines, setMapDimensionLines] = useState<DimensionLine[]>([]);
  
  const [selectedPinId, setSelectedPinId] = useState<number | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
  const [currentMapIndex, setCurrentMapIndex] = useState(0);

  const [editingMode, setEditingMode] = useState<'pin' | 'line' | 'dimension'>('pin');
  const [drawingStartPoint, setDrawingStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [selectedDimensionLineId, setSelectedDimensionLineId] = useState<number | null>(null);
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
          setMapLines(data.mapLines || []);
          setMapDimensionLines(data.mapDimensionLines || []);
          setShowLegendTable(data.showLegendTable !== false); 
        } else { setError('プロジェクトが見つかりません。'); }
      } catch { setError('データの読み込みに失敗しました。'); } finally { setLoading(false); }
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    if (mapCanvasRef.current) {
      setContainerRect(mapCanvasRef.current.getBoundingClientRect());
    }
  }, [mapCanvasRef, loading, currentMapIndex]);

  const saveProjectMapData = async (newPins: MapPinT[], newRows: MapRow[], newLines: MapLine[], newDimLines: DimensionLine[], newTableShow: boolean) => {
    if (!id) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'projects', id), {
        mapPins: newPins,
        mapRows: newRows,
        mapLines: newLines,
        mapDimensionLines: newDimLines,
        showLegendTable: newTableShow,
      });
      console.log('保存成功');
    } catch { setError('保存に失敗しました。'); } finally { setIsSaving(false); }
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; 
    if (!containerRect) return;

    const x = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    const y = ((e.clientY - containerRect.top) / containerRect.height) * 100;

    if (editingMode === 'pin') {
      if (selectedPinId !== null) { setSelectedPinId(null); return; }
      const newLabel = String(mapPins.filter(p => p.type === 'circle').length + 1);
      const newPins: MapPinT[] = [...mapPins, { id: Date.now(), x, y, label: newLabel, type: 'circle', size: 1, rotation: 0, mapIndex: currentMapIndex }];
      setMapPins(newPins);
      setSelectedPinId(null);
      const newRows: MapRow[] = [...mapRows, { id: Date.now(), symbol: newLabel, part: '', photoNo: '', remarks: '', mapIndex: currentMapIndex }];
      setMapRows(newRows);
      saveProjectMapData(newPins, newRows, mapLines, mapDimensionLines, showLegendTable);

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
        saveProjectMapData(mapPins, mapRows, mapLines, newDimLines, showLegendTable);
        setDrawingStartPoint(null); 
        setSelectedDimensionLineId(newLineId); 
      }
    }
  };

  const currentMapUrl = project?.mapUrls?.[currentMapIndex];
  const totalMaps = project?.mapUrls?.length || 0;

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  const updateDimensionLine = (lineId: number, newProps: Partial<DimensionLine>) => {
    const newDimLines = mapDimensionLines.map(l => l.id === lineId ? { ...l, ...newProps } : l);
    setMapDimensionLines(newDimLines);
    saveProjectMapData(mapPins, mapRows, mapLines, newDimLines, showLegendTable);
  };
  const removeDimensionLine = (lineId: number) => {
    const newDimLines = mapDimensionLines.filter(l => l.id !== lineId);
    setMapDimensionLines(newDimLines);
    setSelectedDimensionLineId(null);
    saveProjectMapData(mapPins, mapRows, mapLines, newDimLines, showLegendTable);
  };

  const addLine = (typeLabel: string, color: string) => {
    const thickness = typeLabel === '軒先' || typeLabel === '袖' || typeLabel === '棟' ? 10 : 6;
    const newLines: MapLine[] = [...mapLines, { id: Date.now(), x: 50, y: 50, length: 30, thickness: thickness, color, rotation: 0, mapIndex: currentMapIndex }];
    setMapLines(newLines);
    saveProjectMapData(mapPins, mapRows, newLines, mapDimensionLines, showLegendTable);
    setEditingMode('line');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 font-sans pb-40 select-none overflow-x-hidden" onClick={() => { setSelectedPinId(null); setSelectedRowId(null); setSelectedDimensionLineId(null); }}>
      <div className="max-w-7xl mx-auto pb-12">
        <div className="flex justify-between items-center mb-10 gap-4 flex-wrap no-print">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-3 text-blue-600 font-black text-xl px-5 py-3 hover:bg-blue-50 rounded-2xl transition-all active:scale-95"><ArrowLeft strokeWidth={4} /> 戻る</button>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter">屋根伏図・位置図の編集</h1>
          </div>
          
          <div className="flex items-center gap-6 bg-white p-3 rounded-[2rem] shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 pr-5 border-r border-gray-100">
               <FileText className={`w-8 h-8 ${showLegendTable ? 'text-blue-500' : 'text-gray-300'}`}/>
               <span className="font-bold text-gray-600">凡例表を</span>
                <button onClick={() => { const newState = !showLegendTable; setShowLegendTable(newState); saveProjectMapData(mapPins, mapRows, mapLines, mapDimensionLines, newState); }} className={`relative inline-flex h-9 w-18 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${showLegendTable ? 'bg-blue-600' : 'bg-gray-200'}`}>
                   <span className="sr-only">Toggle Legend</span>
                   <span aria-hidden="true" className={`inline-block h-8 w-8 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showLegendTable ? 'translate-x-9' : 'translate-x-0'}`} />
                </button>
               <span className={`font-black ${showLegendTable ? 'text-blue-600' : 'text-gray-400'}`}>{showLegendTable ? '表示' : '非表示'}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-500 mr-1">描画ツール:</span>
              <button onClick={() => { setEditingMode('pin'); setDrawingStartPoint(null); }} className={`flex items-center gap-2.5 px-6 py-4 rounded-xl font-black transition-all ${editingMode === 'pin' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}><MapPin className="w-6 h-6"/> 番号ピン</button>
              <button onClick={() => { setEditingMode('dimension'); setDrawingStartPoint(null); }} className={`flex items-center gap-2.5 px-6 py-4 rounded-xl font-black transition-all ${editingMode === 'dimension' ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}><Ruler className="w-6 h-6"/> 寸法記入</button>
            </div>
          </div>
        </div>

        {totalMaps > 1 && (
          <div className="flex gap-3 mb-8 no-print p-2 bg-gray-100 rounded-3xl w-fit">
            {project?.mapUrls?.map((_, idx) => (
              <button key={idx} onClick={() => setCurrentMapIndex(idx)} className={`px-8 py-4 rounded-2xl text-xl font-black transition-all ${currentMapIndex === idx ? 'bg-white text-blue-600 shadow-md' : 'text-gray-500 hover:bg-white/50'}`}>図面 {idx + 1}</button>
            ))}
          </div>
        )}

        <div className={`grid ${showLegendTable ? 'grid-cols-12' : 'grid-cols-1'} gap-8 items-start`}>
          
          <div className={`${showLegendTable ? 'col-span-8' : ''} bg-white p-8 rounded-[3rem] border-2 border-gray-100 shadow-2xl relative`}>
            {editingMode === 'dimension' && (
              <div className="flex items-center gap-3 p-4 bg-gray-100 rounded-2xl border border-gray-200 mb-6">
                 <Paintbrush className="w-6 h-6 text-gray-500"/>
                 <span className="font-bold text-gray-600 mr-2">寸法線の色：</span>
                {COLOR_PALETTE.map(color => (
                  <button key={color.name} onClick={() => setActiveColor(color.value)} className={`w-10 h-10 rounded-full border-4 transition-all ${activeColor === color.value ? 'border-gray-900 scale-110 shadow-lg' : 'border-white hover:scale-105'}`} style={{ backgroundColor: color.value }} />
                ))}
              </div>
            )}
            
            <div ref={mapCanvasRef} className="map-canvas-area w-full min-h-[500px] mt-2 bg-[#f1f5f9] rounded-[2.5rem] flex items-center justify-center overflow-hidden border-4 border-dashed border-gray-200 relative group transition-all cursor-crosshair" onClick={handleMapClick}>
              {currentMapUrl ? (
                <div className="relative inline-block pointer-events-none">
                  <img src={proxyUrl(currentMapUrl, `map_${currentMapIndex}_${sessionId}`)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full" style={{ maxHeight: '80vh' }} alt="" />
                  
                  {(mapDimensionLines || []).filter(l => (l.mapIndex || 0) === currentMapIndex).map((line) => (
                    <DimensionLineMarker 
                      key={line.id} line={line} isSelected={selectedDimensionLineId === line.id} 
                      onSelect={() => setSelectedDimensionLineId(line.id)} onRemove={() => removeDimensionLine(line.id)} 
                      onTextChange={(text) => updateDimensionLine(line.id, {text})} onUpdate={(newProps) => updateDimensionLine(line.id, newProps)}
                    />
                  ))}

                  {drawingStartPoint && editingMode === 'dimension' && (
                    <div style={{ left: `${drawingStartPoint.x}%`, top: `${drawingStartPoint.y}%`, backgroundColor: activeColor }} className="absolute w-4 h-4 rounded-full border-2 border-white shadow-xl pointer-events-none z-20" />
                  )}

                  <div className="absolute top-6 left-6 bg-black/70 backdrop-blur text-white text-xs px-6 py-3 rounded-full font-black pointer-events-none shadow-2xl border-2 border-white/20 z-10 flex items-center gap-2">
                    {editingMode === 'pin' ? <><LayoutGrid className="w-4 h-4 text-red-400"/> タップでピンを追加</> : !drawingStartPoint ? <><Ruler className="w-4 h-4 text-blue-400"/> 寸法線の始点をタップ</> : <><Ruler className="w-4 h-4 text-yellow-400"/> 寸法線の終点をタップ</>}
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-300 py-16"><MapPin className="w-24 h-24 mx-auto mb-6 opacity-20" /><span className="text-2xl font-black block">位置図・図面が未登録です</span></div>
              )}

              <div className="absolute inset-0 pointer-events-auto">
                {mapPins.filter(p => (p.mapIndex || 0) === currentMapIndex).map(pin => (
                  <MapMarker key={pin.id} pin={pin} isSelected={selectedPinId === pin.id} onDragEnd={(x, y) => { const newPins = mapPins.map(p => p.id === pin.id ? { ...p, x, y } : p); setMapPins(newPins); saveProjectMapData(newPins, mapRows, mapLines, mapDimensionLines, showLegendTable); }} onClick={() => setSelectedPinId(pin.id)} onSizeChange={(size) => { const newPins = mapPins.map(p => p.id === pin.id ? { ...p, size } : p); setMapPins(newPins); saveProjectMapData(newPins, mapRows, mapLines, mapDimensionLines, showLegendTable); }} />
                ))}
                {mapLines.filter(l => (l.mapIndex || 0) === currentMapIndex).map(line => (
                  <DraggableMapLine key={line.id} line={line} isSelected={selectedLineId === line.id} onDragEnd={(x, y) => { const newLines = mapLines.map(l => l.id === line.id ? { ...l, x, y } : l); setMapLines(newLines); saveProjectMapData(mapPins, mapRows, newLines, mapDimensionLines, showLegendTable); }} onClick={() => { setSelectedLineId(line.id); setEditingMode('line'); }} onRotate={(rot) => { const newLines = mapLines.map(l => l.id === line.id ? { ...l, rotation: rot } : l); setMapLines(newLines); saveProjectMapData(mapPins, mapRows, newLines, mapDimensionLines, showLegendTable); }} onCopy={() => { const newLine = { ...line, id: Date.now(), x: (typeof line.x === 'number' ? line.x : parseFloat(line.x as string)) + 2, y: (typeof line.y === 'number' ? line.y : parseFloat(line.y as string)) + 2 }; const newLines = [...mapLines, newLine]; setMapLines(newLines); saveProjectMapData(mapPins, mapRows, newLines, mapDimensionLines, showLegendTable); setSelectedLineId(newLine.id); }} />
                ))}
              </div>
            </div>
            
            <div className="mt-8 pt-8 border-t-4 border-gray-100 flex justify-between gap-4 flex-wrap">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="font-bold text-gray-500 mr-2">色付き線を追加:</span>
                {LINE_TYPES.map(type => (
                  <button key={type.label} onClick={() => addLine(type.label, type.color)} className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold hover:scale-105 transition-all text-sm border-2 border-gray-100" style={{ color: type.color, backgroundColor: `${type.color}10` }}><div className="w-5 h-1 rounded-full" style={{ backgroundColor: type.color }} /> {type.label}</button>
                ))}
              </div>
              {(selectedPinId || selectedLineId || selectedRowId) && (
                <button onClick={() => { if (window.confirm('選択した要素を削除しますか？')) { const newPins = mapPins.filter(p => p.id !== selectedPinId); const newLines = mapLines.filter(l => l.id !== selectedLineId); const newRows = mapRows.filter(r => r.id !== selectedRowId); setMapPins(newPins); setMapLines(newLines); setMapRows(newRows); setSelectedPinId(null); setSelectedLineId(null); setSelectedRowId(null); saveProjectMapData(newPins, newRows, newLines, mapDimensionLines, showLegendTable); } }} className="flex items-center gap-2.5 bg-red-50 text-red-600 font-black px-6 py-4 rounded-xl hover:bg-red-100 active:scale-95 transition-all"><Trash2 className="w-6 h-6" /> 選択中を削除</button>
              )}
            </div>
          </div>

          {showLegendTable && (
            <div className="col-span-4 bg-white p-8 rounded-[3rem] border-2 border-gray-100 shadow-2xl space-y-6">
              <h3 className="text-3xl font-black text-gray-900 flex items-center gap-3 border-b-4 border-gray-100 pb-5"><FileText className="text-blue-500 w-9 h-9"/> 凡例（項目欄）</h3>
              <div className="border-2 border-gray-200 rounded-2xl overflow-hidden shadow-inner">
                <div className="grid grid-cols-12 text-sm font-black bg-gray-100 border-b-2 border-gray-200 text-gray-600">
                  <div className="col-span-2 py-3 text-center border-r-2 border-gray-200">符号</div>
                  <div className="col-span-4 py-3 text-center border-r-2 border-gray-200">部位</div>
                  <div className="col-span-6 py-3 text-center">備考</div>
                </div>
                {(() => {
                  const currentRows = mapRows.filter((r) => (r.mapIndex || 0) === currentMapIndex);
                  return currentRows.length > 0 ? currentRows.map((row) => (
                    <div key={row.id} onClick={() => setSelectedRowId(row.id)} className={`grid grid-cols-12 text-lg border-b border-gray-100 last:border-b-0 cursor-pointer ${selectedRowId === row.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      <input type="text" value={row.symbol} onChange={(e) => { const newRows = mapRows.map(r => r.id === row.id ? { ...r, symbol: e.target.value } : r); setMapRows(newRows); }} className="col-span-2 py-3 text-center font-black text-red-700 bg-transparent outline-none border-r border-gray-100" />
                      <input type="text" value={row.part} placeholder="軒先" onChange={(e) => { const newRows = mapRows.map(r => r.id === row.id ? { ...r, part: e.target.value } : r); setMapRows(newRows); }} className="col-span-4 py-3 px-2 font-bold bg-transparent outline-none border-r border-gray-100" />
                      <input type="text" value={row.remarks} placeholder="..." onChange={(e) => { const newRows = mapRows.map(r => r.id === row.id ? { ...r, remarks: e.target.value } : r); setMapRows(newRows); }} className="col-span-6 py-3 px-2 font-bold bg-transparent outline-none" />
                    </div>
                  )) : (
                    <div className="text-center py-10 text-gray-400 font-bold bg-gray-50">ピンを追加すると<br/>ここに行が追加されます</div>
                  );
                })()}
              </div>
              <button onClick={() => { const newRows = [...mapRows, { id: Date.now(), symbol: '', part: '', photoNo: '', remarks: '', mapIndex: currentMapIndex }]; setMapRows(newRows); saveProjectMapData(mapPins, newRows, mapLines, mapDimensionLines, showLegendTable); }} className="w-full bg-gray-100 text-gray-800 font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-200 active:scale-95"><Plus className="w-5 h-5"/> 行を手動追加</button>
            </div>
          )}
        </div>

        <button onClick={() => saveProjectMapData(mapPins, mapRows, mapLines, mapDimensionLines, showLegendTable).then(() => alert('保存しました'))} disabled={isSaving} className="fixed bottom-10 right-10 z-50 bg-blue-600 text-white font-black px-10 py-6 text-2xl rounded-3xl shadow-3xl hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50"><Save className="w-8 h-8"/> {isSaving ? '保存中...' : '位置図を保存'}</button>

      </div>
    </div>
  );
}