import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, LogOut, Settings, CheckCircle2, Circle, HardHat, Database } from 'lucide-react';
import { collection, addDoc, deleteDoc, doc, getDoc, getDocs, query, where, orderBy, updateDoc } from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { signOut } from 'firebase/auth';

import { db, auth, storage } from '../firebase';
import type { Project } from '../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { ConfirmModal } from '../shared/ConfirmModal';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';
import { formatBytes, STORAGE_LIMIT_BYTES } from '../shared/storageUtils';

interface ProjectWithId extends Project {
  id: string;
  userId?: string;
}

// ==========================================
// ストレージ使用量バー
// ==========================================
function StorageUsageBar({ used, quota, onClick }: { used: number; quota: number; onClick?: () => void }) {
  const percent = Math.min(100, Math.round((used / quota) * 100));

  let barColor = '#10b981';
  let textColor = '#8b8ba8';
  if (percent >= 85) {
    barColor = '#ef4444';
    textColor = '#f87171';
  } else if (percent >= 60) {
    barColor = '#f59e0b';
    textColor = '#fbbf24';
  }

  const warningMsg = percent >= 90 ? ' ⚠ 容量不足です' : percent >= 75 ? ' ⚠ まもなく上限' : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors mt-4"
      style={{ background: '#1c1c30', borderColor: '#2e2e50' }}
      onPointerEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = barColor;
      }}
      onPointerLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e50';
      }}
    >
      <Database className="w-4 h-4 shrink-0" style={{ color: barColor }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold tracking-wide" style={{ color: textColor }}>
            ストレージ{warningMsg}
          </span>
          <span className="text-xs font-bold" style={{ color: textColor }}>
            {formatBytes(used)} / {formatBytes(quota)} <span style={{ opacity: 0.7 }}>({percent}%)</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#12122a' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${percent}%`,
              background: barColor,
              boxShadow: percent >= 60 ? `0 0 8px ${barColor}66` : 'none',
            }}
          />
        </div>
      </div>
    </button>
  );
}

export function ProjectListPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [storageUsed, setStorageUsed] = useState(0);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
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
        setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectWithId)));
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const d = userDoc.data();
          if (d.companyName) setCompanyName(d.companyName);
          if (d.logoUrl) setLogoUrl(d.logoUrl);
          setStorageUsed(d.storageUsedBytes ?? 0);
        }
      } catch (err) {
        logFirebaseError(err, '現場一覧読込');
        setError(firebaseErrorMessage(err, '現場一覧の読み込み'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const addProject = async () => {
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not logged in');
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
    } catch (err) {
      logFirebaseError(err, '新規現場作成');
      setError(firebaseErrorMessage(err, '新規現場の作成'));
    }
  };

  const deleteProject = async (id: string) => {
    setError(null);
    setIsDeleting(true);
    try {
      const user = auth.currentUser;
      for (const folder of ['maps', 'photos', 'materials']) {
        try {
          const list = await listAll(ref(storage, `${folder}/${id}`));
          await Promise.all(list.items.map((item) => deleteObject(item)));
        } catch { /* 空フォルダは無視 */ }
      }
      if (user) {
        try {
          const list = await listAll(ref(storage, `users/${user.uid}/projects/${id}`));
          await Promise.all(list.items.map((item) => deleteObject(item)));
        } catch { /* 添付資料がない場合は無視 */ }
      }
      await deleteDoc(doc(db, 'projects', id));
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      logFirebaseError(err, '現場削除');
      setError(firebaseErrorMessage(err, '現場の削除'));
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  };

  const toggleCompleted = async (e: React.MouseEvent, projectId: string, current: boolean) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'projects', projectId), { isCompleted: !current });
      setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, isCompleted: !current } : p));
    } catch (err) {
      logFirebaseError(err, '完了状態更新');
      setError(firebaseErrorMessage(err, '完了状態の更新'));
    }
  };

  const handleLogout = () => {
    setConfirmLogout(true);
  };

  const doLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (err) {
      logFirebaseError(err, 'ログアウト');
      setError(firebaseErrorMessage(err, 'ログアウト'));
    }
  };

  if (loading || isDeleting) return <LoadingSpinner />;

  const visibleProjects = projects.filter((p) => !hideCompleted || !p.isCompleted);

  return (
    <div className="min-h-screen font-sans" style={{ background: '#0f0f1a', color: '#f0ede8' }}>
      <div className="max-w-md md:max-w-6xl mx-auto px-4 sm:px-6 pb-16">

        {/* ── ヘッダー ── */}
        <header className="flex items-center justify-between py-5 border-b" style={{ borderColor: '#2e2e50' }}>
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt="ロゴ" className="h-8 w-auto object-contain rounded" style={{ maxWidth: '120px' }} />
            ) : (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#ff6b35' }}>
                <HardHat className="w-5 h-5 text-white" />
              </div>
            )}
            <span className="text-lg font-bold tracking-widest" style={{ color: '#e8d5b7' }}>
              {companyName || 'KAWARA'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/settings')} className="flex items-center gap-1.5 text-sm font-bold transition-colors" style={{ color: '#8b8ba8' }}
              onPointerEnter={e => (e.currentTarget.style.color = '#ff6b35')}
              onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}>
              <Settings className="w-4 h-4" /> 設定
            </button>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm font-bold transition-colors" style={{ color: '#8b8ba8' }}
              onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
              onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}>
              <LogOut className="w-4 h-4" /> ログアウト
            </button>
          </div>
        </header>

        {/* ── ストレージ使用量バー ── */}
        <StorageUsageBar
          used={storageUsed}
          quota={STORAGE_LIMIT_BYTES}
          onClick={() => navigate('/settings')}
        />

        {error && (
          <div className="mt-4">
            <ErrorMessage message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {/* ── タイトル行 ── */}
        <div className="flex items-center justify-between mt-8 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-wide" style={{ color: '#f0ede8' }}>現場一覧</h1>
            <div className="mt-1 h-0.5 w-12 rounded-full" style={{ background: '#ff6b35' }} />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setHideCompleted((v) => !v)}
              className="text-xs font-bold px-3 py-1.5 rounded-full border transition-colors"
              style={hideCompleted
                ? { borderColor: '#2e2e50', color: '#8b8ba8', background: 'transparent' }
                : { borderColor: '#10b981', color: '#10b981', background: 'rgba(16,185,129,0.08)' }}
            >
              {hideCompleted ? '完了済みを表示' : '完了済みを非表示'}
            </button>
            <button
              type="button"
              onClick={addProject}
              className="flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl font-bold text-sm transition-colors"
              style={{ background: '#ff6b35', color: '#fff', boxShadow: '0 0 16px rgba(255,107,53,0.35)' }}
              onPointerEnter={e => (e.currentTarget.style.background = '#e85d2a')}
              onPointerLeave={e => (e.currentTarget.style.background = '#ff6b35')}
            >
              <Plus className="w-5 h-5" /> 新規現場
            </button>
          </div>
        </div>

        {/* ── プロジェクト一覧 ── */}
        {visibleProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#1c1c30' }}>
              <HardHat className="w-8 h-8" style={{ color: '#ff6b35' }} />
            </div>
            <p className="font-bold" style={{ color: '#8b8ba8' }}>現場がまだありません</p>
            <button
              type="button"
              onClick={addProject}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm"
              style={{ background: '#ff6b35', color: '#fff' }}
            >
              <Plus className="w-4 h-4" /> 最初の現場を作成
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
            {visibleProjects.map((p) => {
              const thumb = p.photos?.find(ph => ph.image)?.image ?? null;
              const photoCount = p.photos?.filter(ph => ph.image).length ?? 0;
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/project/${p.id}`)}
                  className="group cursor-pointer rounded-2xl border overflow-hidden transition-all"
                  style={{
                    background: '#1c1c30',
                    borderColor: p.isCompleted ? '#1e4035' : '#2e2e50',
                    opacity: p.isCompleted ? 0.7 : 1,
                  }}
                  onPointerEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#ff6b35';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 24px rgba(255,107,53,0.15)';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                  }}
                  onPointerLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = p.isCompleted ? '#1e4035' : '#2e2e50';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                  }}
                >
                  <div className="relative w-full aspect-video" style={{ background: '#12122a' }}>
                    {thumb ? (
                      <img src={thumb} alt="現場写真" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <HardHat className="w-10 h-10" style={{ color: '#2e2e50' }} />
                      </div>
                    )}
                    {photoCount > 0 && (
                      <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: 'rgba(0,0,0,0.65)', color: '#f0ede8', backdropFilter: 'blur(4px)' }}>
                        📷 {photoCount}
                      </div>
                    )}
                    {p.isCompleted && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
                        <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.85)', color: '#fff' }}>完了</span>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm leading-snug line-clamp-2" style={{ color: '#f0ede8' }}>
                          {p.projectName || '未入力の現場'}
                        </div>
                        {p.projectLocation && (
                          <div className="text-xs mt-1.5 truncate" style={{ color: '#6b7280' }}>
                            📍 {p.projectLocation}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => toggleCompleted(e, p.id, !!p.isCompleted)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: p.isCompleted ? '#10b981' : '#3d3d60' }}
                          onPointerEnter={e => (e.currentTarget.style.color = '#10b981')}
                          onPointerLeave={e => (e.currentTarget.style.color = p.isCompleted ? '#10b981' : '#3d3d60')}
                          title={p.isCompleted ? '完了を取り消す' : '完了にする'}
                        >
                          {p.isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: p.id }); }}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: '#3d3d60' }}
                          onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {visibleProjects.length > 0 && (
          <p className="mt-6 text-xs text-center" style={{ color: '#3d3d60' }}>
            {visibleProjects.length} 件の現場
          </p>
        )}
      </div>

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="現場の完全削除"
        message="この現場データと、アップロードされたすべての写真を完全に削除します。よろしいですか？"
        confirmLabel="完全に削除する"
        onConfirm={() => confirmDelete && deleteProject(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
      <ConfirmModal
        isOpen={confirmLogout}
        title="ログアウト"
        message="ログアウトしますか？"
        confirmLabel="ログアウト"
        variant="default"
        onConfirm={doLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}
