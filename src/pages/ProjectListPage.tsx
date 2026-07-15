import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, LogOut, Settings, CheckCircle2, Circle, HardHat, Database, AlertTriangle, Calculator, Camera, ChevronRight, X } from 'lucide-react';
import { collection, addDoc, deleteDoc, doc, getDoc, getDocs, query, where, orderBy, updateDoc, increment } from 'firebase/firestore';
import { ref, listAll, deleteObject, getMetadata } from 'firebase/storage';
import { signOut } from 'firebase/auth';

import { db, auth, storage } from '../firebase';
import type { Project, WorkTypeTemplate } from '../types';
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
    <>
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
      {percent >= 80 && (
        <div
          className="mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
          style={{
            background: percent >= 90 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
            border: `1px solid ${percent >= 90 ? '#ef4444' : '#f59e0b'}`,
            color: percent >= 90 ? '#f87171' : '#fbbf24',
          }}
        >
          <span>{percent >= 90 ? '⚠️ ストレージが残りわずかです。不要な写真を削除してください。' : '⚠️ ストレージ使用量が80%を超えました。'}</span>
        </div>
      )}
    </>
  );
}

export function ProjectListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [workTypeTemplates, setWorkTypeTemplates] = useState<WorkTypeTemplate[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedWorkTypeId, setSelectedWorkTypeId] = useState<number | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [storageUsed, setStorageUsed] = useState(0);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [swipeState, setSwipeState] = useState<{
    id: string;
    startX: number;
    currentX: number;
  } | null>(null);
  const swipeActionRef = useRef(false);

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
          if (Array.isArray(d.workTypeTemplates)) setWorkTypeTemplates(d.workTypeTemplates);
        }
      } catch (err) {
        logFirebaseError(err, '現場一覧読込');
        setError(firebaseErrorMessage(err, '現場一覧の読み込み'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [refreshCounter]); // eslint-disable-line react-hooks/exhaustive-deps

  // タブがアクティブになったとき最新データを再取得
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setRefreshCounter(c => c + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    // 予算書アプリ等から `?search=工事名` で来訪したとき、その文字列で検索する。
    // searchParams.get は既に URL デコード済みの値を返すため、ここで
    // decodeURIComponent を再度呼ぶと "%" を含む工事名が壊れる。trim だけで十分。
    const term = searchParams.get('search');
    if (term) {
      setSearchQuery(term.trim());
      const next = new URLSearchParams(searchParams);
      next.delete('search');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateModal = () => {
    setNewProjectName('');
    setSelectedWorkTypeId(null);
    setShowCreateModal(true);
  };

  const createProject = async () => {
    setError(null);
    setCreatingProject(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not logged in');
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const savedCompanyName = userDoc.exists() ? userDoc.data().companyName : '';

      const template = workTypeTemplates.find(t => t.id === selectedWorkTypeId);
      const validItems = (template?.items ?? []).filter(item => item.process.trim() !== '');
      const photos = validItems.length > 0
        ? validItems.map((item, i) => ({
            id: Date.now() + i,
            image: null,
            photoNumber: String(i + 1),
            shootingDate: '',
            locationMap: '',
            process: item.process,
            description: item.description,
            standard: item.standard ?? '',
            checkItem: item.checkItem ?? '',
            circles: [],
            dimensionLines: [],
          }))
        : [
            { id: Date.now(), image: null, photoNumber: '1', shootingDate: '', locationMap: '', process: '', description: '', circles: [], dimensionLines: [] },
          ];

      const docRef = await addDoc(collection(db, 'projects'), {
        userId: user.uid,
        projectName: newProjectName.trim() || '新規現場',
        projectLocation: '',
        constructionPeriod: '',
        contractorName: savedCompanyName || '',
        creationDate: new Date().toLocaleDateString('ja-JP'),
        photos,
        materials: [],
        mapUrls: [],
        mapRows: [{ id: 1, symbol: '', part: '本棟', relatedPhotoNumber: '' }],
        mapPins: [],
        createdAt: new Date().toISOString(),
      });
      setShowCreateModal(false);
      navigate(`/project/${docRef.id}`);
    } catch (err) {
      logFirebaseError(err, '新規現場作成');
      setError(firebaseErrorMessage(err, '新規現場の作成'));
    } finally {
      setCreatingProject(false);
    }
  };

  const deleteProject = async (id: string) => {
    setError(null);
    setIsDeleting(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        setError('ログインが必要です。');
        return;
      }

      // ── W-5: 所有権の二重チェック ────────────────────────────
      // 一覧フェッチ時に userId 一致でフィルタしているが、
      // 引数 id を直接受けるため、削除直前にも所有権を再検証する。
      // (Firestore セキュリティルールが守る前提だが、多重防御として)
      const projectSnap = await getDoc(doc(db, 'projects', id));
      if (!projectSnap.exists()) {
        setError('対象の現場が見つかりません。');
        return;
      }
      const projectData = projectSnap.data() as Project & { userId?: string };
      if (projectData.userId && projectData.userId !== user.uid) {
        setError('この現場を削除する権限がありません。');
        return;
      }

      // ── C-3: 削除前に Storage 上のサイズを合算 ───────────────
      // listAll で得た item ごとに getMetadata でサイズ取得。
      // 並列実行(Promise.allSettled)で getMetadata の遅延を吸収。
      // 失敗した item はサイズ 0 扱いで続行(削除自体は試みる)。
      const folders = [
        `maps/${id}`,
        `photos/${id}`,
        `materials/${id}`,
        `users/${user.uid}/projects/${id}`,
      ];

      let totalBytes = 0;
      for (const folder of folders) {
        try {
          const list = await listAll(ref(storage, folder));
          // メタデータ取得 + 削除を1ファイル単位でまとめて並列実行
          const results = await Promise.allSettled(
            list.items.map(async (item) => {
              let size = 0;
              try {
                const meta = await getMetadata(item);
                size = meta.size ?? 0;
              } catch {
                // メタ取得失敗でも削除は続行(サイズ加算は諦める)
              }
              await deleteObject(item);
              return size;
            }),
          );
          for (const r of results) {
            if (r.status === 'fulfilled') totalBytes += r.value;
          }
        } catch (e) {
          import.meta.env.DEV && console.warn('Storageフォルダ削除失敗:', folder, e);
        }
      }

      // ── Firestore ドキュメント削除 ────────────────────────────
      await deleteDoc(doc(db, 'projects', id));

      // ── C-3: storageUsedBytes 減算 ────────────────────────────
      // ファイル単位の trackDelete を呼ぶよりも 1回でまとめて減算する方が
      // Firestore writes コストを抑えられる。
      if (totalBytes > 0) {
        try {
          await updateDoc(doc(db, 'users', user.uid), {
            storageUsedBytes: increment(-totalBytes),
          });
          setStorageUsed((prev) => Math.max(0, prev - totalBytes));
        } catch (e) {
          import.meta.env.DEV && console.warn('storageUsedBytes 減算失敗:', e);
        }
      }

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

  const SWIPE_THRESHOLD = 80; // px

  const handleSwipeStart = (id: string, clientX: number) => {
    setSwipeState({ id, startX: clientX, currentX: clientX });
  };

  const handleSwipeMove = (id: string, clientX: number) => {
    if (!swipeState || swipeState.id !== id) return;
    setSwipeState(prev => prev ? { ...prev, currentX: clientX } : null);
  };

  const handleSwipeEnd = (id: string, project: ProjectWithId) => {
    if (!swipeState || swipeState.id !== id) {
      setSwipeState(null);
      return;
    }
    const delta = swipeState.currentX - swipeState.startX;
    setSwipeState(null);
    if (delta < -SWIPE_THRESHOLD) {
      // 左スワイプ → 削除確認
      swipeActionRef.current = true;
      setConfirmDelete({ id });
    } else if (delta > SWIPE_THRESHOLD) {
      // 右スワイプ → 完了トグル
      swipeActionRef.current = true;
      void toggleCompleted({ stopPropagation: () => {} } as React.MouseEvent, id, !!project.isCompleted);
    }
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

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(p =>
      (p.projectName || '').toLowerCase().includes(q) ||
      (p.projectLocation || '').toLowerCase().includes(q) ||
      (p.contractorName || '').toLowerCase().includes(q)
    );
  }, [projects, searchQuery]);

  const visibleProjects = useMemo(() => {
    if (hideCompleted) return filteredProjects.filter(p => !p.isCompleted);
    return filteredProjects;
  }, [filteredProjects, hideCompleted]);

  if (loading || isDeleting) return <LoadingSpinner />;

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

        {/* ── 課金警告バナー（Blaze プラン：超過すると実費発生） ── */}
        {(() => {
          const pct = Math.min(100, Math.round((storageUsed / STORAGE_LIMIT_BYTES) * 100));
          if (pct < 80) return null;
          const isCritical = pct >= 95;
          const isWarning  = pct >= 80;
          if (!isWarning) return null;
          return (
            <div
              className="mt-3 flex items-start gap-3 px-4 py-3 rounded-xl border font-bold text-sm"
              style={{
                background: isCritical ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.10)',
                borderColor: isCritical ? '#ef4444' : '#f59e0b',
                color:       isCritical ? '#f87171' : '#fbbf24',
              }}
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                {isCritical ? (
                  <>
                    <div>🚨 ストレージが {pct}% に達しています！</div>
                    <div className="text-xs font-normal mt-1" style={{ opacity: 0.85 }}>
                      Blaze プランのため、上限（500MB）を超えると追加料金が発生します。
                      不要な現場・写真を今すぐ削除してください。
                      <button
                        onClick={() => navigate('/settings')}
                        className="ml-2 underline font-bold"
                      >
                        設定で再計算 →
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>⚠ ストレージが {pct}% に達しています</div>
                    <div className="text-xs font-normal mt-1" style={{ opacity: 0.85 }}>
                      まもなく上限（500MB）です。不要な現場の削除をご検討ください。
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {error && (
          <div className="mt-4">
            <ErrorMessage message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {/* ── アプリランチャー ── */}
        <div className="grid grid-cols-2 gap-3 mt-4 mb-2">
          <a
            href="#project-list"
            className="flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border transition-all active:scale-95"
            style={{ background: '#1c1c30', borderColor: '#2e2e50', textDecoration: 'none' }}
            onPointerEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#ff6b35'; }}
            onPointerLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#2e2e50'; }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,107,53,0.15)' }}>
              <Camera className="w-7 h-7" style={{ color: '#ff6b35' }} />
            </div>
            <div className="text-center">
              <div className="font-black text-sm" style={{ color: '#f0ede8' }}>工事写真台帳</div>
              <div className="text-xs mt-0.5 flex items-center justify-center gap-0.5" style={{ color: '#6b7280' }}>
                現場一覧 <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </a>
          <button
            type="button"
            onClick={() => navigate('/budget')}
            className="flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border transition-all active:scale-95"
            style={{ background: '#1c1c30', borderColor: '#2e2e50' }}
            onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#10b981'; }}
            onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e50'; }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.15)' }}>
              <Calculator className="w-7 h-7" style={{ color: '#10b981' }} />
            </div>
            <div className="text-center">
              <div className="font-black text-sm" style={{ color: '#f0ede8' }}>実行予算書</div>
              <div className="text-xs mt-0.5 flex items-center justify-center gap-0.5" style={{ color: '#6b7280' }}>
                全現場一覧 <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </button>
        </div>

        {/* ── タイトル行 ── */}
        <div id="project-list" className="flex items-center justify-between mt-8 mb-6">
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
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl font-bold text-sm transition-colors"
              style={{ background: '#ff6b35', color: '#fff', boxShadow: '0 0 16px rgba(255,107,53,0.35)' }}
              onPointerEnter={e => (e.currentTarget.style.background = '#e85d2a')}
              onPointerLeave={e => (e.currentTarget.style.background = '#ff6b35')}
            >
              <Plus className="w-5 h-5" /> 新規現場
            </button>
          </div>
        </div>

        {/* 検索ボックス */}
        <div className="mb-6 relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="w-4 h-4" fill="none" stroke="#6b7280" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
          </div>
          <input
            type="search"
            placeholder="現場名・住所・請負先で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full py-2.5 pl-10 pr-10 rounded-xl border text-sm transition-colors"
            style={{
              background: '#1c1c30',
              borderColor: '#2e2e50',
              color: '#f0ede8',
              outline: 'none',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#ff6b35')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#2e2e50')}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md"
              style={{ color: '#6b7280' }}
              onPointerEnter={(e) => (e.currentTarget.style.color = '#f0ede8')}
              onPointerLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* ── プロジェクト一覧 ── */}
        {visibleProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#1c1c30' }}>
              <HardHat className="w-8 h-8" style={{ color: '#ff6b35' }} />
            </div>
            <p className="font-bold" style={{ color: '#8b8ba8' }}>
              {searchQuery
                ? `「${searchQuery}」に一致する現場がありません`
                : projects.length === 0
                  ? '現場がまだありません'
                  : '完了済みのみで、表示する現場がありません'}
            </p>
            {!searchQuery && projects.length === 0 && (
              <button
                type="button"
                onClick={openCreateModal}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm"
                style={{ background: '#ff6b35', color: '#fff' }}
              >
                <Plus className="w-4 h-4" /> 最初の現場を作成
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
            {visibleProjects.map((p) => {
              const isExactMatch = !!searchQuery && p.projectName === searchQuery;
              const thumb = p.photos?.find(ph => ph.image)?.image ?? null;
              const photoCount = p.photos?.filter(ph => ph.image).length ?? 0;
              return (
                <div
                  key={p.id}
                  className="group cursor-pointer rounded-2xl border overflow-hidden transition-all relative"
                  style={{
                    background: p.isCompleted ? '#141422' : '#1c1c30',
                    borderColor: isExactMatch ? '#ff6b35' : '#2e2e50',
                    boxShadow: isExactMatch ? '0 0 0 2px rgba(255,107,53,0.3)' : 'none',
                    opacity: p.isCompleted ? 0.65 : 1,
                    transform: swipeState?.id === p.id
                      ? `translateX(${Math.max(-100, Math.min(100, swipeState.currentX - swipeState.startX))}px)`
                      : 'translateX(0)',
                    transition: swipeState?.id === p.id ? 'none' : 'transform 0.3s ease',
                    touchAction: 'pan-y',
                  }}
                  onClick={() => {
                    if (swipeActionRef.current) {
                      swipeActionRef.current = false;
                      return;
                    }
                    if (swipeState) return; // スワイプ中はナビゲーション無効
                    navigate(`/project/${p.id}`);
                  }}
                  onPointerDown={e => handleSwipeStart(p.id, e.clientX)}
                  onPointerMove={e => handleSwipeMove(p.id, e.clientX)}
                  onPointerUp={() => handleSwipeEnd(p.id, p)}
                  onPointerCancel={() => setSwipeState(null)}
                  onPointerEnter={e => {
                    if (!swipeState) {
                      (e.currentTarget as HTMLDivElement).style.borderColor = '#ff6b35';
                      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 24px rgba(255,107,53,0.15)';
                    }
                  }}
                  onPointerLeave={e => {
                    // W3: スワイプ中はスタイル操作しない（ガタつき防止）
                    if (swipeState?.id === p.id) return;
                    (e.currentTarget as HTMLDivElement).style.borderColor = isExactMatch ? '#ff6b35' : '#2e2e50';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = isExactMatch ? '0 0 0 2px rgba(255,107,53,0.3)' : 'none';
                  }}
                >
                  {/* スワイプ方向ヒント */}
                  {swipeState?.id === p.id && (
                    <>
                      {(swipeState.currentX - swipeState.startX) < -20 && (
                        <div className="absolute inset-y-0 right-0 flex items-center px-4 rounded-r-2xl pointer-events-none" style={{ background: 'rgba(239,68,68,0.15)' }}>
                          <Trash2 className="w-5 h-5" style={{ color: '#ef4444' }} />
                        </div>
                      )}
                      {(swipeState.currentX - swipeState.startX) > 20 && (
                        <div className="absolute inset-y-0 left-0 flex items-center px-4 rounded-l-2xl pointer-events-none" style={{ background: 'rgba(16,185,129,0.15)' }}>
                          <CheckCircle2 className="w-5 h-5" style={{ color: '#10b981' }} />
                        </div>
                      )}
                    </>
                  )}
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
                      <>
                        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.35)' }} />
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: '#10b981', color: '#fff' }}>
                          <span>✓</span> 完了
                        </div>
                      </>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            const name = p.projectName?.trim();
                            const addr = (p.projectLocation ?? '').trim();
                            let url = name ? `/budget?project=${encodeURIComponent(name)}` : '/budget';
                            if (addr) url += `&address=${encodeURIComponent(addr)}`;
                            navigate(url);
                          }}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: '#3d3d60' }}
                          onPointerEnter={e => (e.currentTarget.style.color = '#10b981')}
                          onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}
                          title="実行予算書を開く"
                        >
                          <Calculator className="w-4 h-4" />
                        </button>
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
            {searchQuery
              ? `${visibleProjects.length} / ${projects.length} 件（検索: "${searchQuery}"）`
              : `${visibleProjects.length} 件の現場`}
          </p>
        )}
      </div>

      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowCreateModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-project-modal-title"
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 sm:p-6 text-left"
            style={{ background: '#1c1c30', border: '1px solid #2e2e50', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 id="create-project-modal-title" className="text-lg font-bold" style={{ color: '#f0ede8' }}>
                新規現場を作成
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded transition-colors"
                style={{ color: '#8b8ba8' }}
                onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
                onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
                aria-label="閉じる"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="block text-xs font-bold mb-1.5" style={{ color: '#6b7280' }}>現場名</label>
            <input
              type="text"
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              placeholder="例：○○邸新築工事"
              className="w-full p-3 rounded-xl text-sm font-bold outline-none transition-colors mb-4"
              style={{ background: '#12122a', border: '1px solid #2e2e50', color: '#f0ede8' }}
            />

            {workTypeTemplates.length > 0 && (
              <>
                <label className="block text-xs font-bold mb-1.5" style={{ color: '#6b7280' }}>
                  工種（選択すると工程・説明を自動でセットします）
                </label>
                <div className="flex flex-wrap gap-2 mb-5">
                  <button
                    type="button"
                    onClick={() => setSelectedWorkTypeId(null)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
                    style={selectedWorkTypeId === null
                      ? { borderColor: '#ff6b35', color: '#ff6b35', background: 'rgba(255,107,53,0.08)' }
                      : { borderColor: '#2e2e50', color: '#8b8ba8', background: 'transparent' }}
                  >
                    なし
                  </button>
                  {workTypeTemplates.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedWorkTypeId(t.id)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
                      style={selectedWorkTypeId === t.id
                        ? { borderColor: '#ff6b35', color: '#ff6b35', background: 'rgba(255,107,53,0.08)' }
                        : { borderColor: '#2e2e50', color: '#8b8ba8', background: 'transparent' }}
                    >
                      {t.name || '無題'}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-3 font-bold rounded-xl border transition-colors text-sm"
                style={{ borderColor: '#2e2e50', color: '#8b8ba8', background: 'transparent' }}
                onPointerEnter={e => { e.currentTarget.style.borderColor = '#f0ede8'; e.currentTarget.style.color = '#f0ede8'; }}
                onPointerLeave={e => { e.currentTarget.style.borderColor = '#2e2e50'; e.currentTarget.style.color = '#8b8ba8'; }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={createProject}
                disabled={creatingProject}
                className="flex-1 py-3 font-bold rounded-xl text-sm transition-colors disabled:opacity-50"
                style={{ background: '#ff6b35', color: '#fff' }}
                onPointerEnter={e => { if (!creatingProject) e.currentTarget.style.opacity = '0.85'; }}
                onPointerLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                {creatingProject ? '作成中...' : '作成'}
              </button>
            </div>
          </div>
        </div>
      )}

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
