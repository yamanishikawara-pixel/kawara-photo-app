import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Camera, RotateCcw, RotateCw, ArrowUp, ArrowDown, BookmarkPlus, ChevronDown } from 'lucide-react';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { proxyUrl } from '../shared/utils';
import { canUpload, trackDelete, trackUpload } from '../shared/storageUtils';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';
import type { Material, MaterialMaster, Project } from '../types';

const getRemoteFileSize = async (url: string): Promise<number> => {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return Number(res.headers.get('content-length') || 0);
  } catch {
    return 0;
  }
};

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
      <div className="flex">
        <input
          type="text"
          placeholder="例：改質アスファルトルーフィング"
          className="flex-1 p-3 rounded-l-lg text-sm font-bold outline-none transition-colors"
          style={{ background: '#12122a', border: '1px solid #2e2e50', borderRight: 'none', color: '#f0ede8' }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
        {masters.length > 0 && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              if (open) setOpen(false);
              else handleOpen();
            }}
            className="px-3 rounded-r-lg transition-colors"
            style={{ background: '#1c1c30', border: '1px solid #2e2e50', color: '#8b8ba8' }}
            title="マスタから選択"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl shadow-xl overflow-hidden" style={{ background: '#1c1c30', border: '1px solid #2e2e50' }}>
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
                    {(m.manufacturer || m.specification) && (
                      <div className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
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
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setError(null);
    const fetchProject = async () => {
      try {
        const d = await getDoc(doc(db, 'projects', id));
        if (d.exists()) setProject(d.data() as Project);
      } catch (err) {
        logFirebaseError(err, '材料読込');
        setError(firebaseErrorMessage(err, '材料データの読み込み'));
      }
    };
    fetchProject();

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      setUid(user.uid);
      const s = await getDoc(doc(db, 'users', user.uid));
      if (s.exists()) {
        const data = s.data();
        if (Array.isArray(data.materialMaster)) setMasters(data.materialMaster);
        if (typeof data.storageUsedBytes === 'number') setStorageUsedBytes(data.storageUsedBytes);
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

  const applyMaster = (materialId: number, m: MaterialMaster) => {
    const newMaterials = (project?.materials || []).map((mat) =>
      mat.id === materialId
        ? { ...mat, name: m.name, manufacturer: m.manufacturer, specification: m.specification, remarks: m.remarks }
        : mat
    );
    saveMaterials(newMaterials);
  };

  const removeMaterial = async (materialId: number) => {
    if (!window.confirm('この材料データを削除しますか？')) return;
    const material = (project?.materials || []).find((m) => m.id === materialId);
    if (material?.image) {
      const bytes = await getRemoteFileSize(material.image);
      try {
        await deleteObject(ref(storage, material.image));
        if (uid && bytes > 0) {
          await trackDelete(uid, bytes);
          setStorageUsedBytes((prev) => Math.max(0, prev - bytes));
        }
      } catch {
        /* Storage削除失敗は材料データ削除を妨げない */
      }
    }
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

  const saveToMaster = async (material: Material) => {
    if (!uid) { alert('マスタに保存するにはログインが必要です。'); return; }
    const trimmedName = material.name.trim();
    if (!trimmedName) { alert('品名を入力してください。'); return; }

    const existing = masters.find((m) => m.name === trimmedName);
    if (existing) {
      if (!window.confirm(`「${material.name}」はすでにマスタにあります。上書きしますか？`)) return;
    }

    const newEntry: MaterialMaster = {
      id: existing?.id ?? Date.now(),
      name: trimmedName,
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
      if (!canUpload(storageUsedBytes, file.size)) {
        alert('ストレージ容量が上限（500MB）に達しています。不要な画像を削除してください。');
        return;
      }
      const storageRef = ref(storage, `materials/${id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      if (uid) {
        await trackUpload(uid, file.size);
        setStorageUsedBytes((prev) => prev + file.size);
      }
      updateMaterial(materialId, 'image', url);
    } catch (err) {
      logFirebaseError(err, '材料画像アップロード');
      alert(firebaseErrorMessage(err, '画像のアップロード'));
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
    <div className="min-h-screen font-sans overflow-x-hidden pb-24" style={{ background: '#0f0f1a', color: '#f0ede8' }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6">

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
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-wide" style={{ color: '#f0ede8' }}>材料の登録</h1>
              <div className="mt-1.5 h-0.5 w-12 rounded-full" style={{ background: '#8b5cf6' }} />
            </div>
            <span className="text-xs font-bold" style={{ color: '#6b7280' }}>{materials.length} 件登録済み</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl flex justify-between items-center text-sm font-bold" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* ヒントバナー */}
        <div className="p-4 rounded-xl border mb-6" style={{ background: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.25)' }}>
          <p className="text-xs font-bold leading-relaxed" style={{ color: '#a78bfa' }}>
            材料（パッケージやラベル）を登録すると、写真台帳の前に「材料報告書」が自動で追加されます。不要な場合は空のままでOKです。
          </p>
        </div>

        <div className="space-y-4">
          {materials.map((material, index) => (
            <div key={material.id} className="rounded-2xl border relative p-4 sm:p-5" style={{ background: '#1c1c30', borderColor: '#2e2e50' }}>

              {/* ヘッダー行 */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black px-3 py-1 rounded-full" style={{ background: '#8b5cf6', color: '#fff' }}>
                  材料 {index + 1}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => moveMaterial(index, 'up')}
                    disabled={index === 0}
                    className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                    style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}
                    onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
                    onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
                    title="上へ"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveMaterial(index, 'down')}
                    disabled={index === materials.length - 1}
                    className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                    style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}
                    onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
                    onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
                    title="下へ"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeMaterial(material.id)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                    title="削除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                {/* 写真エリア */}
                <div className="w-full sm:w-[38%] flex flex-col gap-2">
                  <div
                    className="aspect-square rounded-xl overflow-hidden flex items-center justify-center relative"
                    style={{ background: '#12122a', border: '1px dashed #2e2e50' }}
                  >
                    {material.image ? (
                      <>
                        <img
                          src={proxyUrl(material.image, material.id)}
                          alt="材料写真"
                          className="w-full h-full object-contain transition-transform duration-300"
                          style={{ transform: `rotate(${material.rotation || 0}deg)` }}
                          crossOrigin="anonymous"
                        />
                        <div className="absolute bottom-2 right-2 flex gap-1 p-1.5 rounded-lg z-20" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                          <button onClick={() => rotateImage(material.id, material.rotation || 0, -90)} className="p-1.5 rounded transition-colors" style={{ color: '#f0ede8' }} onPointerEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')} onPointerLeave={e => (e.currentTarget.style.background = 'transparent')}><RotateCcw className="w-4 h-4" /></button>
                          <button onClick={() => rotateImage(material.id, material.rotation || 0, 90)} className="p-1.5 rounded transition-colors" style={{ color: '#f0ede8' }} onPointerEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')} onPointerLeave={e => (e.currentTarget.style.background = 'transparent')}><RotateCw className="w-4 h-4" /></button>
                        </div>
                      </>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer transition-colors" onPointerEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')} onPointerLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        {uploadingId === material.id ? (
                          <span className="text-sm font-bold animate-pulse" style={{ color: '#ff6b35' }}>読込中...</span>
                        ) : (
                          <>
                            <Camera className="w-8 h-8 mb-2" style={{ color: '#3d3d60' }} />
                            <span className="text-xs font-bold" style={{ color: '#6b7280' }}>写真を撮影</span>
                          </>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(material.id, e)} disabled={uploadingId === material.id} />
                      </label>
                    )}
                  </div>
                  {material.image && (
                    <label
                      className="text-center w-full py-2 rounded-lg cursor-pointer transition-colors text-xs font-bold"
                      style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}
                      onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
                      onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
                    >
                      写真を変更
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(material.id, e)} disabled={uploadingId === material.id} />
                    </label>
                  )}
                </div>

                {/* 入力項目 */}
                <div className="w-full sm:w-[62%] flex flex-col gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold" style={{ color: '#6b7280' }}>品名</label>
                      <button
                        type="button"
                        onClick={() => saveToMaster(material)}
                        className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg transition-colors"
                        style={{ color: '#10b981' }}
                        onPointerEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.1)')}
                        onPointerLeave={e => (e.currentTarget.style.background = 'transparent')}
                        title="マスタに保存"
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

                  {[
                    { label: 'メーカー', field: 'manufacturer' as keyof Material, placeholder: '例：田島ルーフィング' },
                    { label: '規格 / 寸法 / 数量', field: 'specification' as keyof Material, placeholder: '例：1.0m × 20m / 3巻' },
                  ].map(({ label, field, placeholder }) => (
                    <div key={field}>
                      <label className="text-xs font-bold block mb-1.5" style={{ color: '#6b7280' }}>{label}</label>
                      <input
                        type="text"
                        placeholder={placeholder}
                        className="w-full p-2.5 rounded-lg text-sm outline-none transition-colors"
                        style={{ background: '#12122a', border: '1px solid #2e2e50', color: '#f0ede8' }}
                        value={material[field] as string}
                        onChange={(e) => updateMaterial(material.id, field, e.target.value)}
                      />
                    </div>
                  ))}

                  <div>
                    <label className="text-xs font-bold block mb-1.5" style={{ color: '#6b7280' }}>備考</label>
                    <textarea
                      placeholder="使用箇所や特記事項など"
                      rows={2}
                      className="w-full p-2.5 rounded-lg text-sm outline-none transition-colors resize-none"
                      style={{ background: '#12122a', border: '1px solid #2e2e50', color: '#f0ede8' }}
                      value={material.remarks}
                      onChange={(e) => updateMaterial(material.id, 'remarks', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* 追加ボタン */}
          <button
            onClick={addMaterial}
            className="w-full py-5 font-bold text-sm rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 transition-colors"
            style={{ borderColor: '#2e2e50', color: '#8b8ba8', background: 'transparent' }}
            onPointerEnter={e => { (e.currentTarget.style.borderColor = '#8b5cf6'); (e.currentTarget.style.color = '#8b5cf6'); }}
            onPointerLeave={e => { (e.currentTarget.style.borderColor = '#2e2e50'); (e.currentTarget.style.color = '#8b8ba8'); }}
          >
            <Plus className="w-5 h-5" />
            材料の枠を追加する
          </button>
        </div>
      </div>
    </div>
  );
}
