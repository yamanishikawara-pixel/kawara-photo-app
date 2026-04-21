import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, GripVertical } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { LoadingSpinner } from '../shared/LoadingSpinner';

// ── 定数 ────────────────────────────────────────────
const W = 595, H = 842;
const SERIF = "'Noto Serif JP', serif";
const SANS  = "'Noto Sans JP', sans-serif";

// ── 型 ──────────────────────────────────────────────
export interface BeforeAfterItem {
  id: string;
  title: string;          // 工事箇所名
  beforeImage: string;    // base64 or URL
  afterImage: string;
  beforeDesc: string;     // 施工前の説明
  afterDesc: string;      // 施工後の説明
}

// ── A4プレビュー（C案：1ページ2箇所）────────────────
function A4Page({
  items,
  pageIndex,
  totalPages,
  projectName,
  contractor,
}: {
  items: BeforeAfterItem[];   // 最大2件
  pageIndex: number;
  totalPages: number;
  projectName: string;
  contractor: string;
}) {
  const headerH = 60;
  const footerH = 52;
  const available = H - headerH - footerH - 32;
  const itemH = Math.floor(available / 2);
  const photoH = itemH - 36 - 68 - 28;  // itemH - titleH - descH - gaps
  const photoW = (W - 80 - 4) / 2;

  return (
    <div style={{ width: W, height: H, background: '#fff', fontFamily: SANS, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

      {/* ヘッダー */}
      <div style={{ height: headerH, borderBottom: '2px solid #1a1a1a', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.2em', fontFamily: SERIF, color: '#111' }}>施工前後比較</div>
        </div>
        <div style={{ fontSize: 10, color: '#aaa', letterSpacing: '0.15em' }}>{pageIndex + 1} / {totalPages}</div>
      </div>

      {/* 2箇所ループ */}
      {items.map((item, idx) => {
        const num = pageIndex * 2 + idx + 1;
        return (
          <div key={item.id} style={{
            height: itemH,
            borderBottom: idx === 0 ? '1.5px solid #e0e0e0' : 'none',
            padding: '14px 40px 0',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {/* タイトル */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 16, background: '#e55a2b', borderRadius: 2, flexShrink: 0 }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111', letterSpacing: '0.08em' }}>
                {`⑤`.replace('5', String(num)).replace('⑤', `${'①②③④⑤⑥⑦⑧⑨⑩'[num - 1] ?? num}`)} {item.title || '工事箇所'}
              </div>
            </div>

            {/* ラベルバー */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
              <div style={{ background: '#555', color: '#fff', textAlign: 'center', padding: '5px 0', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', fontFamily: SERIF }}>施　工　前</div>
              <div style={{ background: '#2a7a4b', color: '#fff', textAlign: 'center', padding: '5px 0', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', fontFamily: SERIF }}>施　工　後</div>
            </div>

            {/* 写真 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
              {[item.beforeImage, item.afterImage].map((src, pi) => (
                <div key={pi} style={{ width: photoW, height: photoH, background: '#ddd', overflow: 'hidden', flexShrink: 0 }}>
                  {src ? (
                    <img src={src} alt={pi === 0 ? '施工前' : '施工後'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: pi === 0 ? '#c8d0d8' : '#a8c4b2' }}>
                      <div style={{ fontSize: 28, opacity: 0.5 }}>📷</div>
                      <div style={{ fontSize: 9, color: 'rgba(0,0,0,0.4)', fontFamily: SANS, letterSpacing: '0.08em' }}>{pi === 0 ? '施工前' : '施工後'}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 説明 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
              <div style={{ background: '#f4f4f4', padding: '8px 10px', borderTop: '2px solid #888' }}>
                <div style={{ fontSize: 9.5, color: '#444', lineHeight: 1.8, letterSpacing: '0.03em' }}>{item.beforeDesc || '施工前の状況を記入してください。'}</div>
              </div>
              <div style={{ background: '#eef6f1', padding: '8px 10px', borderTop: '2px solid #2a7a4b' }}>
                <div style={{ fontSize: 9.5, color: '#1a4a2e', lineHeight: 1.8, letterSpacing: '0.03em' }}>{item.afterDesc || '施工後の状況を記入してください。'}</div>
              </div>
            </div>
          </div>
        );
      })}

      {/* 2件目が空の場合のパディング */}
      {items.length < 2 && <div style={{ height: itemH }} />}

      <div style={{ flex: 1 }} />

      {/* フッター */}
      <div style={{ height: footerH, borderTop: '1px solid #e0e0e0', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 10, color: '#aaa', fontFamily: SERIF, letterSpacing: '0.1em' }}>{contractor}</div>
        <div style={{ fontSize: 10, color: '#aaa', letterSpacing: '0.1em' }}>{projectName}</div>
      </div>
    </div>
  );
}

// ── 入力フォームカード（1箇所分）─────────────────────
function ItemCard({
  item,
  index,
  onChange,
  onDelete,
  onImageUpload,
}: {
  item: BeforeAfterItem;
  index: number;
  onChange: (field: keyof BeforeAfterItem, value: string) => void;
  onDelete: () => void;
  onImageUpload: (side: 'before' | 'after', dataUrl: string) => void;
}) {
  const num = '①②③④⑤⑥⑦⑧⑨⑩'[index] ?? index + 1;

  const handleFile = (side: 'before' | 'after') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onImageUpload(side, ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    background: '#12122a', border: '1px solid #2e2e50',
    borderRadius: 8, color: '#f0ede8', fontSize: 13,
    outline: 'none', fontFamily: 'inherit',
  };
  const textareaStyle: React.CSSProperties = {
    ...inputStyle, resize: 'vertical', minHeight: 72, lineHeight: 1.7,
  };

  return (
    <div style={{ background: '#1c1c30', border: '1px solid #2e2e50', borderRadius: 14, padding: '16px', marginBottom: 12 }}>
      {/* カードヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <GripVertical size={16} style={{ color: '#3d3d60', cursor: 'grab' }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: '#ff6b35', letterSpacing: '0.05em', flex: 1 }}>{num} 工事箇所</div>
        <button
          type="button"
          onClick={onDelete}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, borderRadius: 6 }}
          title="削除"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* タイトル */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 5, letterSpacing: '0.08em' }}>工事箇所名</label>
        <input
          type="text"
          value={item.title}
          onChange={e => onChange('title', e.target.value)}
          placeholder="例：下地板取替え・屋根下 化粧板"
          style={inputStyle}
        />
      </div>

      {/* 写真アップロード */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {(['before', 'after'] as const).map(side => (
          <div key={side}>
            <label style={{ display: 'block', fontSize: 10, color: side === 'before' ? '#aaa' : '#4ade80', marginBottom: 5, letterSpacing: '0.08em', fontWeight: 600 }}>
              {side === 'before' ? '📷 施工前' : '📷 施工後'}
            </label>
            <label style={{ display: 'block', cursor: 'pointer' }}>
              <input type="file" accept="image/*" onChange={handleFile(side)} style={{ display: 'none' }} />
              <div style={{
                height: 90, borderRadius: 8, overflow: 'hidden',
                border: `1.5px dashed ${side === 'before' ? '#3d3d60' : '#1a5e38'}`,
                background: side === 'before' ? '#12122a' : '#0f1f15',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {(side === 'before' ? item.beforeImage : item.afterImage) ? (
                  <img
                    src={side === 'before' ? item.beforeImage : item.afterImage}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, marginBottom: 4, opacity: 0.4 }}>+</div>
                    <div style={{ fontSize: 9, color: '#4b5563' }}>タップして選択</div>
                  </div>
                )}
              </div>
            </label>
          </div>
        ))}
      </div>

      {/* 説明テキスト */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 5, letterSpacing: '0.08em' }}>施工前の状況</label>
          <textarea value={item.beforeDesc} onChange={e => onChange('beforeDesc', e.target.value)} placeholder="劣化・損傷の状態を記入" style={textareaStyle} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 5, letterSpacing: '0.08em' }}>施工後の状態</label>
          <textarea value={item.afterDesc} onChange={e => onChange('afterDesc', e.target.value)} placeholder="修繕内容・効果を記入" style={textareaStyle} />
        </div>
      </div>
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────
export function BeforeAfterPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [contractor, setContractor] = useState('');
  const [items, setItems] = useState<BeforeAfterItem[]>([
    { id: crypto.randomUUID(), title: '', beforeImage: '', afterImage: '', beforeDesc: '', afterDesc: '' },
  ]);

  // Firestoreロード
  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'projects', id))
      .then(d => {
        if (d.exists()) {
          const p = d.data();
          setProjectName(p.projectName ?? '');
          setContractor(p.contractor ?? '');
          if (p.beforeAfterItems?.length) setItems(p.beforeAfterItems);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const addItem = () =>
    setItems(prev => [...prev, { id: crypto.randomUUID(), title: '', beforeImage: '', afterImage: '', beforeDesc: '', afterDesc: '' }]);

  const deleteItem = (idx: number) =>
    setItems(prev => prev.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: keyof BeforeAfterItem, value: string) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const uploadImage = (idx: number, side: 'before' | 'after', dataUrl: string) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [side === 'before' ? 'beforeImage' : 'afterImage']: dataUrl } : it));

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'projects', id), { beforeAfterItems: items });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  // ページ分割（1ページ2箇所）
  const pages: BeforeAfterItem[][] = [];
  for (let i = 0; i < items.length; i += 2) pages.push(items.slice(i, i + 2));

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen font-sans" style={{ background: '#0f0f1a', color: '#f0ede8' }}>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pt-4 pb-16">

        {/* ヘッダー */}
        <div className="flex items-center justify-between py-5">
          <button
            type="button"
            onClick={() => navigate(`/project/${id}`)}
            className="flex items-center gap-2 text-sm font-bold"
            style={{ color: '#8b8ba8' }}
            onPointerEnter={e => (e.currentTarget.style.color = '#ff6b35')}
            onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
          >
            <ArrowLeft className="w-4 h-4" />
            現場ホーム
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold"
            style={{ background: saved ? '#10b981' : '#ff6b35', color: '#fff', opacity: saving ? 0.7 : 1 }}
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中…' : saved ? '保存済み ✓' : '保存'}
          </button>
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-bold">施工前後比較</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>1ページに2箇所 / A4出力対応</p>
        </div>

        {/* 左右レイアウト */}
        <div className="flex gap-8 items-start">

          {/* 左：入力フォーム */}
          <div className="w-full lg:w-96 shrink-0 flex flex-col gap-0">
            {items.map((item, idx) => (
              <ItemCard
                key={item.id}
                item={item}
                index={idx}
                onChange={(f, v) => updateItem(idx, f, v)}
                onDelete={() => deleteItem(idx)}
                onImageUpload={(side, dataUrl) => uploadImage(idx, side, dataUrl)}
              />
            ))}
            <button
              type="button"
              onClick={addItem}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold border-2 border-dashed transition-colors"
              style={{ borderColor: '#2e2e50', color: '#6b7280' }}
              onPointerEnter={e => { e.currentTarget.style.borderColor = '#ff6b35'; e.currentTarget.style.color = '#ff6b35'; }}
              onPointerLeave={e => { e.currentTarget.style.borderColor = '#2e2e50'; e.currentTarget.style.color = '#6b7280'; }}
            >
              <Plus className="w-4 h-4" />
              工事箇所を追加
            </button>
          </div>

          {/* 右：A4プレビュー */}
          <div className="hidden lg:flex flex-col gap-6 flex-1 min-w-0 items-center">
            <div style={{ fontSize: 11, color: '#4b5563', letterSpacing: '0.1em' }}>A4 プレビュー（{pages.length}ページ）</div>
            {pages.map((pageItems, pi) => (
              <div key={pi} style={{ transform: 'scale(0.7)', transformOrigin: 'top center', marginBottom: `calc(${H}px * 0.7 - ${H}px)` }}>
                <A4Page
                  items={pageItems}
                  pageIndex={pi}
                  totalPages={pages.length}
                  projectName={projectName}
                  contractor={contractor}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
