import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, LogOut, Settings } from 'lucide-react';
import { collection, addDoc, deleteDoc, doc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
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

        const q = query(
          collection(db, 'projects'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        
        const snap = await getDocs(q);
        const fetchedProjects = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectWithId));
        setProjects(fetchedProjects);
      } catch (err: any) {
        console.error(err);
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

  const addProject = async () => {
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in");

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const savedCompanyName = userDoc.exists() ? userDoc.data().companyName : '';

      const docRef = await addDoc(collection(db, 'projects'), {
        userId: user.uid,
        projectName: '新規現場',
        projectLocation: '',
        constructionPeriod: '',
        contractorName: savedCompanyName || '', 
        creationDate: new Date().toLocaleDateString('ja-JP'),
        photos: [
          { id: Date.now(), image: null, photoNumber: '1', shootingDate: '', locationMap: '', process: '', description: '', circles: [], dimensionLines: [] },
        ],
        materials: [], 
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
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 font-sans">
      {/* ★ スマホでは max-w-md、iPad/PCでは max-w-6xl に広がる */}
      <div className="max-w-md md:max-w-6xl mx-auto space-y-6 pb-12">
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">現場一覧</h1>
          <button type="button" onClick={addProject} className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 sm:px-5 sm:py-3 rounded-xl font-bold text-sm sm:text-base shadow-sm hover:bg-blue-600 transition-colors">
            <Plus className="w-5 h-5" /> 新規現場
          </button>
        </div>

        {/* ★ ここが魔法のグリッド！スマホは1列、iPadは2列、PCは3列 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {projects.map((p) => (
            <div key={p.id} className="relative flex items-center p-5 rounded-2xl border bg-white border-black/5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group min-h-[100px]" onClick={() => navigate(`/project/${p.id}`)}>
              <div className="flex-1 pr-10">
                <div className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors break-words line-clamp-2">{p.projectName || '未入力の現場'}</div>
                <div className="text-xs text-gray-500 mt-2 line-clamp-1">{p.projectLocation || '場所未登録'}</div>
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: p.id }); }} className="absolute right-4 p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"><Trash2 className="w-6 h-6" /></button>
            </div>
          ))}
        </div>
        
      </div>
      <ConfirmModal isOpen={!!confirmDelete} title="現場の完全削除" message="この現場データと、アップロードされたすべての写真を完全に削除します。よろしいですか？" confirmLabel="完全に削除する" onConfirm={() => confirmDelete && deleteProject(confirmDelete.id)} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}