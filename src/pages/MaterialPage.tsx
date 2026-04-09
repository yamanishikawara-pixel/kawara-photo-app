import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Camera, RotateCcw, RotateCw, ArrowUp, ArrowDown, BookmarkPlus, ChevronDown } from 'lucide-react';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { proxyUrl } from '../shared/utils';
import type { Material, MaterialMaster, Project } from '../types';

// 品名コンボボックス：▼で全件表示、入力で部分一致絞り込み
function NameSuggest({
  value,
  masters,
  onChange,
  onApply,
}: {
  value: string;
  masters: MaterialMaster[];
  onChange: (v: string) => void;
  onApply: (m: MaterialMaster) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  // ドロップダウンを開くたびに検索文字列をリセット
  const handleOpen = () => { setQuery(''); setOpen(true); };

  const filtered = query.trim()
    ? masters.filter((m) => m.name.includes(query.trim()))
    : masters;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (m: MaterialMaster) => {
    setOpen(false);
    const detail = [m.manufacturer, m.specification, m.remarks].filter(Boolean).join('　/　');
    if (window.confirm(`「${m.name}」のデータを自動入力しますか？${detail ? '\n' + detail : ''}`)) {
      onApply(m);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      {/* 表示用インプット＋▼ボタン */}
      <div className="flex">
        <input
          type="text"
          placeholder="例：改質アスファルトルーフィング"
          className="flex-1 p-3 border border-gray-300 rounded-l-lg text-base font-bold bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
        {masters.length > 0 && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); open ? setOpen(false) : handleOpen(); }}
            className="px-3 border border-l-0 border-gray-300 rounded-r-lg bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors"
            title="マスタから選択"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* ドロップダウン本体 */}
      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-blue-200 rounded-xl shadow-xl overflow-hidden">
          {/* 絞り込みインプット */}
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
                    {(m.manufacturer || m.specification) && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[m.manufacturer, m.specification].filter(Boolean).join('　')}
                      </div>
                    )}
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

export default function MaterialPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [masters, setMasters] = useState<MaterialMaster[]>([]);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'projects', id))
      .then((d) => { if (d.exists()) setProject(d.data() as Project); })
      .catch(() => { alert('材料データの読み込みに失敗しました。'); });

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      setUid(user.uid);
      const s = await getDoc(doc(db, 'users', user.uid));
      if (s.exists()) {
        const data = s.data();
        if (Array.isArray(data.materialMaster)) setMasters(data.materialMaster);
      }
    });
    return () => unsub();
  }, [id]);

  const saveMaterials = async (newMaterials: Material[]) => {
    if (!project || !id) return;
    setProject((prev) => prev ? { ...prev, materials: newMaterials } : null);
    await updateDoc(doc(db, 'projects', id), { materials: newMaterials });
  };

  const addMaterial = () => {
    const newMaterial: Material = {
      id: Date.now(),
      image: null,
      name: '',
      manufacturer: '',
      specification: '',
      remarks: '',
      rotation: 0,
    };
    saveMaterials([...(project?.materials || []), newMaterial]);
  };

  const updateMaterial = (materialId: number, field: keyof Material, value: Material[keyof Material]) => {
    const newMaterials = (project?.materials || []).map((m) =>
      m.id === materialId ? { ...m, [field]: value } : m
    );
    saveMaterials(newMaterials);
  };

  // サジェスト選択時に複数フィールドを一括更新
  const applyMaster = (materialId: number, m: MaterialMaster) => {
    const newMaterials = (project?.materials || []).map((mat) =>
      mat.id === materialId
        ? { ...mat, name: m.name, manufacturer: m.manufacturer, specification: m.specification, remarks: m.remarks }
        : mat
    );
    saveMaterials(newMaterials);
  };

  const removeMaterial = (materialId: number) => {
    if (!window.confirm('この材料データを削除しますか？')) return;
    saveMaterials((project?.materials || []).filter((m) => m.id !== materialId));
  };

  const moveMaterial = (index: number, direction: 'up' | 'down') => {
    const newMaterials = [...(project?.materials || [])];
    if (direction === 'up' && index > 0) {
      [newMaterials[index - 1], newMaterials[index]] = [newMaterials[index], newMaterials[index - 1]];
    } else if (direction === 'down' && index < newMaterials.length - 1) {
      [newMaterials[index], newMaterials[index + 1]] = [newMaterials[index + 1], newMaterials[index]];
    }
    saveMaterials(newMaterials);
  };

  // 現在の材料カードをマスタに追加
  const saveToMaster = async (material: Material) => {
    if (!uid) { alert('マスタに保存するにはログインが必要です。'); return; }
    if (!material.name.trim()) { alert('品名を入力してください。'); return; }

    // 同じ品名があれば上書き確認
    const existing = masters.find((m) => m.name === material.name.trim());
    if (existing) {
      if (!window.confirm(`「${material.name}」はすでにマスタにあります。上書きしますか？`)) return;
    }

    const newEntry: MaterialMaster = {
      id: existing?.id ?? Date.now(),
      name: material.name.trim(),
      manufacturer: material.manufacturer,
      specification: material.specification,
      remarks: material.remarks,
    };
    const newMasters = existing
      ? masters.map((m) => (m.id === existing.id ? newEntry : m))
      : [...masters, newEntry];

    setMasters(newMasters);
    await setDoc(doc(db, 'users', uid), { materialMaster: newMasters }, { merge: true });
    alert(`「${newEntry.name}」をマスタに保存しました。`);
  };

  const handleImageUpload = async (materialId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!project || !id || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploadingId(materialId);
    try {
      const storageRef = ref(storage, `materials/${id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      updateMaterial(materialId, 'image', url);
    } catch {
      alert('画像のアップロードに失敗しました。');
    } finally {
      setUploadingId(null);
    }
  };

  const rotateImage = (materialId: number, currentRotation: number, delta: number) => {
    updateMaterial(materialId, 'rotation', (currentRotation + delta) % 360);
  };

  if (!project) return <LoadingSpinner />;

  const materials = project.materials || [];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 font-sans overflow-x-hidden pb-24">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold text-lg">
          <ArrowLeft className="w-6 h-6" /> もどる
        </button>

        <div className="flex justify-between items-end mb-6">
          <h1 className="text-3xl font-bold text-gray-900">材料の登録</h1>
          <span className="text-sm font-bold text-gray-500">{materials.length} 件登録済み</span>
        </div>

        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6 shadow-sm">
          <p className="text-sm text-blue-800 font-bold leading-relaxed">
            💡 ここに材料（パッケージやラベル）を登録すると、写真台帳の前に「材料報告書」が自動で追加されます。小規模な修理などで不要な場合は、空のままでOKです！
          </p>
        </div>

        <div className="space-y-6">
          {materials.map((material, index) => (
            <div key={material.id} className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-200 relative">
              <div className="absolute top-4 left-4 bg-gray-800 text-white text-xs font-bold px-3 py-1 rounded-full z-10 shadow">
                材料 {index + 1}
              </div>

              <div className="absolute top-3 right-14 flex gap-1 z-10">
                <button onClick={() => moveMaterial(index, 'up')} disabled={index === 0} className="p-2 text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 disabled:opacity-30 transition-colors shadow-sm" title="上へ移動">
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button onClick={() => moveMaterial(index, 'down')} disabled={index === materials.length - 1} className="p-2 text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 disabled:opacity-30 transition-colors shadow-sm" title="下へ移動">
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>

              <button onClick={() => removeMaterial(material.id)} className="absolute top-3 right-3 p-2 text-red-500 bg-red-50 rounded-full hover:bg-red-100 z-10 transition-colors shadow-sm" title="削除">
                <Trash2 className="w-5 h-5" />
              </button>

              <div className="flex flex-col sm:flex-row gap-5 mt-10">
                {/* 写真エリア */}
                <div className="w-full sm:w-[40%] flex flex-col gap-2">
                  <div className="aspect-square bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center relative overflow-hidden group">
                    {material.image ? (
                      <>
                        <img
                          src={proxyUrl(material.image, material.id)}
                          alt="材料写真"
                          className="w-full h-full object-contain transition-transform duration-300"
                          style={{ transform: `rotate(${material.rotation || 0}deg)` }}
                          crossOrigin="anonymous"
                        />
                        <div className="absolute bottom-2 right-2 flex gap-1 bg-black/60 p-1.5 rounded-lg backdrop-blur-sm shadow-lg z-20">
                          <button onClick={() => rotateImage(material.id, material.rotation || 0, -90)} className="p-1.5 text-white hover:bg-white/30 rounded"><RotateCcw className="w-5 h-5" /></button>
                          <button onClick={() => rotateImage(material.id, material.rotation || 0, 90)} className="p-1.5 text-white hover:bg-white/30 rounded"><RotateCw className="w-5 h-5" /></button>
                        </div>
                      </>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-gray-50 transition-colors">
                        {uploadingId === material.id ? (
                          <span className="text-blue-500 font-bold animate-pulse">読込中...</span>
                        ) : (
                          <><Camera className="w-10 h-10 text-gray-400 mb-2" /><span className="text-sm font-bold text-gray-500">写真を撮影</span></>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(material.id, e)} disabled={uploadingId === material.id} />
                      </label>
                    )}
                  </div>
                  {material.image && (
                    <label className="text-center w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm rounded-lg cursor-pointer transition-colors shadow-sm">
                      写真を変更
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(material.id, e)} disabled={uploadingId === material.id} />
                    </label>
                  )}
                </div>

                {/* 入力項目エリア */}
                <div className="w-full sm:w-[60%] flex flex-col gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-gray-500">品名</label>
                      <button
                        type="button"
                        onClick={() => saveToMaster(material)}
                        className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors"
                        title="この材料をマスタに保存"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" /> マスタに追加
                      </button>
                    </div>
                    <NameSuggest
                      value={material.name}
                      masters={masters}
                      onChange={(v) => updateMaterial(material.id, 'name', v)}
                      onApply={(m) => applyMaster(material.id, m)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">メーカー</label>
                    <input type="text" placeholder="例：田島ルーフィング" className="w-full p-3 border border-gray-300 rounded-lg text-base bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all" value={material.manufacturer} onChange={(e) => updateMaterial(material.id, 'manufacturer', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">規格 / 寸法 / 数量</label>
                    <input type="text" placeholder="例：1.0m × 20m / 3巻" className="w-full p-3 border border-gray-300 rounded-lg text-base bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all" value={material.specification} onChange={(e) => updateMaterial(material.id, 'specification', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">備考</label>
                    <textarea placeholder="使用箇所や特記事項など" rows={2} className="w-full p-3 border border-gray-300 rounded-lg text-base bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none" value={material.remarks} onChange={(e) => updateMaterial(material.id, 'remarks', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={addMaterial}
            className="w-full py-5 bg-white text-blue-600 font-bold text-lg rounded-2xl border-2 border-dashed border-blue-300 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <Plus className="w-7 h-7" />
            材料の枠を追加する
          </button>
        </div>
      </div>
    </div>
  );
}
