import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, FileDown, MapPin, Wrench, ClipboardList, ChevronRight, ArrowLeftRight, Calculator, Share2, Copy, Check } from 'lucide-react';

import type { Project } from '../types';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';

type MenuItem = {
  title: string;
  subtitle: string;
  icon: typeof Camera;
  path: string;
  accent: string;
  external?: boolean;
};

/**
 * 実行予算書アプリ(kawara-budget)側のバリデーションルールに合致するか確認する。
 *
 * - 予算書側 (`kawara-budget/src/projectStorage.js`) の `validateProjectSlug` と
 *   揃えてあるため、片方を変えるときはもう片方も更新すること。
 * - エラー時はユーザー向けメッセージを返す。OK なら null。
 *
 * @param name 確認対象の現場名(trim 済みであること)
 */
function validateBudgetProjectName(name: string): string | null {
  if (!name) return '現場名が空です';
  if (name.includes('/') || name.includes('\\')) {
    return '現場名にスラッシュ（/ ¥）は使えません';
  }
  if (name === '.' || name === '..') {
    return '現場名に「.」「..」は使えません';
  }
  if (/^__.*__$/.test(name)) {
    return '現場名の先頭末尾の二重アンダースコアは予約されています';
  }
  if (name.length > 100) {
    return '現場名は100文字以下にしてください';
  }
  return null;
}

const MENU_ITEMS: MenuItem[] = [
  {
    title: '写真',
    subtitle: '赤丸・寸法線付き写真の登録',
    icon: Camera,
    path: 'photo',
    accent: '#ff6b35',
  },
  {
    title: '位置図',
    subtitle: '図面登録・赤丸・矢印の配置',
    icon: MapPin,
    path: 'map',
    accent: '#3b82f6',
  },
  {
    title: '材料',
    subtitle: '使用部材の登録',
    icon: Wrench,
    path: 'material',
    accent: '#8b5cf6',
  },
  {
    title: '表紙',
    subtitle: '現場名・住所・工期の入力',
    icon: ClipboardList,
    path: 'cover',
    accent: '#10b981',
  },
  {
    title: 'ビフォーアフター',
    subtitle: '施工前後の比較写真登録',
    icon: ArrowLeftRight,
    path: 'before-after',
    accent: '#f59e0b',
  },
  {
    title: 'PDF出力',
    subtitle: '印刷・ダウンロード',
    icon: FileDown,
    path: 'pdf',
    accent: '#6366f1',
  },
  {
    title: '実行予算書',
    subtitle: '原価・見積・粗利の管理',
    icon: Calculator,
    path: '__budget__',
    accent: '#10b981',
    external: true,
  },
];

export function HomePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    let aborted = false;
    (async () => {
      try {
        const d = await getDoc(doc(db, 'projects', id));
        if (aborted) return;
        if (d.exists()) {
          setError(null);
          setProject(d.data() as Project);
        } else {
          setError('現場データが見つかりません。');
        }
      } catch (err) {
        if (aborted) return;
        logFirebaseError(err, '現場ホーム読込');
        setError(firebaseErrorMessage(err, '現場データの読み込み'));
      }
    })();
    return () => { aborted = true; };
  }, [id]);

  const handleGenerateShareLink = async () => {
    if (!id) return;
    setSharing(true);
    try {
      const token = crypto.randomUUID();
      await setDoc(doc(db, 'shares', token), {
        projectId: id,
        ownerUid: auth.currentUser?.uid ?? '',
        createdAt: new Date().toISOString(),
      });
      // Firestore ルールの `allow read: if resource.data.shareToken != null` を満たすため
      // project にも同じトークンを書き込む
      await updateDoc(doc(db, 'projects', id), { shareToken: token });
      const url = `${window.location.origin}/share/${token}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 3000);
      } catch { /* クリップボード API が使えない環境でも URL 表示は続ける */ }
    } catch {
      setError('共有リンクの発行に失敗しました。');
    } finally {
      setSharing(false);
    }
  };

  if (error && !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 font-sans" style={{ background: '#0f0f1a' }}>
        <ErrorMessage message={error} onDismiss={() => setError(null)} />
        <button onClick={() => navigate('/')} className="mt-4 flex items-center gap-2 font-bold" style={{ color: '#ff6b35' }}>
          <ArrowLeft className="w-4 h-4" /> 現場一覧へ
        </button>
      </div>
    );
  }

  if (!project) return <LoadingSpinner />;

  const thumb = project.photos?.find(ph => ph.image)?.image ?? null;
  const photoCount = project.photos?.filter(ph => ph.image).length ?? 0;

  return (
    <div className="min-h-screen font-sans" style={{ background: '#0f0f1a', color: '#f0ede8' }}>
      <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 pt-4 pb-16">

        {/* ── ヘッダー ── */}
        <div className="flex items-center py-5">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 font-bold text-sm transition-colors"
            style={{ color: '#8b8ba8' }}
            onPointerEnter={e => (e.currentTarget.style.color = '#ff6b35')}
            onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
          >
            <ArrowLeft className="w-4 h-4" />
            現場一覧
          </button>
        </div>

        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} className="mb-4" />}

        {/* ── 現場ヒーロー ── */}
        <div className="rounded-2xl overflow-hidden border mb-6" style={{ borderColor: '#2e2e50' }}>
          {/* サムネイル */}
          <div className="relative w-full aspect-video" style={{ background: '#12122a' }}>
            {thumb ? (
              <img src={thumb} alt="現場写真" className="absolute inset-0 object-cover w-full h-full" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Camera className="w-12 h-12" style={{ color: '#2e2e50' }} />
              </div>
            )}
            {/* グラデーションオーバーレイ */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(15,15,26,0.85) 0%, transparent 60%)' }} />
            {/* 写真枚数 */}
            {photoCount > 0 && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(0,0,0,0.6)', color: '#f0ede8', backdropFilter: 'blur(6px)' }}>
                📷 {photoCount}枚
              </div>
            )}
            {/* 現場名オーバーレイ */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <div className="text-xl md:text-2xl font-bold leading-snug break-words" style={{ color: '#f0ede8' }}>
                {project.projectName || '現場名未入力'}
              </div>
              {project.projectLocation && (
                <div className="text-xs mt-1 truncate" style={{ color: '#e8d5b7', opacity: 0.8 }}>
                  📍 {project.projectLocation}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 共有リンク ── */}
        <div className="mb-4 rounded-2xl border px-5 py-4" style={{ borderColor: '#2e2e50', background: '#1c1c30' }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold" style={{ color: '#f0ede8' }}>共有リンク</div>
              <div className="text-xs mt-0.5" style={{ color: '#6b7280' }}>閲覧専用リンクを発行してPDF確認を共有</div>
            </div>
            <button
              onClick={handleGenerateShareLink}
              disabled={sharing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all disabled:opacity-50 shrink-0"
              style={{ background: '#12122a', color: '#6366f1', border: '1px solid #2e2e50' }}
              onPointerEnter={e => { if (!sharing) (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1'; }}
              onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e50'; }}
            >
              <Share2 className="w-3.5 h-3.5" />
              {sharing ? '発行中...' : 'リンクを発行'}
            </button>
          </div>
          {shareUrl && (
            <div className="mt-3 flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 text-xs px-3 py-2 rounded-lg font-mono truncate outline-none"
                style={{ background: '#12122a', border: '1px solid #2e2e50', color: '#8b8ba8' }}
                onFocus={e => e.currentTarget.select()}
              />
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 2000);
                  } catch {
                    setError('クリップボードへのコピーに失敗しました。');
                  }
                }}
                className="p-2 rounded-lg transition-colors shrink-0"
                style={{ background: '#12122a', border: '1px solid #2e2e50', color: shareCopied ? '#10b981' : '#6b7280' }}
                title="コピー"
              >
                {shareCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
          {shareCopied && !shareUrl && (
            <p className="mt-2 text-xs font-bold" style={{ color: '#10b981' }}>クリップボードにコピーしました</p>
          )}
        </div>

        {/* ── メニュー ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const handleClick = () => {
              if (item.external && item.path === '__budget__') {
                const projectName = project?.projectName?.trim();
                if (!projectName) {
                  alert('現場名が未入力です。先に「表紙」で現場名を登録してください。');
                  return;
                }
                // ── 予算書アプリ側のバリデーションルールを事前チェック ──
                // (kawara-budget/src/projectStorage.js の validateProjectSlug と同等)
                // 予算書側はこれらの文字を含む工事名を弾くため、写真台帳側で先に
                // 親切なアラートを出してユーザーに対処してもらう。ルールが変わった
                // 場合は両方を更新する必要があることに注意。
                const validationError = validateBudgetProjectName(projectName);
                if (validationError) {
                  alert(`実行予算書を開けません:\n${validationError}\n\n「表紙」画面で現場名を修正してから再度お試しください。`);
                  return;
                }
                window.open(
                  `https://kawara-budget.web.app/?project=${encodeURIComponent(projectName)}`,
                  '_blank',
                  'noopener,noreferrer'
                );
                return;
              }
              navigate(`/project/${id}/${item.path}`);
            };
            return (
              <button
                key={item.path}
                type="button"
                onClick={handleClick}
                className="w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-colors"
                style={{ background: '#1c1c30', borderColor: '#2e2e50' }}
                onPointerEnter={e => {
                  const el = e.currentTarget;
                  el.style.borderColor = item.accent;
                  el.style.background = '#21213a';
                }}
                onPointerLeave={e => {
                  const el = e.currentTarget;
                  el.style.borderColor = '#2e2e50';
                  el.style.background = '#1c1c30';
                }}
              >
                {/* アイコン */}
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${item.accent}18` }}>
                  <Icon className="w-5 h-5" style={{ color: item.accent }} />
                </div>
                {/* テキスト */}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm break-words" style={{ color: '#f0ede8' }}>
                    {item.title}
                    {item.external && (
                      <span className="ml-1.5 text-xs font-normal" style={{ color: '#6b7280' }}>↗</span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5 truncate" style={{ color: '#6b7280' }}>{item.subtitle}</div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#3d3d60' }} />
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
