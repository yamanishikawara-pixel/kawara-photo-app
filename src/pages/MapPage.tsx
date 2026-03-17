import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Images, MapPin, X, Trash2 } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { proxyUrl, useDraggablePin } from '../shared/utils';
import type { MapPin as MapPinT, MapPinType, MapRow, Project } from '../types';

function MapMarker({ pin, onDragEnd, onClick }: { pin: MapPinT; onDragEnd: (x: number, y: number) => void; onClick: () => void; }) {
  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(pin.x, pin.y, onDragEnd);
  return (
    <div ref={containerRef} onMouseDown={onMouseDown} onTouchStart={onTouchStart} onClick={(e) => { e.stopPropagation(); if(!dragging) onClick(); }} style={{ left: `${position.x}%`, top: `${position.y}%`, transform: 'translate(-50%, -50%)', touchAction: 'none' }} className={`absolute flex items-center justify-center cursor-pointer transition-transform ${dragging ? 'z-30 scale-125 opacity-80' : 'z-10 hover:scale-110'}`}>
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

function MarkerEditModal({ pin, isOpen, onClose, onSave, onRemove }: { pin: MapPinT | null; isOpen: boolean; onClose: () => void; onSave: (pin: MapPinT) => void; onRemove: (pinId: number) => void; }) {
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

  useEffect(() => { getDoc(doc(db, "projects", id!)).then(d => d.exists() && setProject(d.data() as Project)); }, [id]);

  useEffect(() => {
    if (!project || initializedRows) return;
    const mapUrls = project.mapUrls || [];
    if (mapUrls.length === 0) return;

    const existingRows: MapRow[] = project.mapRows || [];
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

  const uploadMaps = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!project) return;
    const files = Array.from(e.target.files as FileList).slice(0, 2);
    if (files.length === 0) return;
    setUploading(true);
    const newUrls = [...(project.mapUrls || [])];
    for (const f of files) {
      if (newUrls.length >= 2) break;
      const r = ref(storage, `maps/${id}/${Date.now()}_${f.name}`);
      await uploadBytes(r, f);
      newUrls.push(await getDownloadURL(r));
    }
    setProject({ ...project, mapUrls: newUrls });
    await updateDoc(doc(db, "projects", id!), { mapUrls: newUrls });
    setUploading(false);
  };

  const removeMap = async (index: number) => {
    if (!project) return;
    if(!window.confirm('この位置図を削除しますか？\n（配置したマーカーもすべて削除されます）')) return;
    const newUrls = (project.mapUrls || []).filter((_, i: number) => i !== index);
    const newPins = (project.mapPins || []).filter((p) => p.mapIndex !== index);
    setProject({ ...project, mapUrls: newUrls, mapPins: newPins });
    await updateDoc(doc(db, "projects", id!), { mapUrls: newUrls, mapPins: newPins });
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

  if (!project) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans overflow-x-hidden">
      <div className="max-w-md mx-auto pb-12">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold text-lg"><ArrowLeft className="w-6 h-6" /> もどる</button>
        <h1 className="text-3xl font-bold mb-6 text-gray-900">位置図の登録と指示</h1>
        
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-black/5 mb-6 relative">
          <label className="flex items-center justify-center gap-2 w-full text-center bg-green-100 text-green-700 font-bold py-4 text-lg rounded-xl cursor-pointer shadow-sm mb-6 z-10 relative">
            <Images className="w-6 h-6" />
            {uploading ? "Google倉庫へ保存中..." : "図面を追加（2枚まで）"}
            <input type="file" multiple accept="image/*" className="hidden" onChange={uploadMaps} disabled={uploading} />
          </label>

          {project.mapUrls && project.mapUrls.length > 0 ? (
            <div className="space-y-8">
              <div className="bg-red-50 p-4 rounded-xl border border-red-100 space-y-2">
                <p className="text-base font-bold text-red-600 flex items-center gap-2"><MapPin className="w-5 h-5" /> 現場マーカーの使い方</p>
                <ul className="text-sm text-red-700 font-medium space-y-1 list-disc pl-5">
                  <li>図面を<b>タップ</b>すると、赤丸が打てます。</li>
                  <li>赤丸を<b>ドラッグ</b>で自由に移動できます。</li>
                  <li>赤丸を<b>もう一度タップ</b>すると、<b>「矢印」</b>への変更や文字の変更ができます。</li>
                </ul>
              </div>
              
              {project.mapUrls.map((u: string, i: number) => {
                const currentRows = (project.mapRows || []).filter((r) => r.mapIndex === i || (r.mapIndex === undefined && i === 0));
                
                return (
                <div key={i} className="relative w-full border-2 border-gray-300 rounded-xl bg-gray-100 shadow-inner group overflow-hidden flex flex-col p-2">
                  <div className="flex items-center justify-center overflow-hidden">
                    <div className="relative inline-block" onClick={(e) => addPin(e, i)}>
                      <img src={proxyUrl(u, i)} crossOrigin="anonymous" className="block w-auto h-auto max-w-full max-h-[60vh] pointer-events-none rounded shadow-sm" alt="" />
                      {(project.mapPins || []).filter((p) => p.mapIndex === i).map((pin) => (
                        <MapMarker key={pin.id} pin={pin} onDragEnd={(x: number, y: number) => savePin({...pin, x, y})} onClick={() => setEditingPin(pin)} />
                      ))}
                    </div>
                  </div>
                  <button onClick={() => removeMap(i)} className="absolute top-2 right-2 bg-white/90 rounded-full p-2 text-red-500 shadow-sm z-20"><Trash2 className="w-5 h-5" /></button>

                  <div className="w-full mt-6 pt-4 border-t border-gray-300">
                    <h3 className="text-lg font-bold mb-3 text-gray-800">位置図 {i + 1} の説明表</h3>
                    <div className="space-y-3">
                      {/* =========================================
                          ★スマホ特化の2段構えレイアウト（広々タップ可能）
                         ========================================= */}
                      {currentRows.map((row: any) => (
                        <div key={row.id} className="bg-white p-3 rounded-xl border border-gray-300 shadow-sm flex flex-col gap-2 relative">
                          <button onClick={() => removeMapRow(row.id)} className="absolute top-2 right-2 p-1.5 text-red-500 bg-red-50 rounded-lg hover:bg-red-100 z-10"><Trash2 className="w-5 h-5" /></button>
                          
                          <div className="flex gap-2 pr-10">
                            <div className="w-[25%]">
                              <label className="text-[10px] font-bold text-gray-500 mb-1 block">符号</label>
                              <input type="text" placeholder="A-1" className="w-full p-2.5 border border-gray-300 rounded-lg text-base font-bold text-red-600 bg-white focus:ring-2 focus:ring-blue-500" value={row.symbol || ''} onChange={e => updateMapRow(row.id as number, 'symbol', e.target.value)} />
                            </div>
                            <div className="w-[45%]">
                              <label className="text-[10px] font-bold text-gray-500 mb-1 block">部位</label>
                              <input type="text" placeholder="部位を入力" className="w-full p-2.5 border border-gray-300 rounded-lg text-base bg-white focus:ring-2 focus:ring-blue-500" value={row.part || ''} onChange={e => updateMapRow(row.id as number, 'part', e.target.value)} />
                            </div>
                            <div className="w-[30%]">
                              <label className="text-[10px] font-bold text-gray-500 mb-1 block">写真NO</label>
                              <input type="text" placeholder="番号" className="w-full p-2.5 border border-gray-300 rounded-lg text-base bg-white focus:ring-2 focus:ring-blue-500" value={row.photoNo || row.relatedPhotoNumber || ''} onChange={e => updateMapRow(row.id as number, 'photoNo', e.target.value)} />
                            </div>
                          </div>

                          <div className="w-full">
                            <label className="text-[10px] font-bold text-gray-500 mb-1 block">備考</label>
                            <textarea placeholder="備考（詳しく入力できます）" rows={2} className="w-full p-2.5 border border-gray-300 rounded-lg text-base bg-white focus:ring-2 focus:ring-blue-500" value={row.remarks || ''} onChange={e => updateMapRow(row.id as number, 'remarks', e.target.value)} />
                          </div>
                        </div>
                      ))}
                      {/* ========================================= */}
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