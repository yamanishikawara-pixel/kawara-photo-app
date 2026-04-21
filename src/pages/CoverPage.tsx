import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Eye } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { LoadingSpinner } from '../shared/LoadingSpinner';

// ── 黄金比定数 ──────────────────────────────────────
const PHI = 1.6180339887;
const W = 595, H = 842;
const SIDE = 89;
const CW = W - SIDE * 2; // 417px
const LABEL_W = Math.round(CW / (PHI * PHI)); // 159px
const T = { xs: 8, sm: 11, base: 13, md: 18, lg: 21, xl: 34 };

// ── 型定義 ──────────────────────────────────────────
interface CoverData {
  projectName: string;      // 工事件名
  projectLocation: string;  // 工事場所
  constructionPeriod: string; // 工期
  contractor: string;       // 施工業者
  reportDate: string;       // 作成年月日
}

// ── AutoFitText ──────────────────────────────────────
function AutoFitText({ text, maxSize = T.md, style = {} }: { text: string; maxSize?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fs, setFs] = useState(maxSize);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement!;
    let size = maxSize;
    el.style.fontSize = size + 'px';
    while (el.scrollWidth > parent.clientWidth && size > 6) {
      size -= 0.5;
      el.style.fontSize = size + 'px';
    }
    setFs(size);
  }, [text, maxSize]);

  return (
    <span ref={ref} style={{ whiteSpace: 'nowrap', display: 'block', fontSize: fs, ...style }}>
      {text || '　'}
    </span>
  );
}

// ── ロゴ ──────────────────────────────────────────────
function LogoMark({ size = 34, color = '#c0392b' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      <circle cx="22" cy="22" r="20" stroke={color} strokeWidth="2" />
      <text x="22" y="18" textAnchor="middle" fontFamily="'Noto Serif JP', serif" fontSize="6.5" fill={color} fontWeight="600">有限会社</text>
      <text x="22" y="27" textAnchor="middle" fontFamily="'Noto Serif JP', serif" fontSize="6.5" fill={color} fontWeight="600">山西瓦店</text>
    </svg>
  );
}

// ── A4プレビュー（C案） ───────────────────────────────
function CoverPreview({ data, pageLabel = '1 / 5' }: { data: CoverData; pageLabel?: string }) {
  const outerM = 34;
  const innerO = 8;
  const outerH = H - outerM * 2;
  const titleZoneH = Math.round(outerH * (1 - 1 / PHI));

  const fields = [
    { label: '工事件名', value: data.projectName },
    { label: '工事場所', value: data.projectLocation },
    { label: '工期', value: data.constructionPeriod },
    { label: '施工業者', value: data.contractor },
    { label: '作成年月日', value: data.reportDate },
  ];

  return (
    <div style={{ width: W, height: H, background: '#f7f6f3', fontFamily: "'Noto Serif JP', serif", padding: outerM, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ flex: 1, border: '1.5px solid #1a1a1a', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* 内枠 */}
        <div style={{ position: 'absolute', inset: innerO, border: '0.5px solid #bbb', pointerEvents: 'none' }} />

        {/* タイトルゾーン */}
        <div style={{ height: titleZoneH, borderBottom: '1.5px solid #1a1a1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 13 }}>
          <div style={{ fontSize: T.xl, fontWeight: 700, letterSpacing: '0.35em', textIndent: '0.35em', color: '#111', lineHeight: 1 }}>
            工事写真報告書
          </div>
          <div style={{ width: Math.round((W - outerM * 2 - innerO * 2) / PHI), height: '0.5px', background: '#bbb' }} />
        </div>

        {/* フィールドゾーン */}
        <div style={{ flex: 1, padding: `0 ${SIDE - outerM}px`, display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '100%' }}>
            {fields.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: `${LABEL_W - 10}px 1fr`, borderBottom: i < fields.length - 1 ? '1px solid #ddd' : 'none', borderTop: i === 0 ? '1px solid #ddd' : 'none' }}>
                <div style={{ padding: '12px 13px', fontSize: T.sm, color: '#555', borderRight: '1px solid #ddd', background: 'rgba(0,0,0,0.025)', display: 'flex', alignItems: 'center', fontFamily: "'Noto Sans JP', sans-serif" }}>
                  <span style={{ display: 'block', width: '100%', textAlign: 'justify', textAlignLast: 'justify' }}>{f.label}</span>
                </div>
                <div style={{ padding: '12px 21px', display: 'flex', alignItems: 'center', overflow: 'hidden', minWidth: 0 }}>
                  <AutoFitText text={f.value} maxSize={T.md} style={{ fontWeight: 500, letterSpacing: '0.06em', color: '#111' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* フッター */}
        <div style={{ height: 55, borderTop: '1.5px solid #1a1a1a', padding: '0 21px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <LogoMark size={34} color="#c0392b" />
          <div style={{ fontSize: T.xs, color: '#aaa', fontFamily: "'Noto Sans JP', sans-serif", letterSpacing: '0.2em' }}>{pageLabel}</div>
        </div>
      </div>
    </div>
  );
}

// ── 入力フィールド ─────────────────────────────────────
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 6, letterSpacing: '0.08em' }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 14px',
          background: '#12122a', border: '1px solid #2e2e50',
          borderRadius: 10, color: '#f0ede8',
          fontSize: 14, outline: 'none',
          fontFamily: 'inherit',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = '#ff6b35')}
        onBlur={e => (e.currentTarget.style.borderColor = '#2e2e50')}
      />
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────
export function CoverPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false); // モバイル用
  const [data, setData] = useState<CoverData>({
    projectName: '',
    projectLocation: '',
    constructionPeriod: '',
    contractor: '',
    reportDate: new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' }),
  });

  // Firestoreからロード
  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'projects', id))
      .then(d => {
        if (d.exists()) {
          const proj = d.data();
          setData({
            projectName: proj.projectName ?? '',
            projectLocation: proj.projectLocation ?? '',
            constructionPeriod: proj.constructionPeriod ?? '',
            contractor: proj.contractor ?? '',
            reportDate: proj.reportDate ?? new Date().toLocaleDateString('ja-JP'),
          });
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const update = (key: keyof CoverData) => (value: string) => {
    setData(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'projects', id), { ...data });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen font-sans" style={{ background: '#0f0f1a', color: '#f0ede8' }}>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pt-4 pb-16">

        {/* ── ヘッダー ── */}
        <div className="flex items-center justify-between py-5">
          <button
            type="button"
            onClick={() => navigate(`/project/${id}`)}
            className="flex items-center gap-2 font-bold text-sm transition-colors"
            style={{ color: '#8b8ba8' }}
            onPointerEnter={e => (e.currentTarget.style.color = '#ff6b35')}
            onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
          >
            <ArrowLeft className="w-4 h-4" />
            現場ホーム
          </button>

          <div className="flex items-center gap-3">
            {/* モバイル用プレビュー切り替え */}
            <button
              type="button"
              onClick={() => setShowPreview(v => !v)}
              className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold border transition-colors"
              style={{ borderColor: '#2e2e50', color: '#8b8ba8' }}
            >
              <Eye className="w-4 h-4" />
              {showPreview ? '編集' : 'プレビュー'}
            </button>

            {/* 保存ボタン */}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
              style={{
                background: saved ? '#10b981' : '#ff6b35',
                color: '#fff',
                opacity: saving ? 0.7 : 1,
              }}
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中…' : saved ? '保存済み ✓' : '保存'}
            </button>
          </div>
        </div>

        {/* ── タイトル ── */}
        <div className="mb-6">
          <h1 className="text-xl font-bold" style={{ color: '#f0ede8' }}>表紙</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>現場名・住所・工期の入力</p>
        </div>

        {/* ── レイアウト（左：フォーム / 右：A4プレビュー） ── */}
        <div className="flex gap-8 items-start">

          {/* フォームパネル */}
          <div
            className={`w-full lg:w-80 shrink-0 flex flex-col gap-4 rounded-2xl p-5 border ${showPreview ? 'hidden lg:flex' : 'flex'}`}
            style={{ background: '#1c1c30', borderColor: '#2e2e50' }}
          >
            <Field label="工事件名" value={data.projectName} onChange={update('projectName')} placeholder="神明社：屋根補修工事" />
            <Field label="工事場所" value={data.projectLocation} onChange={update('projectLocation')} placeholder="霧部市" />
            <Field label="工期" value={data.constructionPeriod} onChange={update('constructionPeriod')} placeholder="2026年4月1日" />
            <Field label="施工業者" value={data.contractor} onChange={update('contractor')} placeholder="有限会社山西瓦店" />
            <Field label="作成年月日" value={data.reportDate} onChange={update('reportDate')} placeholder="2026/4/14" />
          </div>

          {/* A4プレビューパネル */}
          <div className={`flex-1 min-w-0 ${!showPreview ? 'hidden lg:flex' : 'flex'} justify-center`}>
            <div style={{ transform: 'scale(0.75)', transformOrigin: 'top center', marginBottom: `calc((${H}px * 0.75) - ${H}px)` }}>
              <CoverPreview data={data} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
