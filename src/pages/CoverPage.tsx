import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Paperclip, Trash2, Upload, List, Check, Loader2, X,
} from 'lucide-react';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import {
  ref, uploadBytesResumable, getDownloadURL, type UploadTask,
} from 'firebase/storage';

import { db, auth, storage } from '../firebase';
import type { Project } from '../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { ConfirmModal } from '../shared/ConfirmModal';
import {
  canUpload,
  trackUpload,
  deleteStorageFileWithAccounting,
} from '../shared/storageUtils';

// ─── 定数 ──────────────────────────────────────────
const ACCENT = '#10b981';
const APPENDIX_MAX_MB = 20;
const APPENDIX_MAX_BYTES = APPENDIX_MAX_MB * 1024 * 1024;
const DEBOUNCE_MS = 600;
const SAVED_FLASH_MS = 1500;
const ERROR_AUTO_DISMISS_MS = 8000;

// ─── フィールド定義 ──────────────────────────────────
const BASIC_FIELDS: { label: string; key: keyof Project; placeholder: string }[] = [
  { label: '工事件名',   key: 'projectName',        placeholder: '例:○○邸 外壁塗装工事' },
  { label: '工事場所',   key: 'projectLocation',    placeholder: '例:東京都渋谷区○○1-2-3' },
  { label: '工期',       key: 'constructionPeriod', placeholder: '例:令和○年○月○日〜令和○年○月○日' },
  { label: '施工業者',   key: 'contractorName',     placeholder: '例:株式会社○○' },
  { label: '作成年月日', key: 'creationDate',       placeholder: '例:令和○年○月○日' },
];

const WARRANTY_FIELDS: { label: string; key: keyof Project; placeholder: string }[] = [
  { label: '保証期間(年数)', key: 'warrantyYears',     placeholder: '例:5年' },
  { label: '保証開始日',     key: 'warrantyStartDate', placeholder: '例:令和○年○月○日' },
  { label: '補足事項',       key: 'warrantyNote',      placeholder: '例:防水保証・雨漏り保証を含む' },
];

// ─── メイン ────────────────────────────────────────
export function CoverPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [appendixUploading, setAppendixUploading] = useState(false);
  const [appendixProgress, setAppendixProgress] = useState(0);
  const [confirmDeletePdf, setConfirmDeletePdf] = useState(false);

  const appendixInputRef = useRef<HTMLInputElement>(null);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const savedFlashTimers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const mountedRef = useRef(true);
  const uploadTaskRef = useRef<UploadTask | null>(null);

  // ── マウント状態 + クリーンアップ ──
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // 全タイマーを停止
      Object.values(debounceTimers.current).forEach(t => { if (t) clearTimeout(t); });
      Object.values(savedFlashTimers.current).forEach(t => { if (t) clearTimeout(t); });
      debounceTimers.current = {};
      savedFlashTimers.current = {};
      // アップロード進行中ならキャンセル(未保存ファイルのorphan防止)
      if (uploadTaskRef.current) {
        try { uploadTaskRef.current.cancel(); } catch { /* noop */ }
        uploadTaskRef.current = null;
      }
    };
  }, []);

  // ── エラー自動消去(8秒) ──
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => {
      if (mountedRef.current) setError(null);
    }, ERROR_AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [error]);

  // ── データロード ──
  useEffect(() => {
    if (!id) return;
    let aborted = false;
    setError(null);
    (async () => {
      try {
        const d = await getDoc(doc(db, 'projects', id));
        if (aborted || !mountedRef.current) return;
        if (d.exists()) {
          setProject(d.data() as Project);
        } else {
          setError('表紙データが見つかりません。');
        }
      } catch (err) {
        console.error('[CoverPage] load failed:', err);
        if (!aborted && mountedRef.current) {
          setError('表紙データの読み込みに失敗しました。');
        }
      }
    })();
    return () => { aborted = true; };
  }, [id]);

  // ── フィールド更新(デバウンス保存) ──
  const update = useCallback((field: keyof Project, value: string) => {
    if (!id) return;
    const key = field as string;

    // ローカル即時反映
    setProject(prev => prev ? { ...prev, [field]: value } : prev);

    // 保存中インジケータ
    setSavingKey(key);
    setSavedKey(prev => prev === key ? null : prev);

    // 既存タイマーをクリア
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    if (savedFlashTimers.current[key]) clearTimeout(savedFlashTimers.current[key]);

    debounceTimers.current[key] = setTimeout(async () => {
      debounceTimers.current[key] = undefined;
      try {
        await updateDoc(doc(db, 'projects', id), { [field]: value });
        if (!mountedRef.current) return;
        setSavingKey(prev => prev === key ? null : prev);
        setSavedKey(key);
        savedFlashTimers.current[key] = setTimeout(() => {
          savedFlashTimers.current[key] = undefined;
          if (mountedRef.current) {
            setSavedKey(prev => prev === key ? null : prev);
          }
        }, SAVED_FLASH_MS);
      } catch (err) {
        console.error('[CoverPage] field save failed:', field, err);
        if (mountedRef.current) {
          setSavingKey(prev => prev === key ? null : prev);
          setError('保存に失敗しました。');
        }
      }
    }, DEBOUNCE_MS);
  }, [id]);

  // ── 添付PDFアップロード ──
  const handleAppendixUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 同じファイル再選択でも change が発火するようクリア
    e.target.value = '';
    if (!file || !id) return;

    if (file.type !== 'application/pdf') {
      setError('PDFファイルを選択してください。');
      return;
    }
    if (file.size > APPENDIX_MAX_BYTES) {
      setError(`ファイルサイズは${APPENDIX_MAX_MB}MB以下にしてください。`);
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      setError('ログインが必要です。');
      return;
    }

    // 容量チェック(旧PDF分を差し引いた純増分で判定)
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      const storageUsed = userSnap.data()?.storageUsedBytes ?? 0;
      const oldSize = project?.appendixPdfSize ?? 0;
      const netDelta = file.size - oldSize;
      if (netDelta > 0 && !canUpload(storageUsed, netDelta)) {
        setError('ストレージ容量が不足しています。');
        return;
      }
    } catch (err) {
      console.error('[CoverPage] quota check failed:', err);
      setError('容量チェックに失敗しました。もう一度お試しください。');
      return;
    }

    setAppendixUploading(true);
    setAppendixProgress(0);

    try {
      // 旧PDFを削除(カウンタ減算込み)
      const oldUrl = project?.appendixPdfUrl;
      const oldSize = project?.appendixPdfSize;
      if (oldUrl) {
        await deleteStorageFileWithAccounting(oldUrl, uid, oldSize);
      }

      // 新規アップロード(キャンセル可能)
      const storageRef = ref(storage, `users/${uid}/projects/${id}/appendix.pdf`);
      const task = uploadBytesResumable(storageRef, file);
      uploadTaskRef.current = task;

      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => {
            if (mountedRef.current && snap.totalBytes > 0) {
              setAppendixProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
            }
          },
          reject,
          () => resolve(),
        );
      });

      uploadTaskRef.current = null;

      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'projects', id), {
        appendixPdfUrl: url,
        appendixPdfSize: file.size,
      });
      await trackUpload(uid, file.size);

      if (!mountedRef.current) return;
      setProject(prev =>
        prev ? { ...prev, appendixPdfUrl: url, appendixPdfSize: file.size } : prev,
      );
    } catch (err) {
      uploadTaskRef.current = null;
      const code = (err as { code?: string })?.code;
      if (code === 'storage/canceled') {
        if (import.meta.env.DEV) console.info('[CoverPage] upload canceled');
        // キャンセル時はエラー表示しない
      } else {
        console.error('[CoverPage] PDF upload failed:', err);
        if (mountedRef.current) setError('PDFのアップロードに失敗しました。');
      }
    } finally {
      if (mountedRef.current) {
        setAppendixUploading(false);
        setAppendixProgress(0);
      }
    }
  };

  // ── アップロードキャンセル ──
  const handleCancelUpload = useCallback(() => {
    if (uploadTaskRef.current) {
      try { uploadTaskRef.current.cancel(); } catch { /* noop */ }
      uploadTaskRef.current = null;
    }
  }, []);

  // ── 添付PDF削除 ──
  const handleAppendixDelete = async () => {
    if (!project?.appendixPdfUrl || !id) return;
    const uid = auth.currentUser?.uid;
    try {
      await deleteStorageFileWithAccounting(
        project.appendixPdfUrl,
        uid,
        project.appendixPdfSize,
      );
      // Firestoreのフィールド自体を削除(null ではなく deleteField で undefined 扱いに)
      await updateDoc(doc(db, 'projects', id), {
        appendixPdfUrl: deleteField(),
        appendixPdfSize: deleteField(),
      });
      if (!mountedRef.current) return;
      setProject(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        delete next.appendixPdfUrl;
        delete next.appendixPdfSize;
        return next;
      });
    } catch (err) {
      console.error('[CoverPage] appendix delete failed:', err);
      if (mountedRef.current) setError('添付PDFの削除に失敗しました。');
    }
  };

  // ─── エラー表示用早期リターン ───
  if (error && !project) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 font-sans"
        style={{ background: '#0f0f1a' }}
      >
        <ErrorMessage message={error} onDismiss={() => setError(null)} />
        <button
          onClick={() => navigate(`/project/${id}`)}
          className="mt-4 flex items-center gap-2 font-bold"
          style={{ color: ACCENT }}
        >
          <ArrowLeft className="w-4 h-4" /> もどる
        </button>
      </div>
    );
  }

  if (!project) return <LoadingSpinner />;

  // ─── フィールド1つ分のレンダリング ───
  const renderField = (
    f: { label: string; key: keyof Project; placeholder: string },
    isLast: boolean,
  ) => {
    const keyStr = f.key as string;
    const val = String(project[f.key] ?? '');
    const isSaving = savingKey === keyStr;
    const isSaved = savedKey === keyStr;
    const inputId = `cover-${keyStr}`;

    return (
      <div
        key={keyStr}
        className="px-5 py-4"
        style={{ borderBottom: isLast ? 'none' : '1px solid #2e2e50' }}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1 h-4 rounded-full" style={{ background: ACCENT }} />
            <label
              htmlFor={inputId}
              className="text-xs font-bold tracking-wide break-words"
              style={{ color: '#8b8ba8' }}
            >
              {f.label}
            </label>
          </div>
          {isSaving && (
            <div
              className="flex items-center gap-1 text-xs font-bold"
              style={{ color: '#6b7280' }}
              aria-live="polite"
            >
              <Loader2 className="w-3 h-3 animate-spin" /> 保存中…
            </div>
          )}
          {!isSaving && isSaved && (
            <div
              className="flex items-center gap-1 text-xs font-bold"
              style={{ color: ACCENT }}
              aria-live="polite"
            >
              <Check className="w-3 h-3" /> 保存済み
            </div>
          )}
        </div>
        <input
          id={inputId}
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
  };

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

        {error && (
          <ErrorMessage
            message={error}
            onDismiss={() => setError(null)}
            className="mb-4"
          />
        )}

        {/* ── ページタイトル ── */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-7 rounded-full" style={{ background: ACCENT }} />
          <h1 className="text-2xl font-bold break-words" style={{ color: '#f0ede8' }}>
            表紙の入力
          </h1>
        </div>

        {/* ── 基本情報 ── */}
        <div
          className="rounded-2xl border overflow-hidden mb-4"
          style={{ background: '#1c1c30', borderColor: '#2e2e50' }}
        >
          {BASIC_FIELDS.map((f, idx) => renderField(f, idx === BASIC_FIELDS.length - 1))}
        </div>

        {/* ── 施工保証 ── */}
        <div
          className="rounded-2xl border overflow-hidden mb-4"
          style={{ background: '#1c1c30', borderColor: '#2e2e50' }}
        >
          <div
            className="px-5 py-3 flex items-center gap-2"
            style={{ borderBottom: '1px solid #2e2e50' }}
          >
            <div className="w-1 h-5 rounded-full" style={{ background: ACCENT }} />
            <span className="text-sm font-bold" style={{ color: '#8b8ba8' }}>施工保証</span>
          </div>
          {WARRANTY_FIELDS.map((f, idx) => renderField(f, idx === WARRANTY_FIELDS.length - 1))}
        </div>

        {/* ── 添付資料PDF ── */}
        <div
          className="rounded-2xl border p-5"
          style={{ background: '#1c1c30', borderColor: '#2e2e50' }}
        >
          <h2
            className="flex flex-wrap items-center gap-2 text-sm font-bold mb-4"
            style={{ color: '#8b8ba8' }}
          >
            <Paperclip className="w-4 h-4" style={{ color: ACCENT }} />
            添付資料PDF
            <span className="ml-auto text-xs font-normal" style={{ color: '#4b4b70' }}>
              最終ページに追加
            </span>
          </h2>

          {project.appendixPdfUrl && !appendixUploading ? (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl border"
              style={{ background: '#0f1f1a', borderColor: '#1a4a3a' }}
            >
              <Paperclip className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
              <span
                className="text-sm font-bold flex-1 truncate"
                style={{ color: '#6ee7b7' }}
              >
                PDF添付済み
              </span>
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
          ) : appendixUploading ? (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl border"
              style={{ background: '#12122a', borderColor: '#2e2e50' }}
            >
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: ACCENT }} />
              <span className="text-sm font-bold flex-1" style={{ color: '#f0ede8' }}>
                アップロード中… {appendixProgress}%
              </span>
              <button
                type="button"
                onClick={handleCancelUpload}
                aria-label="キャンセル"
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: '#6b7280' }}
                onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onPointerLeave={e => (e.currentTarget.style.color = '#6b7280')}
                title="キャンセル"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => appendixInputRef.current?.click()}
              aria-label="PDFをアップロード"
              className="w-full flex items-center justify-center gap-2 rounded-xl py-4 border-2 border-dashed transition-colors text-sm font-bold"
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
              PDFを選択
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
            <div
              className="mt-3 h-1 rounded-full overflow-hidden"
              style={{ background: '#12122a' }}
              role="progressbar"
              aria-valuenow={appendixProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${appendixProgress}%`, background: ACCENT }}
              />
            </div>
          )}

          <p className="text-xs mt-3" style={{ color: '#4b4b70' }}>
            最大{APPENDIX_MAX_MB}MB・PDF形式のみ
          </p>
        </div>

      </div>

      <ConfirmModal
        isOpen={confirmDeletePdf}
        title="添付PDFを削除"
        message="添付PDFを削除しますか?"
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