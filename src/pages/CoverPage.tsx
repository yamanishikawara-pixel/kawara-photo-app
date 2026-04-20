import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Paperclip, Trash2, Upload, List, Check } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

import { db, auth, storage } from '../firebase';
import type { Project } from '../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { ConfirmModal } from '../shared/ConfirmModal';
import { canUpload, trackUpload } from '../shared/storageUtils';

const ACCENT = '#10b981';

const FIELDS: { label: string; key: keyof Project; placeholder: string }[] = [
  { label: '工事件名', key: 'projectName',        placeholder: '例：○○邸 外壁塗装工事' },
  { label: '工事場所', key: 'projectLocation',    placeholder: '例：東京都渋谷区○○1-2-3' },
  { label: '工期',     key: 'constructionPeriod', placeholder: '例：令和○年○月○日〜令和○年○月○日' },
  { label: '施工業者', key: 'contractorName',     placeholder: '例：株式会社○○' },
  { label: '作成年月日', key: 'creationDate',     placeholder: '例：令和○年○月○日' },
];

export function CoverPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [appendixUploading, setAppendixUploading] = useState(false);
  const [appendixProgress, setAppendixProgress] = useState(0);
  const [confirmDeletePdf, setConfirmDeletePdf] = useState(false);
  const appendixInputRef = useRef<HTMLInputElement>(null);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});

  useEffect(() => {
    if (!id) return;
    setError(null);
    getDoc(doc(db, 'projects', id))
      .then((d) => {
        if (d.exists()) setProject(d.data() as Project);
        else setError('表紙データが見つかりません。');
      })
      .catch(() => setError('表紙データの読み込みに失敗しました。'));
  }, [id]);

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  const update = (field: keyof Project, value: string) => {
    if (!project || !id) return;
    const key = field as string;
    setProject((prev) => prev ? { ...prev, [field]: value } : prev);
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'projects', id), { [field]: value });
        setSavedKey(key);
        setTimeout(() => setSavedKey(null), 1500);
      } catch {
        setError('保存に失敗しました。');
      }
    }, 600);
  };

  const handleAppendixUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    if (file.type !== 'application/pdf') { setError('PDFファイルを選択してください。'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('ファイルサイズは20MB以下にしてください。'); return; }
    const uid = auth.currentUser?.uid;
    if (!uid) { setError('ログインが必要です。'); return; }
    const storageUsed = (await getDoc(doc(db, 'users', uid))).data()?.storageUsedBytes ?? 0;
    if (!canUpload(storageUsed, file.size)) { setError('ストレージ容量が不足しています。'); return; }

    setAppendixUploading(true);
    setAppendixProgress(0);
    try {
      if (project?.appendixPdfUrl) {
        try { await deleteObject(ref(storage, project.appendixPdfUrl)); } catch (e) { import.meta.env.DEV && console.warn('旧PDF削除失敗:', e); }
      }
      const storageRef = ref(storage, `users/${uid}/projects/${id}/appendix.pdf`);
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file);
        task.on('state_changed',
          (snap) => setAppendixProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          () => resolve(),
        );
      });
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'projects', id), { appendixPdfUrl: url });
      await trackUpload(uid, file.size);
      setProject((prev) => prev ? { ...prev, appendixPdfUrl: url } : prev);
    } catch {
      setError('PDFのアップロードに失敗しました。');
    } finally {
      setAppendixUploading(false);
      setAppendixProgress(0);
      if (appendixInputRef.current) appendixInputRef.current.value = '';
    }
  };

  const handleAppendixDelete = async () => {
    if (!project?.appendixPdfUrl || !id) return;
    try {
      await deleteObject(ref(storage, project.appendixPdfUrl));
    } catch (e) { import.meta.env.DEV && console.warn('添付PDF削除失敗:', e); }
    await updateDoc(doc(db, 'projects', id), { appendixPdfUrl: null });
    setProject((prev) => prev ? { ...prev, appendixPdfUrl: undefined } : prev);
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

  return (
    <div className="min-h-screen font-sans" style={{ background: '#0f0f1a', color: '#f0ede8' }}>
      <div className="max-w-md md:max-w-3xl mx-auto px-4 sm:px-6 pb-16">

        {/* ── ヘッダー ── */}
        <div className="flex items-center justify-between py-5">
          <button
            type="button"
            onClick={() => navigate(`/project/${id}`)}
            className="flex items-center gap-2 font-bold text-sm transition-colors"
            style={{ color: '#8b8ba8' }}
            onPointerEnter={e => (e.currentTarget.style.color = ACCENT)}
            onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
          >
            <ArrowLeft className="w-4 h-4" />
            <List className="w-4 h-4" /> 現場メニュー
          </button>
        </div>

        {error && <ErrorMessage message={error} onDismiss={() => setError(null)} className="mb-4" />}

        {/* ── ページタイトル ── */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-7 rounded-full" style={{ background: ACCENT }} />
          <h1 className="text-2xl font-bold break-words" style={{ color: '#f0ede8' }}>表紙の入力</h1>
        </div>

        {/* ── 入力フィールド ── */}
        <div className="rounded-2xl border overflow-hidden mb-4" style={{ background: '#1c1c30', borderColor: '#2e2e50' }}>
          {FIELDS.map((f, idx) => {
            const val = String(project[f.key] ?? '');
            const isSaved = savedKey === (f.key as string);
            return (
              <div
                key={f.key}
                className="px-5 py-4"
                style={{ borderBottom: idx < FIELDS.length - 1 ? '1px solid #2e2e50' : 'none' }}
              >
                {/* ラベル行 */}
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1 h-4 rounded-full" style={{ background: ACCENT }} />
                    <label className="text-xs font-bold tracking-wide break-words" style={{ color: '#8b8ba8' }}>
                      {f.label}
                    </label>
                  </div>
                  {isSaved && (
                    <div className="flex items-center gap-1 text-xs font-bold transition-opacity" style={{ color: ACCENT }}>
                      <Check className="w-3 h-3" /> 保存済み
                    </div>
                  )}
                </div>
                {/* 入力欄 */}
                <input
                  type="text"
                  value={val}
                  placeholder={f.placeholder}
                  onChange={e => update(f.key, e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors outline-none"
                  style={{
                    background: '#12122a',
                    border: '1.5px solid #2e2e50',
                    color: '#f0ede8',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
                  onBlur={e => (e.currentTarget.style.borderColor = '#2e2e50')}
                />
              </div>
            );
          })}
        </div>

        {/* ── 施工保証 ── */}
        <div className="rounded-2xl border overflow-hidden mb-4" style={{ background: '#1c1c30', borderColor: '#2e2e50' }}>
          <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid #2e2e50' }}>
            <div className="w-1 h-5 rounded-full" style={{ background: ACCENT }} />
            <span className="text-sm font-bold" style={{ color: '#8b8ba8' }}>施工保証</span>
          </div>
          {([
            { label: '保証期間（年数）', key: 'warrantyYears' as const, placeholder: '例：5年' },
            { label: '保証開始日',       key: 'warrantyStartDate' as const, placeholder: '例：令和○年○月○日' },
            { label: '補足事項',         key: 'warrantyNote' as const, placeholder: '例：防水保証・雨漏り保証を含む' },
          ]).map((f, idx) => {
            const val = String(project[f.key] ?? '');
            const isSaved = savedKey === f.key;
            return (
              <div key={f.key} className="px-5 py-4" style={{ borderBottom: idx < 2 ? '1px solid #2e2e50' : 'none' }}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1 h-4 rounded-full" style={{ background: ACCENT }} />
                    <label className="text-xs font-bold tracking-wide break-words" style={{ color: '#8b8ba8' }}>{f.label}</label>
                  </div>
                  {isSaved && (
                    <div className="flex items-center gap-1 text-xs font-bold" style={{ color: ACCENT }}>
                      <Check className="w-3 h-3" /> 保存済み
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  value={val}
                  placeholder={f.placeholder}
                  onChange={e => update(f.key, e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors outline-none"
                  style={{ background: '#12122a', border: '1.5px solid #2e2e50', color: '#f0ede8' }}
                  onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
                  onBlur={e => (e.currentTarget.style.borderColor = '#2e2e50')}
                />
              </div>
            );
          })}
        </div>

        {/* ── 添付資料PDF ── */}
        <div className="rounded-2xl border p-5" style={{ background: '#1c1c30', borderColor: '#2e2e50' }}>
          <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold mb-4" style={{ color: '#8b8ba8' }}>
            <Paperclip className="w-4 h-4" style={{ color: ACCENT }} />
            添付資料PDF
            <span className="ml-auto text-xs font-normal" style={{ color: '#4b4b70' }}>最終ページに追加</span>
          </h2>

          {project.appendixPdfUrl ? (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl border"
              style={{ background: '#0f1f1a', borderColor: '#1a4a3a' }}
            >
              <Paperclip className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
              <span className="text-sm font-bold flex-1 truncate" style={{ color: '#6ee7b7' }}>PDF添付済み</span>
              <button
                type="button"
                onClick={() => setConfirmDeletePdf(true)}
                aria-label="削除"
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: '#6b7280' }}
                onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onPointerLeave={e => (e.currentTarget.style.color = '#6b7280')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => appendixInputRef.current?.click()}
              disabled={appendixUploading}
              aria-label="アップロード"
              className="w-full flex items-center justify-center gap-2 rounded-xl py-4 border-2 border-dashed transition-colors disabled:opacity-50 text-sm font-bold"
              style={{ borderColor: '#2e2e50', color: '#6b7280' }}
              onPointerEnter={e => {
                e.currentTarget.style.borderColor = ACCENT;
                e.currentTarget.style.color = ACCENT;
              }}
              onPointerLeave={e => {
                e.currentTarget.style.borderColor = '#2e2e50';
                e.currentTarget.style.color = '#6b7280';
              }}
            >
              <Upload className="w-4 h-4" />
              {appendixUploading ? `アップロード中... ${appendixProgress}%` : 'PDFを選択'}
            </button>
          )}

          <input
            ref={appendixInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleAppendixUpload}
          />

          {appendixUploading && (
            <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: '#12122a' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${appendixProgress}%`, background: ACCENT }}
              />
            </div>
          )}

          <p className="text-xs mt-3" style={{ color: '#4b4b70' }}>最大20MB・PDF形式のみ</p>
        </div>

      </div>
      <ConfirmModal
        isOpen={confirmDeletePdf}
        title="添付PDFを削除"
        message="添付PDFを削除しますか？"
        confirmLabel="削除"
        variant="danger"
        onConfirm={async () => {
          setConfirmDeletePdf(false);
          await handleAppendixDelete();
        }}
        onCancel={() => setConfirmDeletePdf(false)}
      />
    </div>
  );
}
