import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, LogOut, Settings } from 'lucide-react';
// ★ 修正：orderBy を追加！
import { collection, addDoc, deleteDoc, doc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { signOut } from 'firebase/auth';

import { db, auth, storage } from '../firebase';
import type { Project } from '../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { ConfirmModal } from '../shared/ConfirmModal';

interface ProjectWithId extends Project {
  id: string;
  userId?: string;
}

export function ProjectListPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setError(null);
      try {
        const user = auth.currentUser;
        if (!user) {
          setError('ユーザー情報が取得できません。再度ログインしてください。');
          setLoading(false);
          return;
        }

        // ★ 修正：Firestore側で「作成日時が新しい順」にソートさせて取得！
        const q = query(
          collection(db, 'projects'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        
        const snap = await getDocs(q);
        const fetchedProjects = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectWithId));
        
        // ※ クライアント側での .sort() 処理は不要になったので削除！
        setProjects(fetchedProjects);
      } catch (err: any) {
        console.error(err);
        // ★ インデックス未作成の場合、ここにFirebaseからの「インデックス作成リンク」付きエラーが出ます
        if (err.code === 'failed-precondition') {
           setError('初回実行のため、インデックスの作成が必要です。コンソールの指示に従ってください。');
        } else {
           setError('現場一覧の読み込みに失敗しました。');
        }
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  // --- 削除処理・新規追加処理は変更なし ---
  const addProject = async () => {
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in");
      const docRef = await addDoc(collection(db, 'projects'), {
        userId: user.uid,
        projectName: '新規現場',
        projectLocation: '',
        constructionPeriod: '',
        contractorName: '山西瓦店',
        creationDate: new Date().toLocaleDateString('ja-JP'),
        photos: [
          { id: Date.now(), image: null, photoNumber: '1', shootingDate: '', locationMap: '', process: '', description: '', circles: [] },
        ],
        mapUrls: [],
        mapRows: [{ id: 1, symbol: '', part: '本棟', relatedPhotoNumber: '' }],
        mapPins: [],
        createdAt: new Date().toISOString(),
      });
      navigate(`/project/${docRef.id}`);
    } catch { setError('新規現場の作成に失敗しました。'); }
  };

  const deleteProject = async (id: string) => {
    setError(null);
    setIsDeleting(true);
    try {
      const folders = ['maps', 'photos', 'materials'];
      for (const folder of folders) {
        const folderRef = ref(storage, `${folder}/${id}`);
        try {
          const fileList = await listAll(folderRef);
          await Promise.all(fileList.items.map((item) => deleteObject(item)));
        } catch (err) { console.log(`${folder} フォルダは空でした`); }
      }
      await deleteDoc(doc(db, 'projects', id));
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch { setError('削除に失敗しました。'); } finally { setIsDeleting(false); setConfirmDelete(null); }
  };

  const handleLogout = async () => {
    if (window.confirm('ログアウトしますか？')) {
      await signOut(auth);
      navigate('/login');
    }
  };

  if (loading || isDeleting) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto space-y-6 pb-12">
        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
        <div className="flex items-center gap-4 shrink-0">
             <button onClick={() => navigate('/settings')} className="text-gray-400 hover:text-blue-600 flex items-center gap-1 text-sm font-bold transition-colors">
               <Settings className="w-5 h-5" /> 設定
             </button>
           <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm font-bold shrink-0">
             <LogOut className="w-4 h-4" /> ログアウト
           </button>
        </div>

        <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-4">
          <h1 className="text-3xl font-bold text-gray-900">現場一覧</h1>
          <button type="button" onClick={addProject} className="flex items-center gap-2 bg-blue-500 text-white px-5 py-3 rounded-xl font-bold text-base shadow-sm hover:bg-blue-600 transition-colors">
            <Plus className="w-5 h-5" /> 新規現場
          </button>
        </div>

        <div className="space-y-4">
          {projects.map((p) => (
            <div key={p.id} className="relative flex items-center p-5 rounded-2xl border bg-white border-black/5 shadow-sm hover:border-blue-300 transition-all cursor-pointer group" onClick={() => navigate(`/project/${p.id}`)}>
              <div className="flex-1">
                <div className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{p.projectName || '未入力の現場'}</div>
                <div className="text-xs text-gray-500 mt-2">{p.projectLocation || '場所未登録'}</div>
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: p.id }); }} className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"><Trash2 className="w-6 h-6" /></button>
            </div>
          ))}
        </div>
      </div>
      <ConfirmModal isOpen={!!confirmDelete} title="現場の完全削除" message="この現場データと、アップロードされたすべての写真を完全に削除します。よろしいですか？" confirmLabel="完全に削除する" onConfirm={() => confirmDelete && deleteProject(confirmDelete.id)} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}