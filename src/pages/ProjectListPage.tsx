import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, LogOut } from 'lucide-react';
import { collection, addDoc, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage'; // ★追加：倉庫のお掃除道具
import { signOut } from 'firebase/auth';

import { db, auth, storage } from '../firebase'; // ★追加：storage（画像倉庫）を呼び出し
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
  const [isDeleting, setIsDeleting] = useState(false); // ★追加：削除中のローディング状態

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
          where('userId', '==', user.uid)
        );
        const snap = await getDocs(q);
        const fetchedProjects = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectWithId));
        
        fetchedProjects.sort((a, b) => {
          const dateA = a.createdAt || '';
          const dateB = b.createdAt || '';
          return dateB.localeCompare(dateA);
        });

        setProjects(fetchedProjects);
      } catch (err) {
        console.error(err);
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

  // ==========================================
  // ★ 究極のお掃除システム：現場と一緒に写真も全消去
  // ==========================================
  const deleteProject = async (id: string) => {
    setError(null);
    setIsDeleting(true); // 削除中マークをオン
    try {
      // ① まずは画像倉庫（Storage）のお掃除
      // maps, photos, materials の3つのフォルダを確認し、中身の画像を全部消す
      const folders = ['maps', 'photos', 'materials'];
      for (const folder of folders) {
        const folderRef = ref(storage, `${folder}/${id}`);
        try {
          const fileList = await listAll(folderRef);
          // フォルダの中の全画像を一つずつ爆破（削除）していく
          const deletePromises = fileList.items.map((item) => deleteObject(item));
          await Promise.all(deletePromises);
        } catch (err) {
          // 写真が1枚も登録されていない時はエラーが出るが、問題ないのでスルーする
          console.log(`${folder} フォルダは空でした`);
        }
      }

      // ② 次に、文字データ（Firestore）を削除
      await deleteDoc(doc(db, 'projects', id));
      
      // ③ 最後に画面からその現場を消す
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError('削除に失敗しました。電波の良いところで再度お試しください。');
    } finally {
      setIsDeleting(false); // 削除中マークをオフ
      setConfirmDelete(null);
    }
  };
  // ==========================================

  const handleLogout = async () => {
    if (window.confirm('ログアウトしますか？')) {
      await signOut(auth);
      navigate('/login');
    }
  };

  if (loading || isDeleting) return <LoadingSpinner />; // ★削除中もグルグルを表示

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-md mx-auto space-y-6 pb-12">
        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
        
        <div className="flex justify-between items-center pt-2">
           <div className="text-sm font-bold text-gray-500 overflow-hidden text-ellipsis whitespace-nowrap max-w-[70%]">
             {auth.currentUser?.email}
           </div>
           <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm font-bold shrink-0">
             <LogOut className="w-4 h-4" /> ログアウト
           </button>
        </div>

        <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-4">
          <h1 className="text-3xl font-bold text-gray-900">現場一覧</h1>
          <button
            type="button"
            onClick={addProject}
            className="flex items-center gap-2 bg-blue-500 text-white px-5 py-3 rounded-xl font-bold text-base shadow-sm hover:bg-blue-600 transition-colors"
            aria-label="新規現場を追加"
          >
            <Plus className="w-5 h-5" /> 新規現場
          </button>
        </div>

        {projects.length === 0 && !loading && !error && (
          <div className="text-center py-12 text-gray-500 font-bold bg-white rounded-2xl border border-dashed border-gray-300">
            まだ現場がありません。<br/>「＋ 新規現場」から作成してください！
          </div>
        )}

        <div className="space-y-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="relative flex items-center p-5 rounded-2xl border bg-white border-black/5 shadow-sm hover:border-blue-300 transition-all cursor-pointer group"
              onClick={() => navigate(`/project/${p.id}`)}
            >
              <div className="flex-1">
                <div className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
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
                className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
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
        title="現場の完全削除"
        message="この現場データと、アップロードされた【すべての写真】を完全に削除します。よろしいですか？"
        confirmLabel="完全に削除する"
        onConfirm={() => confirmDelete && deleteProject(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}