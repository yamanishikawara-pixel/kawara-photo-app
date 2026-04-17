import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, List, Plus, Trash2, ArrowRight, Check } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { BeforeAfterPair, Photo, Project } from '../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';

const ACCENT = '#f59e0b';

type Step = 'list' | 'before' | 'after' | 'form';

export function BeforeAfterPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('list');
  const [pendingBefore, setPendingBefore] = useState<number | null>(null);
  const [pendingAfter, setPendingAfter] = useState<number | null>(null);
  const [part, setPart] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    setError(null);
    getDoc(doc(db, 'projects', id))
      .then(d => {
        if (d.exists()) setProject(d.data() as Project);
        else setError('ビフォーアフターデータが見つかりません。');
      })
      .catch(() => setError('データの読み込みに失敗しました。'));
  }, [id]);

  const photos = (project?.photos ?? []).filter(p => p.image);
  const pairs = project?.beforeAfterPairs ?? [];

  const photoById = (pid: number): Photo | undefined =>
    photos.find(p => p.id === pid);

  const reset = () => {
    setStep('list');
    setPendingBefore(null);
    setPendingAfter(null);
    setPart('');
    setDescription('');
  };

  const savePair = async () => {
    if (!project || !id || pendingBefore === null || pendingAfter === null) return;
    setSaving(true);
    try {
      const newPair: BeforeAfterPair = {
        id: Date.now(),
        beforePhotoId: pendingBefore,
        afterPhotoId: pendingAfter,
        part: part.trim(),
        description: description.trim(),
      };
      const updated = [...pairs, newPair];
      await updateDoc(doc(db, 'projects', id), { beforeAfterPairs: updated });
      setProject(prev => prev ? { ...prev, beforeAfterPairs: updated } : prev);
      reset();
    } catch {
      setError('保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const deletePair = async (pairId: number) => {
    if (!id || !project) return;
    if (!window.confirm('このペアを削除しますか？')) return;
    const updated = pairs.filter(p => p.id !== pairId);
    try {
      await updateDoc(doc(db, 'projects', id), { beforeAfterPairs: updated });
      setProject(prev => prev ? { ...prev, beforeAfterPairs: updated } : prev);
    } catch {
      setError('削除に失敗しました。');
    }
  };

  if (error && !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 font-sans" style={{ background: '#0f0f1a' }}>
        <ErrorMessage message={error} onDismiss={() => setError(null)} />
        <button onClick={() => navigate(`/project/${id}`)} className="mt-4 flex items-center gap-2 font-bold" style={{ color: ACCENT }}>
          <ArrowLeft className="w-4 h-4" /> もどる
        </button>
      </div>
    );
  }

  if (!project) return <LoadingSpinner />;

  // ── 写真選択グリッド ──
  const PhotoGrid = ({
    title, selectedId, onSelect, excludeId,
  }: { title: string; selectedId: number | null; onSelect: (id: number) => void; excludeId?: number | null }) => (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-1 h-6 rounded-full" style={{ background: ACCENT }} />
        <h2 className="text-lg font-bold" style={{ color: '#f0ede8' }}>{title}</h2>
      </div>
      {photos.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: '#8b8ba8' }}>写真が登録されていません。</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.filter(p => p.id !== excludeId).map(photo => {
            const sel = selectedId === photo.id;
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => onSelect(photo.id)}
                className="relative rounded-xl overflow-hidden border-2 transition-all text-left"
                style={{ borderColor: sel ? ACCENT : '#2e2e50', background: '#1c1c30' }}
              >
                <img src={photo.image!} alt="" className="w-full aspect-video object-cover" />
                {sel && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: ACCENT }}>
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div className="px-2 py-1.5">
                  <div className="text-xs font-bold truncate" style={{ color: sel ? ACCENT : '#f0ede8' }}>
                    {photo.photoNumber ? `No.${photo.photoNumber}` : '番号なし'}
                    {photo.process ? ` · ${photo.process}` : ''}
                  </div>
                  {photo.shootingDate && (
                    <div className="text-xs truncate" style={{ color: '#6b7280' }}>{photo.shootingDate}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen font-sans" style={{ background: '#0f0f1a', color: '#f0ede8' }}>
      <div className="max-w-md md:max-w-4xl lg:max-w-5xl mx-auto px-4 sm:px-6 pb-16">

        {/* ヘッダー */}
        <div className="flex items-center justify-between py-5">
          <button
            type="button"
            onClick={() => step === 'list' ? navigate(`/project/${id}`) : reset()}
            className="flex items-center gap-2 font-bold text-sm transition-colors"
            style={{ color: '#8b8ba8' }}
            onMouseEnter={e => (e.currentTarget.style.color = ACCENT)}
            onMouseLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
          >
            <ArrowLeft className="w-4 h-4" />
            <List className="w-4 h-4" />
            {step === 'list' ? '現場メニュー' : 'キャンセル'}
          </button>
        </div>

        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} className="mb-4" />}

        {/* ── リスト画面 ── */}
        {step === 'list' && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1 h-7 rounded-full" style={{ background: ACCENT }} />
              <h1 className="text-2xl font-bold break-words">ビフォーアフター</h1>
            </div>

            {/* 追加ボタン */}
            <button
              type="button"
              onClick={() => setStep('before')}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed font-bold text-sm mb-5 transition-colors"
              style={{ borderColor: '#2e2e50', color: '#6b7280' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#2e2e50'; e.currentTarget.style.color = '#6b7280'; }}
            >
              <Plus className="w-4 h-4" /> ペアを追加
            </button>

            {/* ペア一覧 */}
            {pairs.length === 0 ? (
              <p className="text-center text-sm py-12" style={{ color: '#4b4b70' }}>
                施工前後の比較ペアがまだありません
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pairs.map((pair, idx) => {
                  const before = photoById(pair.beforePhotoId);
                  const after = photoById(pair.afterPhotoId);
                  return (
                    <div key={pair.id} className="rounded-2xl border overflow-hidden" style={{ background: '#1c1c30', borderColor: '#2e2e50' }}>
                      {/* サムネイル行 */}
                      <div className="grid grid-cols-2 gap-0">
                        <div className="relative">
                          {before?.image
                            ? <img src={before.image} alt="before" className="w-full aspect-video object-cover" />
                            : <div className="w-full aspect-video flex items-center justify-center text-xs" style={{ background: '#12122a', color: '#4b4b70' }}>写真なし</div>
                          }
                          <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: 'rgba(0,0,0,0.7)', color: '#f0ede8' }}>施工前</div>
                        </div>
                        <div className="relative">
                          {after?.image
                            ? <img src={after.image} alt="after" className="w-full aspect-video object-cover" />
                            : <div className="w-full aspect-video flex items-center justify-center text-xs" style={{ background: '#12122a', color: '#4b4b70' }}>写真なし</div>
                          }
                          <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: 'rgba(0,0,0,0.7)', color: ACCENT }}>施工後</div>
                        </div>
                      </div>
                      {/* 情報行 */}
                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold" style={{ color: '#8b8ba8' }}>#{idx + 1}</div>
                          <div className="font-bold text-sm truncate" style={{ color: '#f0ede8' }}>
                            {pair.part || '（部位名なし）'}
                          </div>
                          {pair.description && (
                            <div className="text-xs truncate mt-0.5" style={{ color: '#6b7280' }}>{pair.description}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => deletePair(pair.id)}
                          className="p-2 rounded-lg transition-colors shrink-0"
                          style={{ color: '#4b4b70' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#4b4b70')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── 施工前選択 ── */}
        {step === 'before' && (
          <>
            {/* ステップインジケーター */}
            <StepIndicator current={1} />
            <PhotoGrid
              title="施工前の写真を選択"
              selectedId={pendingBefore}
              onSelect={id => setPendingBefore(id)}
            />
            <button
              type="button"
              onClick={() => pendingBefore !== null && setStep('after')}
              disabled={pendingBefore === null}
              className="w-full mt-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-30"
              style={{ background: ACCENT, color: '#000' }}
            >
              次へ：施工後を選択 <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* ── 施工後選択 ── */}
        {step === 'after' && (
          <>
            <StepIndicator current={2} />
            <PhotoGrid
              title="施工後の写真を選択"
              selectedId={pendingAfter}
              onSelect={id => setPendingAfter(id)}
              excludeId={pendingBefore}
            />
            <button
              type="button"
              onClick={() => pendingAfter !== null && setStep('form')}
              disabled={pendingAfter === null}
              className="w-full mt-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-30"
              style={{ background: ACCENT, color: '#000' }}
            >
              次へ：部位情報を入力 <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* ── 部位情報入力 ── */}
        {step === 'form' && (
          <>
            <StepIndicator current={3} />

            {/* 選択写真プレビュー */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { label: '施工前', photo: photoById(pendingBefore!) },
                { label: '施工後', photo: photoById(pendingAfter!) },
              ].map(({ label, photo }) => (
                <div key={label} className="rounded-xl overflow-hidden border" style={{ borderColor: '#2e2e50' }}>
                  {photo?.image && <img src={photo.image} alt={label} className="w-full aspect-video object-cover" />}
                  <div className="px-2 py-1.5 text-center text-xs font-bold" style={{ color: label === '施工後' ? ACCENT : '#8b8ba8', background: '#1c1c30' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* 部位名 */}
            <div className="mb-4">
              <label className="flex items-center gap-2 text-xs font-bold mb-2" style={{ color: '#8b8ba8' }}>
                <div className="w-1 h-3.5 rounded-full" style={{ background: ACCENT }} />
                部位名
              </label>
              <input
                type="text"
                value={part}
                onChange={e => setPart(e.target.value)}
                placeholder="例：屋根南面、外壁東面"
                className="w-full px-4 py-3 rounded-xl text-sm font-medium outline-none transition-colors"
                style={{ background: '#12122a', border: '1.5px solid #2e2e50', color: '#f0ede8' }}
                onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
                onBlur={e => (e.currentTarget.style.borderColor = '#2e2e50')}
              />
            </div>

            {/* 説明 */}
            <div className="mb-6">
              <label className="flex items-center gap-2 text-xs font-bold mb-2" style={{ color: '#8b8ba8' }}>
                <div className="w-1 h-3.5 rounded-full" style={{ background: ACCENT }} />
                説明文（任意）
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="例：劣化状況と補修後の状態"
                className="w-full px-4 py-3 rounded-xl text-sm font-medium outline-none transition-colors"
                style={{ background: '#12122a', border: '1.5px solid #2e2e50', color: '#f0ede8' }}
                onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
                onBlur={e => (e.currentTarget.style.borderColor = '#2e2e50')}
              />
            </div>

            <button
              type="button"
              onClick={savePair}
              disabled={saving}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: ACCENT, color: '#000', boxShadow: `0 0 16px rgba(245,158,11,0.3)` }}
            >
              <Check className="w-4 h-4" />
              {saving ? '保存中...' : 'ペアを保存'}
            </button>
          </>
        )}

      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['施工前', '施工後', '部位情報'];
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center gap-2" style={{ flex: n < steps.length ? 1 : 'none' }}>
            <div className="flex items-center gap-1.5 shrink-0">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: done ? '#2e2e50' : active ? ACCENT : '#12122a',
                  color: done ? '#6b7280' : active ? '#000' : '#4b4b70',
                  border: `1.5px solid ${done ? '#2e2e50' : active ? ACCENT : '#2e2e50'}`,
                }}
              >
                {done ? <Check className="w-3 h-3" /> : n}
              </div>
              <span className="text-xs font-bold" style={{ color: active ? ACCENT : '#4b4b70' }}>{label}</span>
            </div>
            {n < steps.length && (
              <div className="flex-1 h-px" style={{ background: done ? '#2e2e50' : '#1c1c30' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
