import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Images, MapPin, X, Trash2 } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { proxyUrl, useDraggablePin } from '../shared/utils';
import type { MapLine, MapPin as MapPinT, MapPinType, MapRow, Project } from '../types';

// ★ PDFを画像に変換するための最強ツールを読み込みます
import * as pdfjsLib from 'pdfjs-dist';
// ワーカー（裏方の計算担当）の設定。エラー防止のため安全なCDNから読み込みます。
// @ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const LINE_DRAW_COLORS = [
  { label: '流れ壁', color: '#3b82f6' },
  { label: '平行壁', color: '#eab308' },
  { label: '棟', color: '#22c55e' },
  { label: '軒先', color: '#f97316' },
  { label: '袖', color: '#ec4899' },
  { label: 'その他', color: '#ef4444' },
] as const;

/** 画面上の2点（%）から MapLine の中心・長さ・角度を算出 */
function lineFromTwoPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rectWidth: number,
  rectHeight: number,
): { x: number; y: number; length: number; rotation: number } {
  const px1x = (x1 / 100) * rectWidth;
  const px1y = (y1 / 100) * rectHeight;
  const px2x = (x2 / 100) * rectWidth;
  const px2y = (y2 / 100) * rectHeight;
  const dx = px2x - px1x;
  const dy = px2y - px1y;
  const lengthPx = Math.hypot(dx, dy);
  const lengthPct = rectWidth > 0 ? (lengthPx / rectWidth) * 100 : 0;
  const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2,
    length: lengthPct,
    rotation,
  };
}

function safeStyle(
  val: string | number | undefined | null,
  defaultUnit: string,
): string {
  if (val == null || val === '') return `0${defaultUnit}`;
  if (typeof val === 'number') return `${val}${defaultUnit}`;
  return String(val);
}

function MapMarker({
  pin,
  onDragEnd,
  onClick,
}: {
  pin: MapPinT;
  onDragEnd: (x: number, y: number) => void;
  onClick: () => void;
}) {
  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(pin.x, pin.y, onDragEnd);
  return (
    <div ref={containerRef} onMouseDown={onMouseDown} onTouchStart={onTouchStart} onClick={(e) => { e.stopPropagation(); if(!dragging) onClick(); }} style={{ left: `${position.x}%`, top: `${position.y}%`, transform: 'translate(-50%, -50%)', touchAction: 'none' }} className={`map-pin-marker absolute flex items-center justify-center cursor-pointer transition-transform ${dragging ? 'z-30 scale-125 opacity-80' : 'z-10 hover:scale-110'}`}>
      {pin.type === 'arrow' ? (
        <div className="flex items-center gap-1 drop-shadow-md bg-white/70 px-2 py-0.5 rounded-lg border border-red-200">
          <span className="text-red-600 font-black text-2xl leading-none" style={{ transform: `rotate(${pin.rotation || 0}deg)` }}>➡</span>
          <span className="text-red-600 font-bold text-xl">{pin.label}</span>
        </div>
      ) : (
        <div className="relative flex items-center justify-center">
          <div className="w-14 h-14 rounded-full border-[4px] border-red-600 shadow-sm bg-red-600/10"></div>
          <span className="absolute text-red-600 font-black text-xl drop-shadow-md bg-white/50 px-1 rounded">{pin.label}</span>
        </div>
      )}
    </div>
  )
}

function MarkerEditModal({
  pin,
  isOpen,
  onClose,
  onSave,
  onRemove,
}: {
  pin: MapPinT | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (pin: MapPinT) => void;
  onRemove: (pinId: number) => void;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<MapPinType>("circle");
  const [rotation, setRotation] = useState(0);

  useEffect(() => { if (pin) { setLabel(pin.label); setType(pin.type || 'circle'); setRotation(pin.rotation || 0); } }, [pin]);
  if (!isOpen || !pin) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b pb-3">
          <h3 className="text-xl font-bold text-gray-900">マーカーの設定</h3>
          <button onClick={onClose}><X className="w-6 h-6 text-gray-400"/></button>
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">符号（番号など）</label>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)} className="w-full p-4 text-xl font-bold border-2 border-gray-300 rounded-xl focus:border-red-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-3">マーカーの種類</label>
          <div className="flex gap-4">
            <button onClick={() => setType('circle')} className={`flex-1 py-3 font-bold border-2 rounded-xl flex items-center justify-center gap-2 ${type==='circle' ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500'}`}><div className="w-5 h-5 rounded-full border-[3px] border-current"></div> 範囲 (〇)</button>
            <button onClick={() => setType('arrow')} className={`flex-1 py-3 font-bold border-2 rounded-xl flex items-center justify-center gap-2 ${type==='arrow' ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500'}`}><span className="text-xl leading-none">➡</span> 方向</button>
          </div>
        </div>
        {type === 'arrow' && (
          <div className="pt-2">
            <label className="block text-sm font-bold text-gray-700 mb-2">撮影した向き</label>
            <div className="grid grid-cols-4 gap-2">
              {[ {d: -90, l: '↑'}, {d: 0, l: '➡'}, {d: 90, l: '↓'}, {d: 180, l: '⬅'} ].map(rot => (
                <button key={rot.d} onClick={() => setRotation(rot.d)} className={`p-3 text-2xl font-black border-2 rounded-xl flex justify-center ${rotation === rot.d ? 'border-red-500 bg-red-100 text-red-600' : 'border-gray-200 text-gray-400'}`}><span style={{transform: `rotate(${rot.d}deg)`}}>➡</span></button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3 pt-4 border-t">
          <button onClick={() => { onSave({...pin, label, type, rotation}); onClose(); }} className="flex-1 bg-red-600 text-white text-lg font-bold py-4 rounded-xl shadow-md">決定</button>
          <button onClick={() => { onRemove(pin.id); onClose(); }} className="bg-gray-100 text-gray-600 font-bold py-4 px-6 rounded-xl hover:bg-red-100 hover:text-red-600">削除</button>
        </div>
      </div>
    </div>
  )
}

export default function MapPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingPin, setEditingPin] = useState<MapPinT | null>(null);
  const [initializedRows, setInitializedRows] = useState(false);
  const [lineModeForMap, setLineModeForMap] = useState<number | null>(null);
  const [lineColor, setLineColor] = useState<string>(LINE_DRAW_COLORS[0].color);
  const [lineDrag, setLineDrag] = useState<{
    mapIndex: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [linePreviewEnd, setLinePreviewEnd] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => { getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data() as Project)); }, [id]);

  useEffect(() => {
    if (!project || initializedRows) return;
    const mapUrls: unknown = project.mapUrls;
    if (!Array.isArray(mapUrls) || mapUrls.length === 0) return;

    const existingRows: MapRow[] = Array.isArray(project.mapRows) ? project.mapRows : [];

    const missingMapIndexes: number[] = [];
    for (let mapIndex = 0; mapIndex < mapUrls.length; mapIndex++) {
      const hasRow = existingRows.some(
        (r) => r?.mapIndex === mapIndex || (r?.mapIndex === undefined && mapIndex === 0),
      );
      if (!hasRow) missingMapIndexes.push(mapIndex);
    }

    if (missingMapIndexes.length === 0) {
      setInitializedRows(true);
      return;
    }

    const newRows = [...existingRows];
    for (const mapIndex of missingMapIndexes) {
      const prefix = mapIndex === 0 ? 'A-' : 'B-';
      newRows.push({
        id: Date.now() + Math.random(),
        mapIndex,
        symbol: `${prefix}1`,
        part: '',
        photoNo: '',
        remarks: '',
      });
    }

    setProject({ ...project, mapRows: newRows });
    updateDoc(doc(db, "projects", id!), { mapRows: newRows }).finally(() => {
      setInitializedRows(true);
    });
  }, [project, id, initializedRows]);

  // ★ PDFを画像に変換してアップロードする最強関数
  const uploadMaps = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files as FileList).slice(0, 2);
    if (files.length === 0) return;
    setUploading(true);
    const newUrls = [...(project?.mapUrls || [])];

    for (const f of files) {
      if (newUrls.length >= 2) break;

      let fileToUpload: File | Blob = f;
      let fileName = f.name;

      // もし選ばれたファイルがPDFだったら、裏でこっそり画像（JPG）に変換する！
      if (f.type === 'application/pdf') {
        try {
          const arrayBuffer = await f.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const page = await pdf.getPage(1); // 1ページ目を取得

          const viewport = page.getViewport({ scale: 2.0 }); // 高画質（2倍）で読み込む
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          if (context) {
            await page.render({ canvasContext: context, viewport: viewport } as any).promise;
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
            if (blob) {
              fileToUpload = blob;
              fileName = fileName.replace(/\.pdf$/i, '.jpg'); // 名前もJPGに変えておく
            }
          }
        } catch (err) {
          console.error('PDF変換エラー:', err);
          alert('PDFの読み込みに失敗しました。パスワードがかかっているか、壊れている可能性があります。');
          continue; // 失敗したらこのファイルは飛ばす
        }
      }

      // 変換された画像（または普通の画像）をGoogle倉庫にアップロード
      const r = ref(storage, `maps/${id}/${Date.now()}_${fileName}`);
      await uploadBytes(r, fileToUpload);
      newUrls.push(await getDownloadURL(r));
    }

    if (project) {
      setProject({ ...project, mapUrls: newUrls });
      await updateDoc(doc(db, "projects", id!), { mapUrls: newUrls });
    }
    setUploading(false);
  };

  const removeMap = async (index: number) => {
    if (!project) return;
    if (
      !window.confirm(
        'この位置図を削除しますか？\n（配置したマーカー・線もすべて削除されます）',
      )
    )
      return;
    const newUrls = project.mapUrls.filter((_, i: number) => i !== index);
    const newPins = (project.mapPins || []).filter((p) => p.mapIndex !== index);
    const newLines = (project.mapLines || [])
      .filter((l) => l.mapIndex !== index)
      .map((l) => ({
        ...l,
        mapIndex: l.mapIndex > index ? l.mapIndex - 1 : l.mapIndex,
      }));
    setProject({
      ...project,
      mapUrls: newUrls,
      mapPins: newPins,
      mapLines: newLines,
    });
    await updateDoc(doc(db, "projects", id!), {
      mapUrls: newUrls,
      mapPins: newPins,
      mapLines: newLines,
    });
    if (lineModeForMap === index) setLineModeForMap(null);
    else if (lineModeForMap !== null && lineModeForMap > index)
      setLineModeForMap(lineModeForMap - 1);
  };

  const addPin = async (e: React.MouseEvent<HTMLDivElement>, mapIndex: number) => {
    if (!project) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    const currentPins = (project.mapPins || []).filter((p) => p.mapIndex === mapIndex);
    const prefix = mapIndex === 0 ? 'A-' : 'B-';
    const label = `${prefix}${currentPins.length + 1}`;

    const newPin: MapPinT = { id: Date.now(), mapIndex, x, y, label, type: 'circle', rotation: 0 };
    const newPins: MapPinT[] = [...(project.mapPins || []), newPin];
    setProject({ ...project, mapPins: newPins });
    await updateDoc(doc(db, "projects", id!), { mapPins: newPins });
    setEditingPin(newPin);
  };

  const savePin = async (updatedPin: MapPinT) => {
    if (!project) return;
    const newPins = (project.mapPins || []).map((p) => p.id === updatedPin.id ? updatedPin : p);
    setProject({ ...project, mapPins: newPins });
    await updateDoc(doc(db, "projects", id!), { mapPins: newPins });
  };

  const removePin = async (pinId: number) => {
    if (!project) return;
    const newPins = (project.mapPins || []).filter((p) => p.id !== pinId);
    setProject({ ...project, mapPins: newPins });
    await updateDoc(doc(db, "projects", id!), { mapPins: newPins });
  };

  const addMapRow = async (mapIndex: number) => {
    if (!project) return;
    const currentRows = (project.mapRows || []).filter((r) => r.mapIndex === mapIndex || (r.mapIndex === undefined && mapIndex === 0));
    const prefix = mapIndex === 0 ? 'A-' : 'B-';
    const symbol = `${prefix}${currentRows.length + 1}`;
    
    const newRows: MapRow[] = [...(project.mapRows || []), { id: Date.now(), mapIndex, symbol, part: "", photoNo: "", remarks: "" }];
    setProject({ ...project, mapRows: newRows });
    await updateDoc(doc(db, "projects", id!), { mapRows: newRows });
  };

  const updateMapRow = async (rowId: number, field: keyof MapRow, value: string) => {
    if (!project) return;
    const newRows = (project.mapRows || []).map((r) => r.id === rowId ? { ...r, [field]: value } : r);
    setProject({ ...project, mapRows: newRows });
    await updateDoc(doc(db, "projects", id!), { mapRows: newRows });
  };

  const removeMapRow = async (rowId: number) => {
    if (!project) return;
    const newRows = (project.mapRows || []).filter((r) => r.id !== rowId);
    setProject({ ...project, mapRows: newRows });
    await updateDoc(doc(db, "projects", id!), { mapRows: newRows });
  };

  const removeMapLine = async (lineId: number) => {
    if (!project) return;
    const newLines = (project.mapLines || []).filter((l) => l.id !== lineId);
    setProject({ ...project, mapLines: newLines });
    await updateDoc(doc(db, "projects", id!), { mapLines: newLines });
  };

  const handleLinePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    mapIndex: number,
  ) => {
    if (lineModeForMap !== mapIndex) return;
    if ((e.target as HTMLElement).closest('.map-pin-marker')) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setLineDrag({ mapIndex, startX: x, startY: y });
    setLinePreviewEnd(null);
    el.setPointerCapture(e.pointerId);
  };

  const handleLinePointerMove = (
    e: React.PointerEvent<HTMLDivElement>,
    mapIndex: number,
  ) => {
    if (!lineDrag || lineDrag.mapIndex !== mapIndex) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setLinePreviewEnd({ x, y });
  };

  const handleLinePointerUp = (
    e: React.PointerEvent<HTMLDivElement>,
    mapIndex: number,
  ) => {
    if (!lineDrag || lineDrag.mapIndex !== mapIndex) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const { startX, startY } = lineDrag;
    if (Math.hypot(x - startX, y - startY) < 0.5) {
      setLineDrag(null);
      setLinePreviewEnd(null);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    const geom = lineFromTwoPoints(startX, startY, x, y, rect.width, rect.height);
    const newLine: MapLine = {
      id: Date.now() + Math.random(),
      mapIndex,
      x: geom.x,
      y: geom.y,
      length: geom.length,
      thickness: 4,
      color: lineColor,
      rotation: geom.rotation,
    };
    setProject((prev) => {
      if (!prev) return prev;
      const newLines = [...(prev.mapLines || []), newLine];
      void updateDoc(doc(db, "projects", id!), { mapLines: newLines });
      return { ...prev, mapLines: newLines };
    });
    setLineDrag(null);
    setLinePreviewEnd(null);
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleLinePointerCancel = (
    e: React.PointerEvent<HTMLDivElement>,
    mapIndex: number,
  ) => {
    if (!lineDrag || lineDrag.mapIndex !== mapIndex) return;
    setLineDrag(null);
    setLinePreviewEnd(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  if (!project) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans overflow-x-hidden">
      <div className="max-w-md mx-auto pb-12">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold text-lg"><ArrowLeft className="w-6 h-6" /> もどる</button>
        <h1 className="text-3xl font-bold mb-6 text-gray-900">位置図の登録と指示</h1>
        
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-black/5 mb-6 relative">
          <label className="flex items-center justify-center gap-2 w-full text-center bg-green-100 text-green-700 font-bold py-4 text-lg rounded-xl cursor-pointer shadow-sm mb-6 z-10 relative">
            <Images className="w-6 h-6" />
            {uploading ? "Google倉庫へ保存中..." : "図面を追加（PDFもOK！）"}
            {/* ★ PDFも選択できるように「application/pdf」を追加 */}
            <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={uploadMaps} disabled={uploading} />
          </label>

          {project.mapUrls && project.mapUrls.length > 0 ? (
            <div className="space-y-8">
              <div className="bg-red-50 p-4 rounded-xl border border-red-100 space-y-2">
                <p className="text-base font-bold text-red-600 flex items-center gap-2"><MapPin className="w-5 h-5" /> 現場マーカーの使い方</p>
                <ul className="text-sm text-red-700 font-medium space-y-1 list-disc pl-5">
                  <li>図面を<b>タップ</b>すると、赤丸が打てます。</li>
                  <li>赤丸を<b>ドラッグ</b>で自由に移動できます。</li>
                  <li>赤丸を<b>もう一度タップ</b>すると、<b>「矢印」</b>への変更や文字の変更ができます。</li>
                  <li><b>「線を描く」</b>をオンにすると、図面上で<b>ドラッグ</b>して壁種などの線を引けます（色は下から選択）。</li>
                </ul>
              </div>
              
              {project.mapUrls.map((u: string, i: number) => {
                const currentRows = (project.mapRows || []).filter((r) => r.mapIndex === i || (r.mapIndex === undefined && i === 0));
                
                return (
                <div key={i} className="relative w-full border-2 border-gray-300 rounded-xl bg-gray-100 shadow-inner group overflow-hidden flex flex-col p-2">
                  <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
                    <button
                      type="button"
                      onClick={() =>
                        setLineModeForMap((m) => (m === i ? null : i))
                      }
                      className={`text-sm font-bold px-3 py-2 rounded-xl border-2 ${
                        lineModeForMap === i
                          ? 'bg-amber-100 border-amber-500 text-amber-900'
                          : 'bg-white border-gray-200 text-gray-700'
                      }`}
                    >
                      {lineModeForMap === i ? '線モード中（終了）' : '線を描く'}
                    </button>
                    {lineModeForMap === i && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-xs font-bold text-gray-600">色:</span>
                        {LINE_DRAW_COLORS.map((c) => (
                          <button
                            key={c.color}
                            type="button"
                            title={c.label}
                            onClick={() => setLineColor(c.color)}
                            className={`w-7 h-7 rounded-full border-2 shrink-0 ${
                              lineColor === c.color
                                ? 'border-gray-900 ring-2 ring-offset-1 ring-gray-400'
                                : 'border-white shadow-sm'
                            }`}
                            style={{ backgroundColor: c.color }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center overflow-hidden">
                    <div
                      className={`relative inline-block max-w-full ${
                        lineModeForMap === i ? 'cursor-crosshair' : ''
                      }`}
                      onClick={(e) => {
                        if (lineModeForMap !== i) addPin(e, i);
                      }}
                      onPointerDown={(e) => handleLinePointerDown(e, i)}
                      onPointerMove={(e) => handleLinePointerMove(e, i)}
                      onPointerUp={(e) => handleLinePointerUp(e, i)}
                      onPointerCancel={(e) => handleLinePointerCancel(e, i)}
                    >
                      <img src={proxyUrl(u, i)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-[60vh] pointer-events-none rounded shadow-sm" alt="" />
                      {(project.mapLines || [])
                        .filter((l) => l.mapIndex === i)
                        .map((line) => (
                          <div
                            key={line.id}
                            className="pointer-events-none absolute"
                            style={{
                              left: safeStyle(line.x, '%'),
                              top: safeStyle(line.y, '%'),
                              width: safeStyle(line.length, '%'),
                              height: safeStyle(line.thickness, 'px'),
                              backgroundColor: line.color || '#000000',
                              transform: `translate(-50%, -50%) rotate(${line.rotation ?? 0}deg)`,
                              transformOrigin: 'center center',
                              zIndex: 5,
                            }}
                          />
                        ))}
                      {lineDrag &&
                        lineDrag.mapIndex === i &&
                        linePreviewEnd && (
                          <svg
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            style={{ zIndex: 8 }}
                          >
                            <line
                              x1={lineDrag.startX}
                              y1={lineDrag.startY}
                              x2={linePreviewEnd.x}
                              y2={linePreviewEnd.y}
                              stroke={lineColor}
                              strokeWidth={0.8}
                              strokeLinecap="round"
                            />
                          </svg>
                        )}
                      {(project.mapPins || []).filter((p) => p.mapIndex === i).map((pin) => (
                        <MapMarker key={pin.id} pin={pin} onDragEnd={(x: number, y: number) => savePin({...pin, x, y})} onClick={() => setEditingPin(pin)} />
                      ))}
                    </div>
                  </div>
                  <button onClick={() => removeMap(i)} className="absolute top-2 right-2 bg-white/90 rounded-full p-2 text-red-500 shadow-sm z-20"><Trash2 className="w-5 h-5" /></button>

                  {(project.mapLines || []).filter((l) => l.mapIndex === i).length > 0 && (
                    <div className="w-full mt-2 px-1">
                      <p className="text-xs font-bold text-gray-600 mb-1">この図の線</p>
                      <div className="flex flex-wrap gap-2">
                        {(project.mapLines || [])
                          .filter((l) => l.mapIndex === i)
                          .map((line) => (
                            <button
                              key={line.id}
                              type="button"
                              onClick={() => removeMapLine(line.id)}
                              className="text-xs font-bold px-2 py-1 rounded-lg border border-gray-300 bg-white hover:bg-red-50 hover:border-red-200 text-gray-700 flex items-center gap-1"
                            >
                              <span
                                className="inline-block w-4 h-1 rounded-sm"
                                style={{ backgroundColor: line.color || '#000' }}
                              />
                              削除
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="w-full mt-6 pt-4 border-t border-gray-300">
                    <h3 className="text-lg font-bold mb-3 text-gray-800">位置図 {i + 1} の説明表</h3>
                    <div className="space-y-3">
                      {currentRows.map((row) => (
                        <div key={row.id} className="flex gap-2 items-center bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
                          <div className="flex-1 grid grid-cols-12 gap-2">
                            <input type="text" placeholder="符号" className="col-span-1 p-2 border border-gray-300 rounded-lg text-sm bg-white" value={row.symbol || ''} onChange={e => updateMapRow(row.id, 'symbol', e.target.value)} />
                            <input type="text" placeholder="部位" className="col-span-2 p-2 border border-gray-300 rounded-lg text-sm bg-white" value={row.part || ''} onChange={e => updateMapRow(row.id, 'part', e.target.value)} />
                            <input type="text" placeholder="写真NO" className="col-span-2 p-2 border border-gray-300 rounded-lg text-sm bg-white" value={row.photoNo || row.relatedPhotoNumber || ''} onChange={e => updateMapRow(row.id, 'photoNo', e.target.value)} />
                            <input type="text" placeholder="備考" className="col-span-7 p-2 border border-gray-300 rounded-lg text-sm bg-white" value={row.remarks || ''} onChange={e => updateMapRow(row.id, 'remarks', e.target.value)} />
                          </div>
                          <button onClick={() => removeMapRow(row.id)} className="p-2 text-red-500 bg-white border border-red-100 rounded-lg hover:bg-red-50"><Trash2 className="w-5 h-5" /></button>
                        </div>
                      ))}
                      <button onClick={() => addMapRow(i)} className="w-full py-3 bg-white text-blue-600 font-bold rounded-xl mt-2 border-2 border-dashed border-blue-200 hover:bg-blue-50 transition-colors">+ 説明行を追加</button>
                    </div>
                  </div>

                </div>
              )})}

            </div>
          ) : (
             <div className="w-full bg-gray-100 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-300 overflow-hidden p-10 gap-3">
              <span className="text-gray-400 font-bold text-lg">位置図未登録</span>
            </div>
          )}
        </div>
      </div>
      <MarkerEditModal pin={editingPin} isOpen={!!editingPin} onClose={() => setEditingPin(null)} onSave={savePin} onRemove={removePin} />
    </div>
  );
}