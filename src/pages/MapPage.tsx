import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Images, MapPin as MapPinIcon, Trash2, X } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { db, storage } from '../firebase';
import type { MapPin, MapPinType, Project } from '../types';
import { useDraggablePin } from '../shared/utils';

interface ProjectWithPins extends Omit<Project, 'mapPins' | 'mapUrls'> {
  mapPins: MapPin[];
  mapUrls: string[];
}

function MapMarker({
  pin,
  onDragEnd,
  onClick,
}: {
  pin: MapPin;
  onDragEnd: (x: number, y: number) => void;
  onClick: () => void;
}) {
  const { position, onMouseDown, onTouchStart, dragging, containerRef } =
    useDraggablePin(pin.x, pin.y, onDragEnd);

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onClick={(e) => {
        e.stopPropagation();
        if (!dragging) onClick();
      }}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        touchAction: 'none',
      }}
      className={`absolute flex items-center justify-center cursor-pointer transition-transform ${
        dragging ? 'z-30 scale-125 opacity-80' : 'z-10 hover:scale-110'
      }`}
    >
      {pin.type === 'arrow' ? (
        <div className="flex items-center gap-1 drop-shadow-md bg-white/70 px-2 py-0.5 rounded-lg border border-red-200">
          <span
            className="text-red-600 font-black text-2xl leading-none"
            style={{ transform: `rotate(${pin.rotation || 0}deg)` }}
          >
            ➡
          </span>
          <span className="text-red-600 font-bold text-xl">{pin.label}</span>
        </div>
      ) : (
        <div className="relative flex items-center justify-center">
          <div className="w-14 h-14 rounded-full border-[4px] border-red-600 shadow-sm bg-red-600/10" />
          <span className="absolute text-red-600 font-black text-xl drop-shadow-md bg-white/50 px-1 rounded">
            {pin.label}
          </span>
        </div>
      )}
    </div>
  );
}

function MarkerEditModal({
  pin,
  isOpen,
  onClose,
  onSave,
  onRemove,
}: {
  pin: MapPin | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (pin: MapPin) => void;
  onRemove: (id: number) => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<MapPinType>('circle');
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (pin) {
      setLabel(pin.label);
      setType(pin.type || 'circle');
      setRotation(pin.rotation || 0);
    }
  }, [pin]);

  if (!isOpen || !pin) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b pb-3">
          <h3 className="text-xl font-bold text-gray-900">マーカーの設定</h3>
          <button onClick={onClose}>
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            符号（番号など）
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full p-4 text-xl font-bold border-2 border-gray-300 rounded-xl focus:border-red-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-3">
            マーカーの種類
          </label>
          <div className="flex gap-4">
            <button
              onClick={() => setType('circle')}
              className={`flex-1 py-3 font-bold border-2 rounded-xl flex items-center justify-center gap-2 ${
                type === 'circle'
                  ? 'border-red-500 bg-red-50 text-red-600'
                  : 'border-gray-200 text-gray-500'
              }`}
            >
              <div className="w-5 h-5 rounded-full border-[3px] border-current" />{' '}
              範囲 (〇)
            </button>
            <button
              onClick={() => setType('arrow')}
              className={`flex-1 py-3 font-bold border-2 rounded-xl flex items-center justify-center gap-2 ${
                type === 'arrow'
                  ? 'border-red-500 bg-red-50 text-red-600'
                  : 'border-gray-200 text-gray-500'
              }`}
            >
              <span className="text-xl leading-none">➡</span> 方向
            </button>
          </div>
        </div>

        {type === 'arrow' && (
          <div className="pt-2">
            <label className="block text-sm font-bold text-gray-700 mb-2">
              撮影した向き
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { d: -90, l: '↑' },
                { d: 0, l: '➡' },
                { d: 90, l: '↓' },
                { d: 180, l: '⬅' },
              ].map((rot) => (
                <button
                  key={rot.d}
                  onClick={() => setRotation(rot.d)}
                  className={`p-3 text-2xl font-black border-2 rounded-xl flex justify-center ${
                    rotation === rot.d
                      ? 'border-red-500 bg-red-100 text-red-600'
                      : 'border-gray-200 text-gray-400'
                  }`}
                >
                  <span style={{ transform: `rotate(${rot.d}deg)` }}>➡</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t">
          <button
            onClick={() => {
              onSave({ ...pin, label, type, rotation });
              onClose();
            }}
            className="flex-1 bg-red-600 text-white text-lg font-bold py-4 rounded-xl shadow-md"
          >
            決定
          </button>
          <button
            onClick={() => {
              onRemove(pin.id);
              onClose();
            }}
            className="bg-gray-100 text-gray-600 font-bold py-4 px-6 rounded-xl hover:bg-red-100 hover:text-red-600"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}

export function MapPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectWithPins | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingPin, setEditingPin] = useState<MapPin | null>(null);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'projects', id)).then((d) => {
      if (d.exists()) {
        const data = d.data() as ProjectWithPins;
        data.mapPins = data.mapPins || [];
        data.mapUrls = data.mapUrls || [];
        setProject(data);
      }
    });
  }, [id]);

  const uploadMaps = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!project || !id) return;
    const files = Array.from(e.target.files || []).slice(0, 2);
    if (files.length === 0) return;
    setUploading(true);
    const newUrls = [...(project.mapUrls || [])];
    for (const f of files) {
      if (newUrls.length >= 2) break;
      // eslint-disable-next-line no-await-in-loop
      const r = ref(storage, `maps/${id}/${Date.now()}_${f.name}`);
      // eslint-disable-next-line no-await-in-loop
      await uploadBytes(r, f);
      // eslint-disable-next-line no-await-in-loop
      newUrls.push(await getDownloadURL(r));
    }
    const updated = { ...project, mapUrls: newUrls };
    setProject(updated);
    await updateDoc(doc(db, 'projects', id), { mapUrls: newUrls });
    setUploading(false);
  };

  const removeMap = async (index: number) => {
    if (!project || !id) return;
    if (
      !window.confirm(
        'この位置図を削除しますか？\n（配置したマーカーもすべて削除されます）',
      )
    )
      return;
    const newUrls = project.mapUrls.filter((_, i) => i !== index);
    const newPins = (project.mapPins || []).filter(
      (p) => p.mapIndex !== index,
    );
    const updated = { ...project, mapUrls: newUrls, mapPins: newPins };
    setProject(updated);
    await updateDoc(doc(db, 'projects', id), {
      mapUrls: newUrls,
      mapPins: newPins,
    });
  };

  const addPin = (
    e: React.MouseEvent<HTMLDivElement>,
    mapIndex: number,
  ) => {
    if (!project || !id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const currentPins = (project.mapPins || []).filter(
      (p) => p.mapIndex === mapIndex,
    );
    const label = String(currentPins.length + 1);

    const newPin: MapPin = {
      id: Date.now(),
      mapIndex,
      x,
      y,
      label,
      type: 'circle',
      rotation: 0,
    };
    const newPins = [...(project.mapPins || []), newPin];
    const updated = { ...project, mapPins: newPins };
    setProject(updated);
    updateDoc(doc(db, 'projects', id), { mapPins: newPins });
    setEditingPin(newPin);
  };

  const savePin = async (updatedPin: MapPin) => {
    if (!project || !id) return;
    const newPins = (project.mapPins || []).map((p) =>
      p.id === updatedPin.id ? updatedPin : p,
    );
    const updated = { ...project, mapPins: newPins };
    setProject(updated);
    await updateDoc(doc(db, 'projects', id), { mapPins: newPins });
  };

  const removePin = async (pinId: number) => {
    if (!project || !id) return;
    const newPins = (project.mapPins || []).filter((p) => p.id !== pinId);
    const updated = { ...project, mapPins: newPins };
    setProject(updated);
    await updateDoc(doc(db, 'projects', id), { mapPins: newPins });
  };

  if (!project) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans overflow-x-hidden">
      <div className="max-w-md mx-auto pb-12">
        <button
          onClick={() => navigate(`/project/${id}`)}
          className="flex items-center gap-2 text-blue-500 mb-6 font-bold text-lg"
        >
          <ArrowLeft className="w-6 h-6" /> もどる
        </button>
        <h1 className="text-3xl font-bold mb-6 text-gray-900">
          位置図の登録と指示
        </h1>

        <div className="bg-white p-5 rounded-3xl shadow-sm border border-black/5 mb-6 relative">
          <label className="flex items-center justify-center gap-2 w-full text-center bg-green-100 text-green-700 font-bold py-4 text-lg rounded-xl cursor-pointer shadow-sm mb-6 z-10 relative">
            <Images className="w-6 h-6" />
            {uploading ? 'Google倉庫へ保存中...' : '図面を追加（2枚まで）'}
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={uploadMaps}
              disabled={uploading}
            />
          </label>

          {project.mapUrls && project.mapUrls.length > 0 ? (
            <div className="space-y-8">
              <div className="bg-red-50 p-4 rounded-xl border border-red-100 space-y-2">
                <p className="text-base font-bold text-red-600 flex items-center gap-2">
                  <MapPinIcon className="w-5 h-5" /> 現場マーカーの使い方
                </p>
                <ul className="text-sm text-red-700 font-medium space-y-1 list-disc pl-5">
                  <li>
                    図面を<b>タップ</b>すると、赤丸が打てます。
                  </li>
                  <li>
                    赤丸を<b>ドラッグ</b>で自由に移動できます。
                  </li>
                  <li>
                    赤丸を<b>もう一度タップ</b>すると、
                    <b>「矢印」</b>
                    への変更や文字の変更ができます。
                  </li>
                </ul>
              </div>

              {/* ★修正：位置図の赤丸ズレ防止のため、画像にピッタリ合うラッパーを作成！ */}
              {project.mapUrls.map((u, i) => (
                <div
                  key={i}
                  className="relative w-full border-2 border-gray-300 rounded-xl bg-gray-100 shadow-inner group overflow-hidden flex items-center justify-center p-2"
                >
                  <div
                    className="relative inline-block"
                    style={{ maxWidth: '100%' }}
                    onClick={(e) => addPin(e, i)}
                  >
                    <img
                      src={u}
                      className="block max-w-full h-auto pointer-events-none rounded shadow-sm"
                    />
                    {(project.mapPins || [])
                      .filter((p) => p.mapIndex === i)
                      .map((pin) => (
                        <MapMarker
                          key={pin.id}
                          pin={pin}
                          onDragEnd={(x, y) => savePin({ ...pin, x, y })}
                          onClick={() => setEditingPin(pin)}
                        />
                      ))}
                  </div>
                  <button
                    onClick={() => removeMap(i)}
                    className="absolute top-2 right-2 bg-white/90 rounded-full p-2 text-red-500 shadow-sm z-20"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full bg-gray-100 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-300 overflow-hidden p-10 gap-3">
              <span className="text-gray-400 font-bold text-lg">
                位置図未登録
              </span>
            </div>
          )}
        </div>
      </div>
      <MarkerEditModal
        pin={editingPin}
        isOpen={!!editingPin}
        onClose={() => setEditingPin(null)}
        onSave={savePin}
        onRemove={removePin}
      />
    </div>
  );
}

