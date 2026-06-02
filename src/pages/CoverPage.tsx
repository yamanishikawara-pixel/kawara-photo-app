import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Paperclip, Trash2, Upload, List, Check, Loader2, X,
} from 'lucide-react';
import { doc, getDoc, updateDoc, deleteField, increment } from 'firebase/firestore';
import {
  ref, uploadBytesResumable, getDownloadURL, type UploadTask,
} from 'firebase/storage';

import { db, auth, storage } from '../firebase';
import type { Project } from '../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { ConfirmModal } from '../shared/ConfirmModal';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';
import {
  canUpload,
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

// ウィザードモードで使うフィールド順序
const WIZARD_FIELDS: { label: string; key: keyof Project; placeholder: string; inputType?: string }[] = [
  { label: '工事件名',   key: 'projectName',        placeholder: '例: ○○邸 外壁塗装工事' },
  { label: '工事場所',   key: 'projectLocation',    placeholder: '例: 富山県魚津市○○1-2-3' },
  { label: '工期',       key: 'constructionPeriod', placeholder: '例: 令和○年○月○日〜令和○年○月○日' },
  { label: '施工業者',   key: 'contractorName',     placeholder: '例: 有限会社山西瓦店' },
  { label: '作成年月日', key: 'creationDate',       placeholder: '例: 令和○年○月○日' },
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
  const [coverTitle, setCoverTitle] = useState('');
  const [coverHiddenFields, setCoverHiddenFields] = useState<string[]>([]);
  const [wizardMode, setWizardMode] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
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
  const projectRef = useRef<Project | null>(null);
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

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

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
          const data = d.data() as Project;
          setProject(data);
          setCoverTitle(data.coverTitle ?? '');
          setCoverHiddenFields(data.coverHiddenFields ?? []);
        } else {
          setError('表紙データが見つかりません。');
        }
      } catch (err) {
        if (aborted || !mountedRef.current) return;
        logFirebaseError(err, '表紙データの読み込み');
        setError(firebaseErrorMessage(err, '表紙データの読み込み'));
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
    const prevValue = (projectRef.current?.[field] ?? '') as string;

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
        logFirebaseError(err, 'フィールド保存');
        if (mountedRef.current) {
          // 保存失敗 → 楽観的更新を元の値に巻き戻す
          setProject(prev => prev ? { ...prev, [field]: prevValue } : prev);
          setSavingKey(prev => prev === key ? null : prev);
          setError(firebaseErrorMessage(err, '保存'));
        }
      }
    }, DEBOUNCE_MS);
  }, [id]);

  const updateCoverTitle = useCallback((value: string) => {
    if (!id) return;
    setCoverTitle(value);
    if (debounceTimers.current['coverTitle']) clearTimeout(debounceTimers.current['coverTitle']);
    debounceTimers.current['coverTitle'] = setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'projects', id), { coverTitle: value });
      } catch (err) {
        logFirebaseError(err, '表紙タイトル保存');
        if (mountedRef.current) setError(firebaseErrorMessage(err, '保存'));
      }
    }, DEBOUNCE_MS);
  }, [id]);

  const toggleHiddenField = useCallback(async (key: string) => {
    if (!id) return;
    const prev = coverHiddenFields;
    const next = coverHiddenFields.includes(key)
      ? coverHiddenFields.filter(k => k !== key)
      : [...coverHiddenFields, key];
    setCoverHiddenFields(next);
    try {
      await updateDoc(doc(db, 'projects', id), { coverHiddenFields: next });
    } catch (err) {
      logFirebaseError(err, '表紙フィールド設定保存');
      if (mountedRef.current) {
        setCoverHiddenFields(prev);
        setError(firebaseErrorMessage(err, '保存'));
      }
    }
  }, [id, coverHiddenFields]);

  const toggleWizardMode = () => {
    const next = !wizardMode;
    setWizardMode(next);
    setWizardStep(0);
    localStorage.setItem('coverWizardMode', String(next));
  };

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
      logFirebaseError(err, '容量チェック');
      setError(firebaseErrorMessage(err, '容量チェック'));
      return;
    }

    setAppendixUploading(true);
    setAppendixProgress(0);

    // ── 旧PDFはアップロード完了後に削除する(W-3) ─────────────
    // 旧 → 新の順で処理すると、新アップロードが失敗した場合に
    // 旧PDFが消えていて Firestore は古いURLを指したまま 404 になる。
    // 「同パスなのに getDownloadURL が成功する別ファイルが残る」状態は
    // uploadBytesResumable の resumable プロトコル下では発生しないので、
    // 旧URLを変数に取っておき、新アップロード成功後に削除する。
    const oldUrl = project?.appendixPdfUrl;
    const oldSize = project?.appendixPdfSize;

    try {
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
      // Firestore を先に更新(失敗したら storage 上の新ファイルだけ orphan、
      //   Firestore は旧URLのままなので参照は健全)
      await updateDoc(doc(db, 'projects', id), {
        appendixPdfUrl: url,
        appendixPdfSize: file.size,
      });

      // ストレージ使用量カウンタの差分更新:
      // 同パスに上書きアップロードしているので、増分は (file.size - oldSize)。
      // trackUpload + 旧ファイル削除(trackDelete込み)の組合せだと、
      // 同パス上書きなのに2回カウンタを動かして整合がぶれる。差分1回が正解。
      const delta = file.size - (oldSize ?? 0);
      if (delta !== 0) {
        // 差分が正なら trackUpload(増加)、負なら逆向きに加算する。
        // increment は負数も受け付けるので、trackUpload 内で +delta すれば OK。
        // ただし現状 trackUpload は signature が "正の値" 前提なので、
        // 直接 updateDoc + increment(delta) を使う。
        try {
          await updateDoc(doc(db, 'users', uid), {
            storageUsedBytes: increment(delta),
          });
        } catch (e) {
          import.meta.env.DEV && console.warn('storageUsedBytes 差分更新失敗:', e);
        }
      }

      // 旧ファイル削除: 新URLが Firestore に確定した「後」なので、
      // ここで失敗しても整合性は崩れない(orphan が1つ残るだけ)。
      // 同パスに上書きしているためそもそも旧ファイルは存在しない可能性が高いが、
      // パスが変わる将来拡張に備えて削除呼び出しは残しておく。
      // ただし現状は同パス上書きなので deleteObject はスキップでよい。
      // → カウンタは既に差分で調整済みなので、trackDelete は呼ばない。
      void oldUrl; // 同パス上書き前提なので明示的に未使用化

      if (!mountedRef.current) return;
      setProject(prev =>
        prev ? { ...prev, appendixPdfUrl: url, appendixPdfSize: file.size } : prev,
      );
    } catch (err) {
      uploadTaskRef.current = null;
      const code = (err as { code?: string })?.code;
      if (code === 'storage/canceled') {
        // キャンセル時はエラー表示しない
        if (import.meta.env.DEV) console.info('[CoverPage] upload canceled');
      } else {
        logFirebaseError(err, 'PDFアップロード');
        if (mountedRef.current) setError(firebaseErrorMessage(err, 'PDFアップロード'));
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
      logFirebaseError(err, '添付PDFの削除');
      if (mountedRef.current) setError(firebaseErrorMessage(err, '添付PDFの削除'));
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
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 rounded-full" style={{ background: ACCENT }} />
            <h1 className="text-2xl font-bold break-words" style={{ color: '#f0ede8' }}>
              表紙の入力
            </h1>
          </div>
          <button
            type="button"
            onClick={toggleWizardMode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shrink-0"
            style={{
              background: wizardMode ? `${ACCENT}20` : '#12122a',
              border: `1px solid ${wizardMode ? ACCENT : '#2e2e50'}`,
              color: wizardMode ? ACCENT : '#6b7280',
            }}
          >
            {wizardMode ? '📋 ウィザード' : '📋 ウィザード'}
          </button>
        </div>

        {/* ── 表紙カスタマイズ ── */}
        <div
          className="rounded-2xl border overflow-hidden mb-4"
          style={{ background: '#1c1c30', borderColor: '#2e2e50' }}
        >
          <div className="px-5 py-3" style={{ borderBottom: '1px solid #2e2e50' }}>
            <span className="text-sm font-bold" style={{ color: '#8b8ba8' }}>表紙タイトル・項目設定</span>
          </div>
          <div className="px-5 py-4 space-y-4">
            {/* タイトル編集 */}
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: '#6b7280' }}>
                表紙のタイトル（大見出し）
              </label>
              <input
                type="text"
                value={coverTitle}
                onChange={e => updateCoverTitle(e.target.value)}
                placeholder="未入力時: 工事写真報告書"
                className="w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors outline-none"
                style={{ background: '#12122a', border: '1.5px solid #2e2e50', color: '#f0ede8' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#10b981')}
                onBlur={e => (e.currentTarget.style.borderColor = '#2e2e50')}
              />
              <p className="text-xs mt-1" style={{ color: '#4b4b70' }}>空欄の場合「工事写真報告書」が表示されます</p>
            </div>

            {/* フィールド表示/非表示 */}
            <div>
              <label className="block text-xs font-bold mb-2" style={{ color: '#6b7280' }}>
                表示する項目
              </label>
              <div className="space-y-2">
                {[
                  { key: 'projectLocation', label: '工事場所' },
                  { key: 'constructionPeriod', label: '工期' },
                  { key: 'contractorName', label: '施工業者' },
                  { key: 'creationDate', label: '作成年月日' },
                ].map(({ key, label }) => {
                  const isVisible = !coverHiddenFields.includes(key);
                  return (
                    <div key={key} className="flex items-center justify-between py-1">
                      <span className="text-sm font-bold" style={{ color: isVisible ? '#f0ede8' : '#4b4b70' }}>{label}</span>
                      <button
                        type="button"
                        onClick={() => toggleHiddenField(key)}
                        className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                        style={{ background: isVisible ? '#10b981' : '#2e2e50' }}
                      >
                        <span
                          className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition"
                          style={{ transform: isVisible ? 'translateX(20px)' : 'translateX(0)' }}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs mt-2" style={{ color: '#4b4b70' }}>※ 工事件名は常に表示されます</p>
            </div>
          </div>
        </div>

        {/* ── ウィザードモード ── */}
        {wizardMode && project && (() => {
          const visibleFields = WIZARD_FIELDS.filter(f => !coverHiddenFields.includes(f.key as string));
          if (visibleFields.length === 0) return null;
          const step = Math.min(wizardStep, visibleFields.length - 1);
          const field = visibleFields[step];
          const isLast = step === visibleFields.length - 1;
          const val = String(project[field.key] ?? '');
          const isSaving = savingKey === field.key;
          const isSaved = savedKey === field.key;

          return (
            <div className="rounded-2xl border overflow-hidden mb-4" style={{ background: '#1c1c30', borderColor: '#2e2e50' }}>
              {/* プログレスバー */}
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold" style={{ color: '#8b8ba8' }}>{step + 1} / {visibleFields.length}</span>
                  <span className="text-xs font-bold" style={{ color: ACCENT }}>{field.label}</span>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#12122a' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${((step + 1) / visibleFields.length) * 100}%`, background: ACCENT }}
                  />
                </div>
              </div>

              {/* 入力フィールド */}
              <div className="px-5 py-4">
                <label className="block text-sm font-bold mb-2" style={{ color: '#f0ede8' }}>{field.label}</label>
                <input
                  key={field.key}
                  type="text"
                  value={val}
                  placeholder={field.placeholder}
                  autoFocus
                  onChange={e => update(field.key, e.target.value)}
                  className="w-full px-4 py-4 rounded-xl text-base font-medium transition-colors outline-none"
                  style={{
                    background: '#12122a',
                    border: `1.5px solid ${isSaving ? '#f59e0b' : isSaved ? ACCENT : '#2e2e50'}`,
                    color: '#f0ede8',
                    fontSize: '16px',
                  }}
                />
                {isSaving && <p className="text-xs mt-1 font-bold" style={{ color: '#f59e0b' }}>保存中...</p>}
                {isSaved && !isSaving && <p className="text-xs mt-1 font-bold" style={{ color: ACCENT }}>✓ 保存しました</p>}
              </div>

              {/* ナビゲーション */}
              <div className="px-5 pb-5 flex gap-3">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setWizardStep(s => s - 1)}
                    className="flex-1 py-3 rounded-xl font-bold text-sm transition-colors"
                    style={{ background: '#12122a', color: '#8b8ba8', border: '1px solid #2e2e50' }}
                  >
                    ← 戻る
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (isLast) {
                      setWizardMode(false);
                      localStorage.setItem('coverWizardMode', 'false');
                    } else {
                      setWizardStep(s => s + 1);
                    }
                  }}
                  className="flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
                  style={{ background: ACCENT, color: '#fff', boxShadow: `0 0 16px ${ACCENT}44` }}
                >
                  {isLast ? '完了 ✓' : '次へ →'}
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── 基本情報（ウィザードモードでも常に表示） ── */}
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
