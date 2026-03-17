import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Camera, RotateCcw, RotateCw } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { proxyUrl } from '../shared/utils';
import type { Material, Project } from '../types';

export default function MaterialPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  // 現場データの読み込み
  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "projects", id)).then(d => {
      if (d.exists()) setProject(d.data() as Project);
    });
  }, [id]);

  // Firebaseへの自動保存
  const saveMaterials = async (newMaterials: Material[]) => {
    if (!project || !id) return;
    setProject({ ...project, materials: newMaterials });
    await updateDoc(doc(db, "projects", id), { materials: newMaterials });
  };

  // 空の材料枠を追加
  const addMaterial = () => {
    const newMaterial: Material = {
      id: Date.now() + Math.random(),
      image: null,
      name: '',
      manufacturer: '',
      specification: '',
      remarks: '',
      rotation: 0,
    };
    saveMaterials([...(project?.materials || []), newMaterial]);
  };

  // 文字の入力内容を保存
  const updateMaterial = (materialId: number, field: keyof Material, value: any) => {
    const newMaterials = (project?.materials || []).map(m => 
      m.id === materialId ? { ...m, [field]: value } : m
    );
    saveMaterials(newMaterials);
  };

  // 材料をまるごと削除
  const removeMaterial = (materialId: number) => {
    if (!window.confirm('この材料データを削除しますか？')) return;
    const newMaterials = (project?.materials || []).filter(m => m.id !== materialId);
    saveMaterials(newMaterials);
  };

  // 写真のアップロード処理
  const handleImageUpload = async (materialId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!project || !id || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploadingId(materialId);

    try {
      const storageRef = ref(storage, `materials/${id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      updateMaterial(materialId, 'image', url);
    } catch (error) {
      alert('画像のアップロードに失敗しました。');
    } finally {
      setUploadingId(null);
    }
  };

  // 写真の回転処理
  const rotateImage = (materialId: number, currentRotation: number, delta: number) => {
    const newRotation = (currentRotation + delta) % 360;
    updateMaterial(materialId, 'rotation', newRotation);
  };

  if (!project) return <LoadingSpinner />;

  const materials = project.materials || [];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 font-sans overflow-x-hidden pb-24">
      <div className="max-w-2xl mx-auto">
        {/* ヘッダー部分 */}
        <button onClick={() => navigate(`/project/${id}`)} className="flex items-center gap-2 text-blue-500 mb-6 font-bold text-lg">
          <ArrowLeft className="w-6 h-6" /> もどる
        </button>
        
        <div className="flex justify-between items-end mb-6">
          <h1 className="text-3xl font-bold text-gray-900">材料の登録</h1>
          <span className="text-sm font-bold text-gray-500">{materials.length} 件登録済み</span>
        </div>

        {/* ガイダンス（オンオフ機能の説明） */}
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6 shadow-sm">
          <p className="text-sm text-blue-800 font-bold leading-relaxed">
            💡 ここに材料（パッケージやラベル）を登録すると、写真台帳の前に「材料報告書」が自動で追加されます。小規模な修理などで不要な場合は、空のままでOKです！
          </p>
        </div>

        {/* 材料リスト */}
        <div className="space-y-6">
          {materials.map((material, index) => (
            <div key={material.id} className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-200 relative">
              <div className="absolute top-4 left-4 bg-gray-800 text-white text-xs font-bold px-3 py-1 rounded-full z-10 shadow">
                材料 {index + 1}
              </div>
              <button 
                onClick={() => removeMaterial(material.id)} 
                className="absolute top-3 right-3 p-2 text-red-500 bg-red-50 rounded-full hover:bg-red-100 z-10 transition-colors shadow-sm"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              <div className="flex flex-col sm:flex-row gap-5 mt-8">
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
                        {/* 回転ボタン */}
                        <div className="absolute bottom-2 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-black/60 p-1.5 rounded-lg backdrop-blur-sm shadow-lg">
                          <button onClick={() => rotateImage(material.id, material.rotation || 0, -90)} className="p-1.5 text-white hover:bg-white/30 rounded"><RotateCcw className="w-5 h-5" /></button>
                          <button onClick={() => rotateImage(material.id, material.rotation || 0, 90)} className="p-1.5 text-white hover:bg-white/30 rounded"><RotateCw className="w-5 h-5" /></button>
                        </div>
                      </>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-gray-50 transition-colors">
                        {uploadingId === material.id ? (
                          <span className="text-blue-500 font-bold animate-pulse">読込中...</span>
                        ) : (
                          <>
                            <Camera className="w-10 h-10 text-gray-400 mb-2" />
                            <span className="text-sm font-bold text-gray-500">写真を撮影</span>
                          </>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(material.id, e)} disabled={uploadingId === material.id} />
                      </label>
                    )}
                  </div>
                  {/* 画像変更用ボタン */}
                  {material.image && (
                    <label className="text-center w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm rounded-lg cursor-pointer transition-colors shadow-sm">
                      写真を変更
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(material.id, e)} disabled={uploadingId === material.id} />
                    </label>
                  )}
                </div>

                {/* 入力項目エリア（スマホ最適化サイズ） */}
                <div className="w-full sm:w-[60%] flex flex-col gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">品名</label>
                    <input type="text" placeholder="例：改質アスファルトルーフィング" className="w-full p-3 border border-gray-300 rounded-lg text-base font-bold bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all" value={material.name} onChange={e => updateMaterial(material.id, 'name', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">メーカー</label>
                    <input type="text" placeholder="例：田島ルーフィング" className="w-full p-3 border border-gray-300 rounded-lg text-base bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all" value={material.manufacturer} onChange={e => updateMaterial(material.id, 'manufacturer', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">規格 / 寸法 / 数量</label>
                    <input type="text" placeholder="例：1.0m × 20m / 3巻" className="w-full p-3 border border-gray-300 rounded-lg text-base bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all" value={material.specification} onChange={e => updateMaterial(material.id, 'specification', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">備考</label>
                    <textarea placeholder="使用箇所や特記事項など" rows={2} className="w-full p-3 border border-gray-300 rounded-lg text-base bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none" value={material.remarks} onChange={e => updateMaterial(material.id, 'remarks', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* 追加ボタン */}
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