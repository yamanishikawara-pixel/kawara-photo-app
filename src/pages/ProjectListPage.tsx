import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { collection, addDoc, deleteDoc, doc, getDocs, orderBy, query } from 'firebase/firestore';

import { db } from '../firebase';
import type { Project } from '../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { ConfirmModal } from '../shared/ConfirmModal';

interface ProjectWithId extends Project {
  id: string;
}

export function ProjectListPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string } | null>(null);

  useEffect(() => {
    const fetch = async () => {
      setError(null);
      try {
        const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setProjects(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectWithId))
        );
      } catch {
        setError('現場一覧の読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const addProject = async () => {
    setError(null);
    try {
      const docRef = await addDoc(collection(db, 'projects'), {
        projectName: '新規現場',
        projectLocation: '',
        constructionPeriod: '',
        contractorName: '山西瓦店',
        creationDate: new Date().toLocaleDateString('ja-JP'),
        photos: [
          {
            id: Date.now(),
            image: null,
            photoNumber: '1',
            shootingDate: '',
            locationMap: '',
            process: '',
            description: '',
            circles: [],
          },
        ],
        mapUrls: [],
        mapRows: [{ id: 1, symbol: '', part: '本棟', relatedPhotoNumber: '' }],
        mapPins: [],
        createdAt: new Date().toISOString(),
      });
      navigate(`/project/${docRef.id}`);
    } catch {
      setError('新規現場の作成に失敗しました。');
    }
  };

  const deleteProject = async (id: string) => {
    setError(null);
    try {
      await deleteDoc(doc(db, 'projects', id));
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError('削除に失敗しました。');
    }
    setConfirmDelete(null);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto space-y-6 pb-12">
        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">現場一覧</h1>
          <button
            type="button"
            onClick={addProject}
            className="flex items-center gap-2 bg-blue-500 text-white px-5 py-3 rounded-xl font-bold text-base shadow-sm"
            aria-label="新規現場を追加"
          >
            <Plus className="w-5 h-5" /> 新規現場
          </button>
        </div>
        <div className="space-y-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="relative flex items-center p-5 rounded-2xl border bg-white border-black/5 shadow-sm transition-all"
            >
              <div
                className="flex-1 cursor-pointer"
                onClick={() => navigate(`/project/${p.id}`)}
              >
                <div className="text-lg font-bold text-gray-900">
                  {p.projectName || '未入力の現場'}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  {p.projectLocation || '場所未登録'}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete({ id: p.id });
                }}
                className="p-3 text-gray-300 hover:text-red-500 transition-colors"
                aria-label={`${p.projectName || '現場'}を削除`}
              >
                <Trash2 className="w-6 h-6" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <ConfirmModal
        isOpen={!!confirmDelete}
        title="現場の削除"
        message="この現場データを完全に削除しますか？"
        confirmLabel="削除する"
        onConfirm={() => confirmDelete && deleteProject(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
