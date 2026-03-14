import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Camera,
  MapPin,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';

import { db, storage } from '../firebase';
import type { Circle, Photo, Project } from '../types';
import { compressImage, useDraggablePin } from '../shared/utils';

interface ProjectWithOptionalPhotos extends Omit<Project, 'photos'> {
  photos: Photo[];
}

function PhotoCircleMarker({
  circle,
  isSelected,
  onSelect,
  onDragEnd,
  onSizeChange,
  onRemove,
}: {
  circle: Circle;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onSizeChange: (size: number) => void;
  onRemove: () => void;
}) {
  const { position, onMouseDown, onTouchStart, dragging, containerRef } =
    useDraggablePin(circle.x, circle.y, onDragEnd);

  return (
    <>
      <div
        ref={containerRef}
        onMouseDown={(e) => {
          onSelect();
          onMouseDown(e);
        }}
        onTouchStart={(e) => {
          onSelect();
          onTouchStart(e);
        }}
        style={{
          left: `${position.x}%`,
          top: `${position.y}%`,
          width: `${circle.size}%`,
          transform: 'translate(-50%, -50%)',
          touchAction: 'none',
        }}
        className={`absolute aspect-square rounded-full border-[3px] border-red-500 shadow-sm ${
          dragging ? 'z-30 opacity-70 scale-110' : 'z-20 cursor-pointer'
        } ${isSelected ? 'border-dashed bg-red-500/20' : ''}`}
      />
      {isSelected && !dragging && (
        <div
          style={{
            left: `${position.x}%`,
            top: `${position.y + circle.size / 2 + 5}%`,
            transform: 'translateX(-50%)',
          }}
          className="absolute z-40 flex bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSizeChange(Math.min(60, circle.size * 1.3));
            }}
            className="px-4 py-2 text-xl font-bold hover:bg-gray-100 text-gray-700"
          >
            +
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSizeChange(Math.max(5, circle.size * 0.7));
            }}
            className="px-4 py-2 text-xl font-bold border-l border-r hover:bg-gray-100 text-gray-700"
          >
            -
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="px-4 py-2 text-red-500 hover:bg-red-50"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  );
}

function PinSelectModal({
  isOpen,
  onClose,
  pins,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  pins: { id: number; label: string }[] | undefined;
  onSelect: (label: string) => void;
}) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center pb-2 border-b">
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="text-red-500 w-6 h-6" /> 位置図の場所を選択
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        {pins && pins.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-2">
            {pins.map((pin) => (
              <button
                key={pin.id}
                onClick={() => {
                  onSelect(pin.label);
                  onClose();
                }}
                className="bg-gray-100 text-gray-800 border-2 border-gray-200 font-bold py-3 text-center rounded-xl text-lg shadow-sm hover:border-red-400 hover:bg-red-50 hover:text-red-700 transition-all"
              >
                {pin.label}
              </button>
            ))}
            <button
              onClick={() => {
                onSelect('');
                onClose();
              }}
              className="col-span-3 bg-gray-50 text-gray-500 font-bold py-3 text-center rounded-xl text-sm shadow-inner mt-2"
            >
              選択を解除
            </button>
          </div>
        ) : (
          <div className="text-center py-10 px-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
            <p className="text-gray-500 font-bold">
              先に位置図画面で
              <br />
              マーカーを打ってください
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function PhotoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectWithOptionalPhotos | null>(
    null,
  );
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [currentPhotoId, setCurrentPhotoId] = useState<number | null>(null);
  const [selectedCircleId, setSelectedCircleId] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'projects', id)).then((d) => {
      if (d.exists()) {
        const data = d.data() as ProjectWithOptionalPhotos;
        setProject(data);
      }
    });
  }, [id]);

  const updatePhoto = async (
    photoId: number,
    field: keyof Photo,
    value: any,
  ) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) =>
      p.id === photoId ? { ...p, [field]: value } : p,
    );
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, 'projects', id), { photos: newPhotos });
  };

  const deletePhotoSlot = async (photoId: number) => {
    if (!project || !id) return;
    if (window.confirm('この写真枠を完全に削除しますか？')) {
      const newPhotos = project.photos.filter((p) => p.id !== photoId);
      const renumbered = newPhotos.map((p, i) => ({
        ...p,
        photoNumber: String(i + 1),
      }));
      setProject({ ...project, photos: renumbered });
      await updateDoc(doc(db, 'projects', id), { photos: renumbered });
    }
  };

  const clearPhoto = async (photoId: number) => {
    if (!project || !id) return;
    if (window.confirm('この枠の画像を削除しますか？（文字は残ります）')) {
      const newPhotos = project.photos.map((p) =>
        p.id === photoId ? { ...p, image: null, circles: [] } : p,
      );
      setProject({ ...project, photos: newPhotos });
      await updateDoc(doc(db, 'projects', id), { photos: newPhotos });
    }
  };

  const addPhotoSlot = async () => {
    if (!project || !id) return;
    const newPhotos: Photo[] = [
      ...project.photos,
      {
        id: Date.now(),
        image: null,
        photoNumber: String(project.photos.length + 1),
        shootingDate: '',
        locationMap: '',
        process: '',
        description: '',
        circles: [],
      },
    ];
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, 'projects', id), { photos: newPhotos });
  };

  const movePhoto = async (index: number, direction: 'up' | 'down') => {
    if (!project || !id) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === project.photos.length - 1) return;
    const newPhotos = [...project.photos];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    [newPhotos[index], newPhotos[targetIndex]] = [
      newPhotos[targetIndex],
      newPhotos[index],
    ];

    const renumberedPhotos = newPhotos.map((p, i) => ({
      ...p,
      photoNumber: String(i + 1),
    }));

    setProject({ ...project, photos: renumberedPhotos });
    await updateDoc(doc(db, 'projects', id), { photos: renumberedPhotos });
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!project || !id) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setBulkUploading(true);
    let newPhotos = [...project.photos];
    let uploadedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let targetIndex = newPhotos.findIndex((p) => !p.image);

      if (targetIndex === -1) {
        newPhotos.push({
          id: Date.now() + Math.random(),
          image: null,
          photoNumber: String(newPhotos.length + 1),
          shootingDate: '',
          locationMap: '',
          process: '',
          description: '',
          circles: [],
        });
        targetIndex = newPhotos.length - 1;
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        compressImage(file, async (compressed) => {
          const r = ref(storage, `photos/${id}/${Date.now()}_bulk_${i}`);
          await uploadBytes(r, compressed);
          const url = await getDownloadURL(r);
          newPhotos[targetIndex] = {
            ...newPhotos[targetIndex],
            image: url,
            shootingDate: new Date().toLocaleDateString('ja-JP'),
            circles: [],
          };
          resolve();
        });
      });
      uploadedCount += 1;
      setBulkProgress(uploadedCount);
    }

    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, 'projects', id), { photos: newPhotos });
    setBulkUploading(false);
    setBulkProgress(0);
  };

  const uploadPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (!project || !id) return;
    if (!e.target.files || !e.target.files[0]) return;
    const photoId = project.photos[index].id;
    setLoadingId(photoId);
    compressImage(e.target.files[0], async (file) => {
      const r = ref(storage, `photos/${id}/${Date.now()}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      const newPhotos = project.photos.map((p, i) =>
        p.id === photoId
          ? {
              ...p,
              image: url,
              photoNumber: String(i + 1),
              shootingDate: new Date().toLocaleDateString('ja-JP'),
              circles: [],
            }
          : p,
      );
      setProject({ ...project, photos: newPhotos });
      await updateDoc(doc(db, 'projects', id), { photos: newPhotos });
      setLoadingId(null);
    });
  };

  const addCircleToPhoto = async (
    e: React.MouseEvent<HTMLDivElement>,
    photoId: number,
  ) => {
    if (!project || !id) return;
    // ★修正：赤丸の基準を「写真そのもののサイズ」に合わせました！これでズレません！
    if (selectedCircleId !== null) {
      setSelectedCircleId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newPhotos = project.photos.map((p) => {
      if (p.id === photoId) {
        const circles = p.circles || [];
        return {
          ...p,
          circles: [...circles, { id: Date.now(), x, y, size: 20 }],
        };
      }
      return p;
    });
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, 'projects', id), { photos: newPhotos });
  };

  const updateCircle = async (
    photoId: number,
    circleId: number,
    newProps: Partial<Circle>,
  ) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) =>
      p.id === photoId
        ? {
            ...p,
            circles: p.circles.map((c) =>
              c.id === circleId ? { ...c, ...newProps } : c,
            ),
          }
        : p,
    );
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, 'projects', id), { photos: newPhotos });
  };

  const removeCircle = async (photoId: number, circleId: number) => {
    if (!project || !id) return;
    const newPhotos = project.photos.map((p) =>
      p.id === photoId
        ? { ...p, circles: p.circles.filter((c) => c.id !== circleId) }
        : p,
    );
    setProject({ ...project, photos: newPhotos });
    await updateDoc(doc(db, 'projects', id), { photos: newPhotos });
    setSelectedCircleId(null);
  };

  if (!project) return null;

  return (
    <div
      className="min-h-screen bg-gray-50 p-6 font-sans overflow-x-hidden"
      onClick={() => setSelectedCircleId(null)}
    >
      <div className="max-w-md mx-auto pb-12">
        <button
          onClick={() => navigate(`/project/${id}`)}
          className="flex items-center gap-2 text-blue-500 mb-6 font-bold text-lg"
        >
          <ArrowLeft className="w-6 h-6" /> もどる
        </button>
        <h1 className="text-3xl font-bold mb-6 text-gray-900">
          写真の登録と赤丸記入
        </h1>

        <div className="bg-white p-5 rounded-3xl border border-black/5 shadow-sm mb-6">
          <label className="flex items-center justify-center gap-2 w-full bg-blue-500 text-white font-bold py-4 text-lg rounded-xl cursor-pointer shadow-md hover:bg-blue-600 transition-colors">
            <UploadCloud className="w-6 h-6" />
            {bulkUploading
              ? `一括アップロード中... (${bulkProgress}枚完了)`
              : '複数写真を一括追加する'}
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleBulkUpload}
              disabled={bulkUploading}
            />
          </label>
        </div>

        <div className="space-y-8 mt-4">
          {project.photos.map((photo, index) => (
            <div
              key={photo.id}
              className="bg-white p-5 rounded-3xl border border-black/5 shadow-md relative"
            >
              <div className="absolute top-4 right-4 flex gap-2 z-10">
                <button
                  onClick={() => movePhoto(index, 'up')}
                  className="bg-white p-2 rounded-lg shadow border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <ArrowUp className="w-5 h-5" />
                </button>
                <button
                  onClick={() => movePhoto(index, 'down')}
                  className="bg-white p-2 rounded-lg shadow border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <ArrowDown className="w-5 h-5" />
                </button>
              </div>

              {/* ★修正：赤丸ズレ防止のため、画像にピッタリ合うラッパーを作成！ */}
              <div className="w-full h-64 mt-10 bg-gray-100 rounded-2xl flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300 relative mb-4 p-2">
                {loadingId === photo.id ? (
                  <span className="text-lg font-bold text-blue-500">
                    保存中...
                  </span>
                ) : photo.image ? (
                  <div
                    className="relative inline-block"
                    style={{ maxWidth: '100%', maxHeight: '100%' }}
                    onClick={(e) => addCircleToPhoto(e, photo.id)}
                  >
                    <img
                      src={photo.image}
                      className="block max-w-full max-h-[14rem] object-contain pointer-events-none rounded shadow-sm"
                    />
                    {(photo.circles || []).map((circle) => (
                      <PhotoCircleMarker
                        key={circle.id}
                        circle={circle}
                        isSelected={selectedCircleId === circle.id}
                        onSelect={() => setSelectedCircleId(circle.id)}
                        onDragEnd={(x, y) =>
                          updateCircle(photo.id, circle.id, { x, y })
                        }
                        onSizeChange={(size) =>
                          updateCircle(photo.id, circle.id, { size })
                        }
                        onRemove={() => removeCircle(photo.id, circle.id)}
                      />
                    ))}
                    <div className="absolute -top-3 -left-3 bg-black/70 text-white text-xs px-2 py-1 rounded-full font-bold pointer-events-none shadow">
                      タップで赤丸追加
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-400">
                    <Camera className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <span className="font-bold">画像を選択してください</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center mb-5 pb-4 border-b border-gray-100">
                <div className="font-bold text-gray-800 text-xl">
                  写真 {index + 1}
                </div>
                <div className="flex gap-2">
                  {photo.image ? (
                    <button
                      onClick={() => clearPhoto(photo.id)}
                      className="p-2.5 text-gray-400 hover:text-red-500 bg-gray-50 rounded-xl border border-gray-200"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => deletePhotoSlot(photo.id)}
                      className="p-2.5 text-gray-400 hover:text-red-500 bg-gray-50 rounded-xl border border-gray-200"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                  <label className="bg-blue-100 text-blue-700 font-bold py-2.5 px-5 rounded-xl cursor-pointer shadow-sm">
                    {photo.image ? '画像を変更' : '画像を選択'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => uploadPhoto(e, index)}
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-5">
                <button
                  onClick={() => {
                    setCurrentPhotoId(photo.id);
                    setModalOpen(true);
                  }}
                  className={`w-full p-4 text-lg border-2 rounded-xl text-left flex justify-between items-center ${
                    photo.locationMap
                      ? 'text-red-700 font-bold border-red-300 bg-red-50'
                      : 'text-gray-500 border-gray-300 bg-gray-50'
                  }`}
                >
                  {photo.locationMap ||
                    '▼ どの場所の写真ですか？（タップして選択）'}
                  <MapPin
                    className={`w-6 h-6 ${
                      photo.locationMap ? 'text-red-500' : 'text-gray-400'
                    }`}
                  />
                </button>
                <input
                  type="text"
                  placeholder="工程 例: 葺き直し"
                  className="w-full p-3.5 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  value={photo.process}
                  onChange={(e) =>
                    updatePhoto(photo.id, 'process', e.target.value)
                  }
                />
                <textarea
                  placeholder="説明（短文）"
                  rows={2}
                  className="w-full p-3.5 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  value={photo.description}
                  onChange={(e) =>
                    updatePhoto(photo.id, 'description', e.target.value)
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addPhotoSlot}
          className="w-full mt-8 bg-gray-800 text-white font-bold py-4 text-lg rounded-xl shadow-lg flex items-center justify-center gap-2 hover:bg-gray-700"
        >
          <Plus className="w-6 h-6" /> 写真枠を1つ追加する
        </button>
      </div>
      <PinSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        pins={project.mapPins}
        onSelect={(label: string) =>
          currentPhotoId &&
          updatePhoto(
            currentPhotoId,
            'locationMap',
            label,
          )
        }
      />
    </div>
  );
}

