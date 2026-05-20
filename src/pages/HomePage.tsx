import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, FileDown, MapPin, Wrench, ClipboardList, ChevronRight, ArrowLeftRight, Calculator } from 'lucide-react';

import type { Project } from '../types';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
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

        {/* ── メニュー ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const handleClick = () => {
              if (item.external && item.path === '__budget__') {
                window.open('https://kawara-budget.web.app', '_blank', 'noopener,noreferrer');
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
