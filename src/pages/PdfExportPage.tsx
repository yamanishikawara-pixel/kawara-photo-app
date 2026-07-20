import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Printer, FileDown, AlertTriangle } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Circle, MapRow, MapLine, Photo, Project, Material, WhiteoutBox, UserSettings, BeforeAfterItem } from '../types';
import { getContractorName, getReportDate } from '../types';
import logoRed from '../assets/logo_red.png';
import { A4_HEIGHT_PX, A4_WIDTH_PX, getPreviewScale, proxyUrl } from '../shared/utils';
import { resolveMapAspect } from '../shared/mapCoords';
import { colorForSymbol } from '../shared/symbolColor';
import { ErrorMessage } from '../shared/ErrorMessage';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';

const JP_FONT = "'Noto Sans JP', 'BIZ UDPGothic', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif";

function safeStyleLine(val: string | number | undefined | null, defaultUnit: string): string {
  if (val == null || val === '') return `0${defaultUnit}`;
  if (typeof val === 'number') return `${val}${defaultUnit}`;
  return String(val);
}

// ── セクション定義（モジュールスコープ）────────────────
// Hooks や order の比較で参照が安定している必要があるため、モジュール直下で定義する。
const SECTION_KEYS = ['cover', 'map', 'photo', 'beforeAfter', 'material', 'appendix'] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_META: Record<SectionKey, { label: string; icon: string }> = {
  cover:       { label: '表紙',             icon: '📋' },
  map:         { label: '位置図',           icon: '📍' },
  photo:       { label: '工事写真',         icon: '📷' },
  beforeAfter: { label: 'ビフォーアフター', icon: '🔄' },
  material:    { label: '使用材料',         icon: '🔧' },
  appendix:    { label: '添付PDF',          icon: '📎' },
};

// ── 定数 ─────────────────────────────────────────
const APPENDIX_PAGE_LIMIT = 20;             // 添付PDFの取り込み最大ページ数
const APPENDIX_RENDER_WIDTH = 794;          // A4 150DPI 相当
const APPENDIX_RENDER_QUALITY = 0.92;
const IMG_MAX_PRINT_PX = 2000;              // 印刷用圧縮の最大辺
const IMG_PRINT_QUALITY = 0.90;
const IMG_BATCH_SIZE = 2;                   // 画像最適化のバッチ並列度

// ── 空行プレースホルダ生成（React 内で state として保持する）──
// ストリーク不定の負数 ID を返す。idRef を通してコンポーネント間で安定化する。
function createEmptyPhoto(id: number): Photo & { circles?: Circle[] } {
  return { id, image: null, photoNumber: '', shootingDate: '', locationMap: '', process: '', description: '', circles: [] };
}

function createEmptyMaterial(id: number): Material {
  return { id, image: null, name: '', manufacturer: '', specification: '', remarks: '', rotation: 0 };
}

// ── 長文テキストのスタイル決定 ─────────────────────────────────
// PDF/印刷の固定枠で長文が見切れる問題への対策。
// 文字数に応じて段階的にフォントサイズと行高を縮め、最後に "..." で省略する。
//
// 設計方針:
//   1. 80 文字以下(現実的な大多数)は現状の見た目を完全に維持
//   2. 1 段階 1px ずつゆるやかに縮小
//   3. 下限 10px を超えて小さくしない(可読性の最低ライン)
//   4. 文字サイズに合わせて行高(line-height)も連動 → 間延びを防ぐ
//   5. それでも入らない極端な長文は CSS 側の overflow-hidden で頭から表示、
//      末尾は ::after 等ではなく後ろが切り捨てられる挙動(現状と同じ)。
//      ただし「これは省略されている」のサインとして
//      `truncated` フラグで判定し、続きあり記号を付ける手も将来追加可。
//
// この関数は写真説明欄・位置図備考列・材料備考欄の 3 箇所で共通利用される。
type LongTextStyle = {
  fontSize: string;        // 例: '13px'
  lineHeight: string;      // 例: '1.4'
  isLong: boolean;         // 後で "続きあり" マーク等を出すための判定
};

function pickLongTextStyle(text: string | undefined | null): LongTextStyle {
  const len = (text ?? '').length;
  // 段階的縮小テーブル。短い順にチェックして最初にマッチしたものを採用。
  if (len <= 80)       return { fontSize: '13px',   lineHeight: '1.4',  isLong: false };
  if (len <= 150)      return { fontSize: '12px',   lineHeight: '1.4',  isLong: false };
  if (len <= 250)      return { fontSize: '11px',   lineHeight: '1.35', isLong: true  };
  if (len <= 400)      return { fontSize: '10px',   lineHeight: '1.3',  isLong: true  };
  if (len <= 600)      return { fontSize: '9px',    lineHeight: '1.25', isLong: true  };
  // 601 文字超: 最小フォントで詰め込む。極端に長い場合は編集画面で確認。
  return                       { fontSize: '8.5px', lineHeight: '1.2',  isLong: true  };
}



export default function PdfExportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [scale, setScale] = useState(1);
  const [sessionId] = useState(() => Date.now().toString());
  const [isPrinting, setIsPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState('');
  const [isCapturingForPdf, setIsCapturingForPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState('');
  const [appendixPages, setAppendixPages] = useState<string[]>([]);    // 添付PDF→画像
  const [appendixTruncated, setAppendixTruncated] = useState(false);   // 20ページ超での打ち切り検知

  // ── マウント管理 ──
  const mountedRef = useRef(true);

  // ── 空カードID生成（負数カウンタ）──
  // ref に閉じ込めることでモジュールグローバル汚染を避けつつ、
  // 同一コンポーネントインスタンス内では安定した ID を維持する。
  const emptyIdCounterRef = useRef(0);
  const nextEmptyId = useCallback(() => {
    emptyIdCounterRef.current += 1;
    return -emptyIdCounterRef.current;
  }, []);

  // ── セクションON/OFF制御 ──
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({
    cover: true,
    map: true,
    photo: true,
    beforeAfter: true,
    material: true,
    appendix: true,
  });
  const [showDetail, setShowDetail] = useState(false);
  const sectionOrder = [...SECTION_KEYS] as SectionKey[];

  const toggleSection = useCallback((key: SectionKey) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // プリセット適用:セクションのON/OFF のみ変更する。
  const applyPreset = useCallback((preset: Record<SectionKey, boolean>) => {
    setSections(preset);
  }, []);

  const PRESETS: { label: string; icon: string; sub: string; value: Record<SectionKey, boolean> }[] = useMemo(() => [
    {
      label: '施主提出用', icon: '🏠', sub: '表紙・ビフォーアフター',
      value: { cover: true, map: false, photo: false, beforeAfter: true, material: false, appendix: false },
    },
    {
      label: '役所提出用', icon: '🏛️', sub: '表紙・位置図・写真・材料',
      value: { cover: true, map: true, photo: true, beforeAfter: true, material: true, appendix: false },
    },
    {
      label: '全部',       icon: '📋', sub: '全セクション',
      value: { cover: true, map: true, photo: true, beforeAfter: true, material: true, appendix: true },
    },
  ], []);

  // ── マウントフラグ ──
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── エラー自動消去(8秒) ──
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => {
      if (mountedRef.current) setError(null);
    }, 8000);
    return () => clearTimeout(t);
  }, [error]);

  // ── プロジェクト/ユーザー設定ロード ──
  useEffect(() => {
    if (!id) return;
    let aborted = false;
    setError(null);
    (async () => {
      try {
        const d = await getDoc(doc(db, 'projects', id));
        if (aborted || !mountedRef.current) return;
        if (d.exists()) setProject(d.data() as Project);
        const user = auth.currentUser;
        if (user) {
          const s = await getDoc(doc(db, 'users', user.uid));
          if (aborted || !mountedRef.current) return;
          if (s.exists()) setUserSettings(s.data() as UserSettings);
        }
      } catch (err) {
        if (aborted || !mountedRef.current) return;
        logFirebaseError(err, 'PDF出力用データ読込');
        setError(firebaseErrorMessage(err, 'データの読み込み'));
      }
    })();
    return () => { aborted = true; };
  }, [id]);

  useEffect(() => {
    const updateScale = () => {
      if (mountedRef.current) setScale(getPreviewScale(32));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // ── 印刷後の状態リセット:両フラグを確実にクリア ──
  useEffect(() => {
    const handleAfterPrint = () => {
      if (!mountedRef.current) return;
      setIsPrinting(false);
      setPrintProgress('');
      setIsCapturingForPdf(false);  // 以前未対応 → キャンセル時に永久 disabled 状態になる致命バグ
      setPdfProgress('');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // ── 添付PDFをページ画像に変換 ──
  useEffect(() => {
    const url = project?.appendixPdfUrl;
    if (!url) {
      setAppendixPages([]);
      setAppendixTruncated(false);
      return;
    }
    let cancelled = false;
    // pdfjs-dist の型は ReturnType から推論させる(公式型 import を避けて依存を減らす)
    type PdfjsLib = typeof import('pdfjs-dist');
    type LoadingTask = ReturnType<PdfjsLib['getDocument']>;
    type PdfDocument = Awaited<LoadingTask['promise']>;

    let loadingTask: LoadingTask | null = null;
    let pdfDoc: PdfDocument | null = null;

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).href;
        loadingTask = pdfjsLib.getDocument(url);
        pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        const totalPages = pdfDoc.numPages;
        const renderCount = Math.min(totalPages, APPENDIX_PAGE_LIMIT);
        if (mountedRef.current) setAppendixTruncated(totalPages > APPENDIX_PAGE_LIMIT);

        const pages: string[] = [];
        for (let i = 1; i <= renderCount; i++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(i);
          const baseViewport = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: APPENDIX_RENDER_WIDTH / baseViewport.width });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          // pdfjs-dist のバージョンによって render の引数型が異なるため
          // 必要最小限のオブジェクトを渡す(canvas プロパティは v4+ で要求される)
          await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
          if (cancelled) {
            canvas.width = 0;
            canvas.height = 0;
            return;
          }
          pages.push(canvas.toDataURL('image/jpeg', APPENDIX_RENDER_QUALITY));
          // canvas 解放(大きなビットマップのメモリを即座に戻す)
          canvas.width = 0;
          canvas.height = 0;
        }
        if (!cancelled && mountedRef.current) setAppendixPages(pages);
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[PdfExport] PDF読み込み失敗:', e);
      } finally {
        // pdfDoc / loadingTask を確実に破棄(メモリリーク防止)
        try { await pdfDoc?.destroy?.(); } catch { /* noop */ }
        try { await loadingTask?.destroy?.(); } catch { /* noop */ }
      }
    })();
    return () => { cancelled = true; };
  }, [project?.appendixPdfUrl]);

  // ── ZIPエクスポート ──
  const handleZipExport = async () => {
    if (!project) return;
    try {
      setIsZipping(true); setError(null);
      await new Promise((r) => setTimeout(r, 100));
      const zip = new JSZip();
      const folderName = project.projectName || '現場写真';
      const imgFolder = zip.folder(folderName);
      if (!imgFolder) throw new Error('フォルダ作成失敗');

      // 写真は image のあるものだけに絞る(ZIPは画像のみが意味を持つ)
      const photosWithImage = (project.photos ?? []).filter((p) => p.image);
      if (photosWithImage.length === 0) {
        if (mountedRef.current) setError('ダウンロードする写真がありません。');
        return;
      }

      // 同名回避のための Set
      const usedNames = new Set<string>();
      const makeUniqueName = (base: string): string => {
        if (!usedNames.has(base)) {
          usedNames.add(base);
          return base;
        }
        const dot = base.lastIndexOf('.');
        const stem = dot > 0 ? base.slice(0, dot) : base;
        const ext  = dot > 0 ? base.slice(dot) : '';
        for (let idx = 2; idx < 10000; idx++) {
          const candidate = `${stem}_${idx}${ext}`;
          if (!usedNames.has(candidate)) {
            usedNames.add(candidate);
            return candidate;
          }
        }
        // 通常到達しない。念のため時刻サフィックス
        return `${stem}_${Date.now()}${ext}`;
      };

      let failedCount = 0;
      const promises = photosWithImage.map(async (p) => {
        if (!p.image) return;
        try {
          const response = await fetch(p.image);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const processName = p.process ? `_${p.process}` : '';
          const baseName = `${(p.photoNumber || '00').padStart(2, '0')}${processName}.jpg`;
          const filename = makeUniqueName(baseName);
          imgFolder.file(filename, blob);
        } catch (e) {
          failedCount++;
          if (import.meta.env.DEV) console.warn('[PdfExport] 写真取得失敗:', e);
        }
      });
      await Promise.all(promises);
      if (!mountedRef.current) return;
      // 全枚失敗していたら空 ZIP を保存しない(空ZIPはユーザー混乱の元)。
      if (failedCount === photosWithImage.length) {
        setError('すべての写真の取得に失敗しました。通信状態を確認して再度お試しください。');
        return;
      }
      if (failedCount > 0) {
        setError(`${failedCount}枚の写真の取得に失敗しました。他の写真はZIPに含まれています。`);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      if (!mountedRef.current) return;
      saveAs(content, `${folderName}.zip`);
    } catch (err) {
      logFirebaseError(err, 'ZIP作成');
      if (mountedRef.current) setError(firebaseErrorMessage(err, 'ZIPファイルの作成'));
    } finally {
      if (mountedRef.current) setIsZipping(false);
    }
  };

  // ── 印刷用に画像を圧縮（base64 化）──
  // - data-original-src は消さない(再実行時も元URLから再読込できるように)
  // - crossorigin は消さない(再実行時の CORS 保持)
  const optimizeImageForPrint = (imgEl: HTMLImageElement): Promise<string> => {
    return new Promise((resolve) => {
      const origSrc = imgEl.getAttribute('data-original-src') || imgEl.src;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let { width, height } = img;
        if (width > IMG_MAX_PRINT_PX || height > IMG_MAX_PRINT_PX) {
          const ratio = Math.min(IMG_MAX_PRINT_PX / width, IMG_MAX_PRINT_PX / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(origSrc); return; }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', IMG_PRINT_QUALITY);
        canvas.width = 0;
        canvas.height = 0;
        resolve(dataUrl);
      };
      img.onerror = () => {
        if (import.meta.env.DEV) console.warn('[PdfExport] optimizeImageForPrint: load failed', origSrc);
        resolve(origSrc);
      };
      img.src = origSrc;
    });
  };

  const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

  // ── 印刷 / PDFダウンロード共通:window.print() で統一 ──
  const executePrint = async (progressSetter: (msg: string) => void) => {
    const images = Array.from(document.querySelectorAll('.pdf-page img'));
    const needsConversion = images.filter((img) => {
      const src = img.getAttribute('data-original-src') || img.getAttribute('src');
      return src && !src.startsWith('data:');
    });
    const total = needsConversion.length;
    for (let i = 0; i < total; i += IMG_BATCH_SIZE) {
      if (!mountedRef.current) return;
      const batch = needsConversion.slice(i, i + IMG_BATCH_SIZE);
      progressSetter(`画像を最適化中... (${Math.min(i + IMG_BATCH_SIZE, total)}/${total})`);
      await Promise.all(batch.map(async (img) => {
        try {
          const dataUrl = await optimizeImageForPrint(img as HTMLImageElement);
          img.setAttribute('src', dataUrl);
          // crossorigin 属性は残す(再印刷時にも CORS 要件を保つため)
          // data-original-src も残す(再印刷時は元URLから再取得できる)
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[PdfExport] 画像最適化失敗:', e);
        }
      }));
      await yieldToUI();
    }
    if (!mountedRef.current) return;
    progressSetter('PDF生成中...');
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)));
    });
    if (!mountedRef.current) return;
    window.print();
  };

  const handlePrint = () => {
    if (!project) return;
    // 写真セクションがONのとき、撮影日空の写真を事前チェック
    if (sections.photo) {
      const emptyDatePhotos = (project.photos ?? []).filter(p => p.image && !p.shootingDate);
      if (emptyDatePhotos.length > 0) {
        const nums = emptyDatePhotos.map(p => p.photoNumber || '?').join('・');
        const ok = window.confirm(
          `写真 ${nums} の撮影日が未入力です。\n役所提出時に差し戻しになる場合があります。\nこのまま続行しますか?`
        );
        if (!ok) return;
      }
    }
    setIsPrinting(true);
    setPrintProgress('準備中...');
    setTimeout(async () => {
      try {
        await executePrint(setPrintProgress);
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[PdfExport] print failed:', err);
        if (mountedRef.current) {
          setError('印刷の準備中にエラーが発生しました。');
          setIsPrinting(false);
        }
      } finally {
        if (mountedRef.current) setPrintProgress('');
      }
    }, 500);
  };

  const handlePdfDownload = () => {
    if (!project) return;
    if (sections.photo) {
      const emptyDatePhotos = (project.photos ?? []).filter(p => p.image && !p.shootingDate);
      if (emptyDatePhotos.length > 0) {
        const nums = emptyDatePhotos.map(p => p.photoNumber || '?').join('・');
        const ok = window.confirm(
          `写真 ${nums} の撮影日が未入力です。\n役所提出時に差し戻しになる場合があります。\nこのまま続行しますか?`
        );
        if (!ok) return;
      }
    }
    setIsCapturingForPdf(true);
    setPdfProgress('準備中...');
    setTimeout(async () => {
      try {
        await executePrint(setPdfProgress);
      } catch (err) {
        logFirebaseError(err, 'PDF生成');
        if (mountedRef.current) setError(firebaseErrorMessage(err, 'PDFの生成'));
      } finally {
        if (mountedRef.current) {
          setIsCapturingForPdf(false);
          setPdfProgress('');
        }
      }
    }, 500);
  };

  // ─── 派生値の算出(useMemo で再計算を抑制)─────────────────
  // 早期リターン用の簡易値は以下で定義し、実際の UI 用は useMemo でメモ化
  const companyName = userSettings?.companyName;

  // 位置図(最大3枚)
  const mapUrlsToRender = useMemo(
    () => (project?.mapUrls?.length ? project.mapUrls.slice(0, 3) : ['']),
    [project?.mapUrls],
  );
  const mapCount = mapUrlsToRender.length;

  // 写真フィルタ基準: 画像あり OR テキスト(工程・説明)あり
  // PDF本体(photo)とZIP(画像のみ)で基準が散らばっていた問題を統一
  const activePhotos = useMemo(
    () => (project?.photos ?? []).filter((p) => p.image || p.process || p.description),
    [project?.photos],
  );

  const photoPages: (Photo & { circles?: Circle[] })[][] = useMemo(() => {
    const pages: (Photo & { circles?: Circle[] })[][] = [];
    for (let i = 0; i < Math.max(activePhotos.length, 3); i += 3) {
      const chunk = activePhotos.slice(i, i + 3);
      while (chunk.length < 3) chunk.push(createEmptyPhoto(nextEmptyId()));
      pages.push(chunk);
    }
    return pages;
    // nextEmptyId は stable(useCallback)なので依存不要だが、lint に合わせて入れる
  }, [activePhotos, nextEmptyId]);

  // 材料フィルタ: 画像 OR いずれかのテキスト
  const activeMaterials = useMemo(
    () => (project?.materials ?? []).filter(
      (m) => m.image || m.name || m.manufacturer || m.specification || m.remarks,
    ),
    [project?.materials],
  );

  const materialPages: Material[][] = useMemo(() => {
    const pages: Material[][] = [];
    if (activeMaterials.length === 0) return pages;
    for (let i = 0; i < Math.max(activeMaterials.length, 3); i += 3) {
      const chunk = activeMaterials.slice(i, i + 3);
      while (chunk.length < 3) chunk.push(createEmptyMaterial(nextEmptyId()));
      pages.push(chunk);
    }
    return pages;
  }, [activeMaterials, nextEmptyId]);

  // ビフォーアフター:2箇所ずつ1ページ
  const beforeAfterPages: BeforeAfterItem[][] = useMemo(() => {
    const items = project?.beforeAfterItems ?? [];
    const pages: BeforeAfterItem[][] = [];
    for (let i = 0; i < items.length; i += 2) {
      pages.push(items.slice(i, i + 2));
    }
    return pages;
  }, [project?.beforeAfterItems]);

  const sectionPageCounts: Record<SectionKey, number> = useMemo(() => ({
    cover: 1,
    map: mapCount,
    photo: photoPages.length,
    beforeAfter: beforeAfterPages.length,
    material: materialPages.length,
    appendix: appendixPages.length,
  }), [project, mapCount, photoPages.length, beforeAfterPages.length, materialPages.length, appendixPages.length]);

  const totalPages = useMemo(
    () => sectionOrder.reduce((sum, s) => sum + (sections[s] ? sectionPageCounts[s] : 0), 0),
    [sectionOrder, sections, sectionPageCounts],
  );

  const pageOffset = useCallback((section: SectionKey) => {
    let offset = 0;
    for (const s of sectionOrder) {
      if (s === section) break;
      if (sections[s]) offset += sectionPageCounts[s];
    }
    return offset;
  }, [sectionOrder, sections, sectionPageCounts]);

  if (!project) return <LoadingSpinner />;

  // 表示用:施工業者名(canonical優先、legacy fallback)
  const displayContractor = getContractorName(project);
  // 表示用:完了報告書の日付(reportDate 優先、creationDate フォールバック)
  const displayReportDate = getReportDate(project);

  return (
    <div className={`min-h-screen font-sans overflow-x-hidden w-full relative ${isPrinting ? 'bg-white p-0 block' : 'pb-12 p-4 sm:p-6 flex flex-col items-center'}`} style={isPrinting ? {} : { background: '#12122a' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap');
        .pdf-container-wrapper * { font-family: ${JP_FONT} !important; }
        .pdf-cover-page .cover-title       { font-family: 'Shippori Mincho', 'Noto Serif JP', serif !important; }
        .pdf-cover-page .cover-lbl         { font-family: 'Noto Sans JP', sans-serif !important; }
        .pdf-cover-page .cover-lbl span    { font-family: 'Noto Sans JP', sans-serif !important; }
        .pdf-cover-page .cover-val         { font-family: 'Noto Serif JP', serif !important; }
        .pdf-cover-page .cover-footer-name { font-family: 'Noto Serif JP', serif !important; }
        .pdf-cover-page .cover-pnum        { font-family: 'Noto Sans JP', sans-serif !important; }

        @media print {
          /* ── ページ設定 ────────────────────────────────── */
          @page {
            size: A4 portrait;
            margin: 0mm;
          }

          /* ── ルート要素 ───────────────────────────────── */
          html, body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            height: auto !important;
            overflow: visible !important;
            /* Safari: @page margin を無視する場合の補完 */
            -webkit-margin-before: 0 !important;
            -webkit-margin-after: 0 !important;
          }

          /* 印刷時は非表示 */
          .no-print { display: none !important; }

          /* ── コンテナ ─────────────────────────────────── */
          .pdf-container-wrapper {
            display: block !important;
            width: 210mm !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* ── 1ページ分のラッパー ───────────────────────── */
          .pdf-page-wrapper {
            position: relative !important;
            display: block !important;
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            box-shadow: none !important;
            transform: none !important;
            -webkit-transform: none !important;

            /* 改ページ: 各ページの前で必ず改ページ */
            break-before: page !important;
            page-break-before: always !important;
            -webkit-page-break-before: always !important;

            break-inside: avoid !important;
            page-break-inside: avoid !important;
            -webkit-page-break-inside: avoid !important;

            break-after: avoid !important;
            page-break-after: avoid !important;
            -webkit-page-break-after: avoid !important;
          }

          /* 先頭ページだけ改ページなし */
          .pdf-container-wrapper > .pdf-page-wrapper:first-child {
            break-before: auto !important;
            page-break-before: auto !important;
            -webkit-page-break-before: auto !important;
          }

          /* ── ページ本体 ───────────────────────────────── */
          .pdf-page {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            transform: none !important;
            -webkit-transform: none !important;
            transform-origin: unset !important;
            -webkit-transform-origin: unset !important;
          }

          /* 表紙専用 */
          .pdf-page.pdf-cover-page {
            padding: 0 !important;
          }

          /* ── 印刷品質向上 ──────────────────────────────── */
          .pdf-page img {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            /* 印刷時の画像補間を高品質に */
            image-rendering: auto !important;
            /* Firefox: ぼかし防止 */
            image-rendering: -moz-crisp-edges !important;
            image-rendering: -webkit-optimize-contrast !important;
          }

          /* フォントの印刷レンダリングを安定化 */
          .pdf-page * {
            -webkit-font-smoothing: antialiased !important;
            text-rendering: optimizeLegibility !important;
            /* テキストの途中改ページを防ぐ */
            orphans: 2;
            widows: 2;
          }

          /* :has() は現代ブラウザ対応 */
          :has(> .pdf-container-wrapper) {
            min-height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            display: block !important;
            overflow: visible !important;
          }
        }
      `}</style>

      <div className={`w-full max-w-2xl mb-6 flex justify-between items-center flex-wrap gap-3 no-print ${isPrinting ? 'hidden' : ''}`}>
        {/* もどる */}
        <button
          type="button"
          onClick={() => navigate(`/project/${id}`)}
          className="flex items-center gap-2 font-bold text-sm transition-colors"
          style={{ color: '#8b8ba8' }}
          onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
          onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
        >
          <ArrowLeft className="w-4 h-4" /> もどる
        </button>
        <div className="flex gap-2 sm:gap-3 flex-wrap justify-end">
          {/* Zip */}
          <button
            type="button"
            onClick={handleZipExport}
            disabled={isZipping || isPrinting || isCapturingForPdf || totalPages === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border transition-colors disabled:opacity-40"
            style={{ background: '#1c1c30', borderColor: '#2e2e50', color: '#8b8ba8' }}
            onPointerEnter={e => { e.currentTarget.style.borderColor = '#f0ede8'; e.currentTarget.style.color = '#f0ede8'; }}
            onPointerLeave={e => { e.currentTarget.style.borderColor = '#2e2e50'; e.currentTarget.style.color = '#8b8ba8'; }}
          >
            <Download className="w-4 h-4" /> 写真のみ(Zip)
          </button>
          {/* PDFダウンロード */}
          <button
            type="button"
            onClick={handlePdfDownload}
            disabled={isZipping || isPrinting || isCapturingForPdf || totalPages === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-40"
            style={{ background: '#f59e0b', color: '#000' }}
            onPointerEnter={e => (e.currentTarget.style.background = '#fbbf24')}
            onPointerLeave={e => (e.currentTarget.style.background = '#f59e0b')}
          >
            <FileDown className="w-4 h-4" />
            {isCapturingForPdf ? (pdfProgress || '処理中...') : 'PDFダウンロード'}
          </button>
          {/* 印刷 */}
          <button
            type="button"
            onClick={handlePrint}
            disabled={isZipping || isPrinting || isCapturingForPdf || totalPages === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-40"
            style={{ background: '#f59e0b', color: '#000', boxShadow: '0 0 14px rgba(245,158,11,0.35)' }}
            onPointerEnter={e => (e.currentTarget.style.background = '#fbbf24')}
            onPointerLeave={e => (e.currentTarget.style.background = '#f59e0b')}
          >
            <Printer className="w-4 h-4" />
            {isPrinting ? (printProgress || '画像処理中...') : 'PDF作成・印刷'}
          </button>
        </div>
      </div>

      {error && <div className="w-full max-w-2xl mb-4 no-print"><ErrorMessage message={error} onDismiss={() => setError(null)} /></div>}

      {/* ── セクション選択パネル ── */}
      {!isPrinting && (
        <div className="w-full max-w-2xl mb-6 no-print">
          <div className="rounded-2xl border overflow-hidden" style={{ background: '#1c1c30', borderColor: '#2e2e50' }}>
            {/* ヘッダー */}
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #2e2e50' }}>
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 rounded-full" style={{ background: '#f59e0b' }} />
                <span className="text-sm font-bold" style={{ color: '#f0ede8' }}>出力形式を選択</span>
              </div>
              <span className="text-xs" style={{ color: '#4b4b70' }}>{totalPages}ページ</span>
            </div>

            {/* 3プリセットボタン */}
            <div className="p-4 grid grid-cols-3 gap-3">
              {PRESETS.map(p => {
                const isActive = sectionOrder.every(k => sections[k] === p.value[k]);
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p.value)}
                    className="flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl font-bold transition-all"
                    style={{
                      background: isActive ? 'rgba(245,158,11,0.12)' : '#12122a',
                      border: `2px solid ${isActive ? '#f59e0b' : '#2e2e50'}`,
                      color: isActive ? '#f59e0b' : '#8b8ba8',
                    }}
                    onPointerEnter={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#f59e0b'; (e.currentTarget as HTMLButtonElement).style.color = '#f59e0b'; } }}
                    onPointerLeave={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e50'; (e.currentTarget as HTMLButtonElement).style.color = '#8b8ba8'; } }}
                  >
                    <span style={{ fontSize: '24px' }}>{p.icon}</span>
                    <span className="text-sm font-black">{p.label}</span>
                    <span className="text-xs font-normal text-center leading-tight" style={{ color: isActive ? '#fbbf24' : '#4b4b70' }}>{p.sub}</span>
                  </button>
                );
              })}
            </div>

            {/* 詳細設定トグル */}
            <div style={{ borderTop: '1px solid #2e2e50' }}>
              <button
                type="button"
                onClick={() => setShowDetail(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3 text-xs font-bold transition-colors"
                style={{ color: '#6b7280' }}
                onPointerEnter={e => (e.currentTarget.style.color = '#8b8ba8')}
                onPointerLeave={e => (e.currentTarget.style.color = '#6b7280')}
              >
                <span>詳細設定（個別ON/OFF）</span>
                <span style={{ fontSize: '10px' }}>{showDetail ? '▲ 閉じる' : '▼ 開く'}</span>
              </button>

              {showDetail && (
                <div className="px-4 pb-4 flex flex-col gap-2">
                  {sectionOrder.map((key) => {
                    const { label, icon } = SECTION_META[key];
                    const count = sectionPageCounts[key];
                    const on = sections[key];
                    const showTruncateWarn = key === 'appendix' && appendixTruncated && on;
                    const emptyDateCount = key === 'photo' && on
                      ? (project.photos ?? []).filter(p => p.image && !p.shootingDate).length
                      : 0;
                    return (
                      <div key={key} className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleSection(key)}
                          aria-pressed={on}
                          className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
                          style={{
                            background: on ? 'rgba(245,158,11,0.08)' : '#12122a',
                            border: `1.5px solid ${on ? 'rgba(245,158,11,0.3)' : '#2e2e50'}`,
                          }}
                        >
                          <span style={{ fontSize: '16px' }}>{icon}</span>
                          <span className="flex-1 text-sm font-bold" style={{ color: on ? '#f59e0b' : '#6b7280' }}>
                            {label}
                            {showTruncateWarn && (
                              <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal" style={{ color: '#f87171' }} title={`添付PDFは${APPENDIX_PAGE_LIMIT}ページまでに制限されました`}>
                                <AlertTriangle className="w-3 h-3" />
                                {APPENDIX_PAGE_LIMIT}p超は省略
                              </span>
                            )}
                            {emptyDateCount > 0 && (
                              <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal" style={{ color: '#f59e0b' }} title={`撮影日が未入力の写真が${emptyDateCount}枚あります`}>
                                <AlertTriangle className="w-3 h-3" />
                                撮影日未入力 {emptyDateCount}枚
                              </span>
                            )}
                          </span>
                          {count > 0 && <span className="text-xs" style={{ color: '#4b4b70' }}>{count}p</span>}
                          <div className="w-12 h-6 rounded-full relative transition-all shrink-0" style={{ background: on ? '#f59e0b' : '#2e2e50' }}>
                            <div className="w-5 h-5 rounded-full absolute top-0.5 transition-all" style={{ background: '#fff', left: on ? '26px' : '2px' }} />
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`pdf-container-wrapper w-full ${isPrinting ? 'block' : 'flex flex-col items-center gap-8'}`}>

        {/* 全セクションOFF時のメッセージ */}
        {!isPrinting && totalPages === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 no-print">
            <FileDown className="w-10 h-10" style={{ color: '#2e2e50' }} />
            <p className="text-sm font-bold" style={{ color: '#8b8ba8' }}>出力するセクションを選択してください</p>
          </div>
        )}

        {sectionOrder.flatMap(secKey => { switch (secKey) {

        // ② 表紙
        case 'cover': {
          if (!sections.cover) return [];
          const hidden = new Set(project.coverHiddenFields ?? []);
          const allCoverFields = [
            { key: 'projectName', chars: ['工','事','件','名'], value: project.projectName ?? '', valPt: '18pt' },
            { key: 'projectLocation', chars: ['工','事','場','所'], value: project.projectLocation ?? '', valPt: '18pt' },
            { key: 'constructionPeriod', chars: ['工','　','　','期'], value: project.constructionPeriod ?? '', valPt: '18pt', multiline: true },
            { key: 'contractorName', chars: ['施','工','業','者'], value: displayContractor, valPt: '18pt' },
            { key: 'creationDate', chars: ['作','成','年','月','日'], value: project.creationDate ?? displayReportDate, valPt: '18pt' },
          ];
          const coverFields = allCoverFields
            .filter(f => !hidden.has(f.key))
            .map((f, i, arr) => ({ ...f, last: i === arr.length - 1 }));
          return [(
          <div key="cover" style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `297mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
          <div className={`pdf-page pdf-cover-page overflow-hidden ${isPrinting ? "" : "absolute top-0 left-0 origin-top-left"}`}
            style={{
              width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`,
              height: isPrinting ? `297mm` : `${A4_HEIGHT_PX}px`,
              transform: isPrinting ? 'none' : `scale(${scale})`,
              background: '#ffffff',
              overflow: 'hidden',
            }}>

            <div className="cover-title" style={{
              position: 'absolute', left: 0, right: 0, top: 148,
              textAlign: 'center',
              fontSize: '42pt',
              fontWeight: 800,
              letterSpacing: '0.22em',
              textIndent: '0.22em',
              color: '#111',
              lineHeight: 1,
              fontFamily: "'Shippori Mincho', 'Noto Serif JP', serif",
            }}>{project.coverTitle?.trim() || '工事写真報告書'}</div>

            <div style={{
              position: 'absolute', left: '50%', top: 262,
              transform: 'translateX(-50%)',
              width: 620, height: 1, background: '#111',
            }} />

            <div style={{
              position: 'absolute', left: '50%', top: 330,
              bottom: 250,
              transform: 'translateX(-50%)',
              width: 620,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              {coverFields.map((row, i) => (
                <div key={i} style={{
                  display: 'grid',
                  gridTemplateColumns: '148px 40px 1fr',
                  alignItems: 'start',
                  paddingTop: 18,
                  paddingBottom: 18,
                  borderBottom: '1px solid #111',
                }}>
                  <div className="cover-lbl" style={{
                    fontSize: '16pt',
                    fontWeight: 400,
                    color: '#111',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    width: '6em',
                    display: 'inline-flex',
                    justifyContent: 'space-between',
                    letterSpacing: 0,
                  }}>
                    {row.chars.map((c, j) => <span key={j}>{c}</span>)}
                  </div>
                  <div style={{
                    fontSize: '16pt',
                    fontWeight: 400,
                    color: '#111',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    textAlign: 'center',
                    lineHeight: 1.5,
                  }}>—</div>
                  <div className="cover-val" style={{
                    fontSize: row.valPt,
                    fontWeight: 500,
                    color: '#111',
                    letterSpacing: '0.06em',
                    fontFamily: "'Noto Serif JP', serif",
                    lineHeight: 1.6,
                  }}>
                    {row.multiline
                      ? row.value.split(/\r?\n/).map((line, lineIndex) => <div key={lineIndex}>{line}</div>)
                      : row.value}
                  </div>
                </div>
              ))}
            </div>

            {/* ④ フッター: 赤ロゴ＋社名（左）｜ページ番号（右） */}
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 56,
              display: 'flex', alignItems: 'center',
              padding: '0 60px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={logoRed} alt="logo" style={{ width: 26, height: 26, objectFit: 'contain' }} />
                {companyName && (
                  <div className="cover-footer-name" style={{
                    fontSize: '10pt',
                    fontWeight: 500,
                    color: '#333',
                    letterSpacing: '0.08em',
                    fontFamily: "'Noto Serif JP', serif",
                  }}>{companyName}</div>
                )}
              </div>
              <div style={{ flex: 1 }} />
              <div className="cover-pnum" style={{
                fontSize: '10pt',
                color: '#888',
                letterSpacing: '0.25em',
                fontFamily: "'Noto Sans JP', sans-serif",
              }}>- 1 / {totalPages} -</div>
            </div>

          </div>
          </div>
          )]; }

        case 'map': {
          if (!sections.map) return [];

          return mapUrlsToRender.map((u, mapIndex) => {
          const userRotation = project.mapRotations?.[mapIndex] ?? 0;
          const totalRotation = userRotation % 360;

          const transform = project.mapTransforms?.[mapIndex] || { scale: 1, x: 0, y: 0 };
          const layout = project.mapLayouts?.[mapIndex] || { title: '位置図', x: 15, y: 10, rotation: 0 };

          // 座標系のアスペクト解決:
          //   - 新形式の地図 → 画像の自然アスペクト (Project.mapImageAspects[mapIndex])
          //   - 旧形式の地図 → 194/120 (LEGACY_MAP_ASPECT)
          // 旧形式のドキュメントは編集画面で開いた瞬間に新形式へ移行される。
          // 出力側は読み取り専用なので、保存値を尊重して描画する。
          const containerAspect = resolveMapAspect(project.mapImageAspects, mapIndex);

          const whiteoutBoxesForMap = (project.whiteoutBoxes ?? []).filter((b: WhiteoutBox) => (b.mapIndex ?? 0) === mapIndex);

          const mapOverlays = (
            <>
              {/* 案1: タイトル札は画像内に置かず、ページ上部の帯ヘッダーに移動した(後述)。
                  これにより図面の有効領域が広がり、図面の中心情報が見やすくなる。 */}

              {(project.mapPins ?? []).filter(p => (p.mapIndex ?? 0) === mapIndex).map(pin => {
                const visualScale = (pin.size ?? 1) / transform.scale;
                // 案1: 符号(label)ごとに色を決定。凡例バッジと完全一致させて視線移動を抑える。
                const pinColor = colorForSymbol(pin.label);
                return (
                  <div key={pin.id} style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: `translate(-50%, -50%) scale(${visualScale})`, zIndex: 10 }} className="absolute">
                    <div style={{ transform: `rotate(${pin.textRotation ?? 0}deg)` }}>
                      {pin.type === 'arrow' ? (
                        <div className="flex items-center gap-1 px-1 rounded" style={{ background: 'rgba(255,255,255,0.7)', border: `1px solid ${pinColor}33` }}>
                          <span className="font-bold text-[24px]" style={{ color: pinColor, transform: `rotate(${pin.rotation ?? 0}deg)` }}>➡</span>
                          <span className="font-bold text-[20px]" style={{ color: pinColor }}>{pin.label}</span>
                        </div>
                      ) : (
                        <div className="relative flex items-center justify-center">
                          <div className="w-[14mm] h-[14mm] rounded-full" style={{ border: `4px solid ${pinColor}`, background: `${pinColor}1a` }} />
                          <span className="absolute font-bold text-[18px] px-1 rounded" style={{ color: pinColor, background: 'rgba(255,255,255,0.7)' }}>{pin.label}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {(project.mapLines ?? []).filter(l => l.mapIndex === mapIndex).map((line: MapLine) => (
                <div key={`line-${line.id}`} className="absolute" style={{ left: safeStyleLine(line.x, '%'), top: safeStyleLine(line.y, '%'), width: safeStyleLine(line.length, '%'), height: safeStyleLine(line.thickness, 'px'), backgroundColor: line.color || '#000000', transform: `translate(-50%, -50%) rotate(${line.rotation ?? 0}deg)`, transformOrigin: 'center center', zIndex: 15 }} />
              ))}
              {(project.mapDimensionLines ?? []).filter(l => (l.mapIndex || 0) === mapIndex).map((line) => {
                const color = line.color || "#FFFFFF";
                const thickness = Number(line.size || 2);
                const midX = (line.start.x + line.end.x) / 2;
                const midY = (line.start.y + line.end.y) / 2;
                const dynamicFontSize = 14 + (thickness - 2) * 4;
                // 案1: 文字背景の半透明黒(rgba(0,0,0,0.5))を廃止。
                // 元の line.color をそのまま使い、白縁取り(paint-order: stroke)で視認性を確保する。
                // CAD 慣習に近く、印刷時も灰色の塊にならない。
                return (
                  <div key={line.id} className="absolute inset-0 z-20 pointer-events-none w-full h-full" style={{ overflow: 'visible' }}>
                    <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
                      <defs>
                        <marker id={`cad-tick-pdf-map-${line.id}`} markerWidth="16" markerHeight="16" refX="8" refY="8" orient="auto" markerUnits="userSpaceOnUse">
                          <line x1="0" y1="8" x2="16" y2="8" stroke={color} strokeWidth={thickness} />
                          <line x1="4" y1="12" x2="12" y2="4" stroke={color} strokeWidth={thickness * 1.5} />
                        </marker>
                      </defs>
                      <line x1={`${line.start.x}%`} y1={`${line.start.y}%`} x2={`${line.end.x}%`} y2={`${line.end.y}%`} stroke={color} strokeWidth={thickness} fill="none" markerStart={`url(#cad-tick-pdf-map-${line.id})`} markerEnd={`url(#cad-tick-pdf-map-${line.id})`} />
                    </svg>
                    {line.text && (
                      <div
                        style={{
                          left: `${midX}%`,
                          top: `${midY}%`,
                          color,
                          fontSize: `${dynamicFontSize}px`,
                          transform: `translate(-50%,-50%) rotate(${line.textRotation ?? 0}deg) scale(${1 / transform.scale})`,
                          paintOrder: 'stroke fill',
                          WebkitTextStroke: '4px white',
                        }}
                        className="absolute z-20 font-bold px-0.5 pointer-events-none whitespace-nowrap"
                      >
                        {line.text}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 白塗りは全オーバーレイの最後 = 最前面に描画。
                  SVG rect を使うことでブラウザPDF出力時も確実に白く塗られる。
                  overflow:visible な寸法線SVGより後に置くことで必ず上に重なる。 */}
              {whiteoutBoxesForMap.length > 0 && (
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', zIndex: 50, pointerEvents: 'none' }}>
                  {whiteoutBoxesForMap.map((box: WhiteoutBox) => (
                    <rect
                      key={box.id}
                      x={`${box.x - box.width / 2}%`}
                      y={`${box.y - box.height / 2}%`}
                      width={`${box.width}%`}
                      height={`${box.height}%`}
                      fill="white"
                    />
                  ))}
                </svg>
              )}
            </>
          );

          // 案1: モードA(フルブリード)は廃止し、常に凡例付きレイアウトで出力する。
          // データ後方互換のため types.ts の showLegendTable は残しているが、
          // PDF 出力では参照しない。

          return (
            <div key={`map-page-${mapIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `297mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
              <div className={`pdf-page w-full h-full flex flex-col bg-white text-black ${isPrinting ? "" : "absolute top-0 left-0 origin-top-left"}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `297mm` : `${A4_HEIGHT_PX}px`, padding: isPrinting ? '8mm' : '15mm', transform: isPrinting ? 'none' : `scale(${scale})` }}>
                {/* 案1: 外周は薄い枠線(従来 3px → 1px)に変更し、上品さを優先。 */}
                <div className="w-full h-full flex flex-col border border-gray-700 print:border-black p-4 print:p-2 min-h-0">

                  {/* 案1: 上部の帯ヘッダー。
                      従来は画像内に「タイトル札」を浮かべていたが、画像と重なって
                      情報を隠してしまう原因だった。固定位置ヘッダーに移すことで
                      図面の有効領域が広がり、現場名・ページ番号も常に同じ位置に出る。 */}
                  <div
                    className="shrink-0 flex items-center justify-between mb-3 px-3"
                    style={{
                      background: '#f3f7f4',
                      borderBottom: '1px solid #0f6e56',
                      padding: '8px 12px',
                    }}
                  >
                    <div className="font-bold" style={{ fontSize: '14pt', color: '#0f6e56', letterSpacing: '0.04em' }}>
                      ◆ {layout.title}
                      {project.projectName ? <span style={{ color: '#444', marginLeft: '0.5em' }}> ・ {project.projectName}</span> : null}
                      {mapCount > 1 ? <span style={{ color: '#666', marginLeft: '0.5em' }}>({mapIndex + 1}/{mapCount})</span> : null}
                    </div>
                  </div>

                  {/* 画像エリア。
                      ピン座標はそのマップに対応する `containerAspect` 内の % で
                      保存されている (新形式: 画像の自然アスペクト / 旧形式: 194:120)。
                      ここでも同じアスペクトのコンテナを作って、その中に画像を
                      object-contain (新形式では完全一致、旧形式ではレターボックス)
                      で配置する。

                      CSS aspect-ratio を flex 子要素に使うと Safari で高さ 0 になる
                      実績があるため、padding-bottom ハックで aspect 比を維持する。
                      ピン・SVG オーバーレイが % 座標でコンテナ全域にマップされるため
                      img は width/height:100% を維持する（auto+max 方式は不可）。 */}
                  <div style={{ width: '100%', position: 'relative', paddingBottom: `${(1 / containerAspect) * 100}%` }}>
                    <div
                      className="absolute inset-0 overflow-hidden bg-gray-50 print:bg-white border border-gray-300 print:border-gray-500"
                    >
                    {u ? (
                      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, transform: `translate(${transform.x}%, ${transform.y}%) scale(${transform.scale}) rotate(${totalRotation}deg)`, transformOrigin: 'center center' }}>
                          <img
                            src={proxyUrl(u, `map_${mapIndex}_${sessionId}`)}
                            data-original-src={u}
                            crossOrigin="anonymous"
                            loading="lazy"
                            decoding="async"
                            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
                            alt=""
                          />
                          {mapOverlays}
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="font-bold text-gray-400">位置図未登録</span>
                      </div>
                    )}
                    </div>
                  </div>

                  {/* 案1: 凡例テーブル。
                      - 空行(従来 6 行固定)を廃止し、項目数だけ表示。
                      - 0 件のときは "項目なし" を控えめに表示。
                      - 符号は色付き丸囲みバッジで、ピンと同じ色を割り当てる。
                      - ヘッダー行は緑帯にして業務文書らしい仕上がりに。 */}
                  <div className="mt-3 shrink-0">
                    <div className="border border-gray-700 print:border-black">
                      <div
                        className="grid grid-cols-12 text-base font-bold border-b border-gray-700 print:border-black"
                        style={{ background: '#f3f7f4', color: '#0f6e56' }}
                      >
                        <div className="col-span-1 py-2 text-center flex justify-center items-center border-r border-gray-700 print:border-black">符号</div>
                        <div className="col-span-2 py-2 text-center flex justify-center items-center border-r border-gray-700 print:border-black">部位</div>
                        <div className="col-span-2 py-2 text-center flex justify-center items-center border-r border-gray-700 print:border-black">写真NO</div>
                        <div className="col-span-7 py-2 text-center flex justify-center items-center">備考</div>
                      </div>
                      {(() => {
                        const rows: MapRow[] = project.mapRows ?? [];
                        const currentRows = rows.filter((r) => r.mapIndex === mapIndex || (r.mapIndex === undefined && mapIndex === 0));
                        if (currentRows.length === 0) {
                          return (
                            <div className="py-3 text-center text-gray-400 text-sm">
                              項目なし
                            </div>
                          );
                        }
                        return currentRows.map((row) => {
                          const symBg = colorForSymbol(row.symbol);
                          return (
                            <div key={row.id} className="grid grid-cols-12 text-base border-b border-gray-300 last:border-b-0 print:border-black">
                              {/* 符号セルは中央に色付き丸バッジ */}
                              <div className="col-span-1 py-2.5 flex justify-center items-center border-r border-gray-300 print:border-black">
                                {row.symbol && row.symbol.trim() ? (
                                  <span
                                    className="inline-flex items-center justify-center font-bold text-white"
                                    style={{
                                      width: '26px',
                                      height: '26px',
                                      borderRadius: '50%',
                                      background: symBg,
                                      fontSize: '13pt',
                                      lineHeight: 1,
                                    }}
                                  >
                                    {row.symbol}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">―</span>
                                )}
                              </div>
                              <div className="col-span-2 px-2 py-2.5 flex items-center overflow-hidden border-r border-gray-300 print:border-black">{row.part ?? ''}</div>
                              <div className="col-span-2 py-2.5 text-center flex justify-center items-center overflow-hidden border-r border-gray-300 print:border-black">{row.photoNo ?? row.relatedPhotoNumber ?? ''}</div>
                              <div className="col-span-7 px-2 py-2.5 flex items-center overflow-hidden">
                                {(() => {
                                  // 凡例の備考列も同じ段階縮小ロジック
                                  const style = pickLongTextStyle(row.remarks);
                                  return (
                                    <span style={{ fontSize: style.fontSize, lineHeight: style.lineHeight, display: 'block', overflow: 'hidden' }}>
                                      {row.remarks ?? ''}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-[10mm] print:bottom-[5mm] right-[15mm] print:right-[8mm] text-xs font-bold text-gray-500 shrink-0">- {pageOffset('map') + mapIndex + 1} / {totalPages} -</div>
              </div>
            </div>
          );
        });}

        case 'photo': {
          if (!sections.photo) return [];
          return photoPages.map((chunk, pageIndex) => (
          <div key={`photo-page-${pageIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `297mm` : `${A4_HEIGHT_PX * scale}px`, background: '#f7f5f1' }} className="pdf-page-wrapper relative shadow-md shrink-0">
            <div className={`pdf-page w-full h-full flex flex-col text-black ${isPrinting ? "" : "absolute top-0 left-0 origin-top-left"}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `297mm` : `${A4_HEIGHT_PX}px`, padding: 0, background: '#f7f5f1', transform: isPrinting ? 'none' : `scale(${scale})` }}>
              {/* ── ヘッダー ── */}
              <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '2px solid #1c1f22', flexShrink: 0 }}>
                <div style={{ flex: 1, padding: isPrinting ? '1.5mm 4mm' : '6px 14px', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div style={{ width: isPrinting ? '1.5mm' : '6px', alignSelf: 'stretch', background: '#c0492f', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: isPrinting ? '5.5pt' : '8px', letterSpacing: '.25em', color: '#6b7178', fontWeight: 800, fontFamily: JP_FONT }}>工事写真台帳</div>
                    <div style={{ fontSize: isPrinting ? '10pt' : '15px', fontWeight: 900, lineHeight: 1.15, marginTop: 1, fontFamily: JP_FONT, color: '#1c1f22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {project?.projectName || '工事名未設定'}
                    </div>
                  </div>
                </div>
                <div style={{ padding: isPrinting ? '1.5mm 4mm' : '6px 14px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: isPrinting ? '8pt' : '12px', fontWeight: 800, color: '#1c1f22', fontFamily: JP_FONT }}>
                    {project ? getContractorName(project) : ''}
                  </div>
                </div>
              </div>
              {/* ── 写真3行 ── */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                {chunk.map((p, i) => {
                  const _numRows = 3; // photoPages は createEmptyPhoto で常に3行にパディング済み
                  const _innerH_px = Math.round((A4_HEIGHT_PX - 42) / _numRows - 12);
                  const _innerW_px = Math.min(Math.round(_innerH_px * (4 / 3)), 556);
                  // mm値はpx値から派生させて一元管理（297mm / A4_HEIGHT_PX で変換）
                  const PX_TO_MM = 297 / A4_HEIGHT_PX;
                  const _innerH_mm = Math.round(_innerH_px * PX_TO_MM * 10) / 10;
                  const _innerW_mm = Math.min(Math.round(_innerH_mm * (4 / 3) * 10) / 10, 147);
                  const rot = Number(p.rotation) || 0;
                  const isPortrait = rot % 180 !== 0;
                  // 縦回転写真: maxWidth/maxHeight を入れ替えてコンテナに収める
                  const imgMaxW = isPortrait
                    ? (isPrinting ? `${_innerH_mm.toFixed(1)}mm` : `${_innerH_px}px`)
                    : (isPrinting ? `${_innerW_mm.toFixed(1)}mm` : `${_innerW_px}px`);
                  const imgMaxH = isPortrait
                    ? (isPrinting ? `${_innerW_mm.toFixed(1)}mm` : `${_innerW_px}px`)
                    : (isPrinting ? `${_innerH_mm.toFixed(1)}mm` : `${_innerH_px}px`);
                  return (
                    <div
                      key={i}
                      className="shrink-0 flex items-stretch"
                      style={{
                        height: `${(100 / _numRows).toFixed(2)}%`,
                        padding: isPrinting ? '2mm 3mm' : '6px 10px',
                        gap: isPrinting ? '2mm' : '8px',
                        borderBottom: i < chunk.length - 1 ? '1px solid #d8d4cc' : 'none',
                      }}
                    >
                      {/* 写真コンテナ - Material と同じ Tailwind クラス構造 */}
                      <div
                        className="w-[70%] h-full flex items-center justify-center overflow-hidden relative shrink-0"
                        style={{ borderRadius: 2, background: '#f7f5f1' }}
                      >
                        {p.image ? (
                          <div className="relative" style={{ display: 'inline-block' }}>
                            <img
                              src={proxyUrl(p.image, `photo_${p.id}_${sessionId}`)}
                              data-original-src={p.image}
                              loading="lazy"
                              decoding="async"
                              style={{
                                display: 'block',
                                width: 'auto',
                                height: 'auto',
                                maxWidth: imgMaxW,
                                maxHeight: imgMaxH,
                                transform: `rotate(${rot}deg)`,
                              }}
                              alt=""
                            />

                            {(p.circles ?? []).map((circle) => {
                              const size = Number(circle.size || 20);
                              return (
                                <div
                                  key={circle.id}
                                  className="absolute aspect-square rounded-full border-[3px] border-red-500 print:border-[2px]"
                                  style={{
                                    left: `${circle.x}%`,
                                    top: `${circle.y}%`,
                                    width: `${size}%`,
                                    transform: 'translate(-50%, -50%)'
                                  }}
                                />
                              );
                            })}

                            {(p.dimensionLines ?? []).map((line) => {
                              const color = line.color || "#FFFFFF";
                              const thickness = Number(line.size || 2);
                              const midX = (line.start.x + line.end.x) / 2;
                              const midY = (line.start.y + line.end.y) / 2;
                              const dynamicFontSize = 10 + (thickness - 2) * 2.5;

                              return (
                                <div key={line.id} className="absolute inset-0 z-20 pointer-events-none w-full h-full" style={{ overflow: 'visible' }}>
                                  <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
                                    <defs>
                                      <marker id={`cad-tick-pdf-${line.id}`} markerWidth="16" markerHeight="16" refX="8" refY="8" orient="auto" markerUnits="userSpaceOnUse">
                                        <line x1="0" y1="8" x2="16" y2="8" stroke={color} strokeWidth={thickness} />
                                        <line x1="4" y1="12" x2="12" y2="4" stroke={color} strokeWidth={thickness * 1.5} />
                                      </marker>
                                    </defs>
                                    <line
                                      x1={`${line.start.x}%`} y1={`${line.start.y}%`}
                                      x2={`${line.end.x}%`} y2={`${line.end.y}%`}
                                      stroke={color} strokeWidth={thickness} fill="none"
                                      markerStart={`url(#cad-tick-pdf-${line.id})`}
                                      markerEnd={`url(#cad-tick-pdf-${line.id})`}
                                    />
                                  </svg>
                                  {line.text && (
                                    <div
                                      style={{
                                        left: `${midX}%`,
                                        top: `${midY}%`,
                                        color: color,
                                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                                        backdropFilter: 'blur(2px)',
                                        WebkitBackdropFilter: 'blur(2px)',
                                        fontSize: `${dynamicFontSize}px`,
                                        transform: `translate(-50%, -50%) rotate(${line.textRotation ?? 0}deg)`
                                      }}
                                      className="absolute z-20 font-bold px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap"
                                    >
                                      {line.text}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : <span style={{ fontWeight: 700, color: 'rgba(0,0,0,0.2)', fontFamily: JP_FONT, fontSize: isPrinting ? '6pt' : '9px' }}>写真未登録</span>}
                      </div>
                      {/* 情報欄（黄金比38.2%） */}
                      <div style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', fontSize: '13px', overflow: 'hidden' }}>
                        {/* 写真No. */}
                        <div style={{ padding: isPrinting ? '1mm 3mm' : '4px 10px', borderBottom: '1px solid #d8d4cc', display: 'flex', alignItems: 'baseline', gap: isPrinting ? '1.5mm' : '6px' }}>
                          <span style={{ fontSize: isPrinting ? '5pt' : '8px', color: '#6b7178', fontWeight: 800, letterSpacing: '.08em', fontFamily: JP_FONT }}>写真 No.</span>
                          <span style={{ fontSize: isPrinting ? '9pt' : '13px', fontWeight: 900, color: '#c0492f', letterSpacing: '-.01em', fontFamily: JP_FONT }}>{p.photoNumber || '──'}</span>
                        </div>
                        {/* 工程名（2行折り返し） */}
                        <div style={{ padding: isPrinting ? '2mm 3mm' : '8px 10px', borderBottom: '1px solid #d8d4cc' }}>
                          <div style={{ fontSize: isPrinting ? '5pt' : '8px', color: '#6b7178', fontWeight: 800, letterSpacing: '.1em', fontFamily: JP_FONT }}>工程</div>
                          <div style={{ fontSize: isPrinting ? '9pt' : '14px', fontWeight: 900, lineHeight: 1.25, marginTop: isPrinting ? '0.5mm' : '2px', wordBreak: 'break-word', fontFamily: JP_FONT, color: '#1c1f22', overflow: 'hidden', maxHeight: isPrinting ? '7.5mm' : '2.7em' }}>
                            {p.process || '　'}
                          </div>
                        </div>
                        {/* 確認事項（値があるときのみ） */}
                        {p.checkItem && (
                          <div style={{ padding: isPrinting ? '1.5mm 3mm' : '6px 10px', borderBottom: '1px solid #d8d4cc' }}>
                            <div style={{ fontSize: isPrinting ? '5pt' : '8px', color: '#6b7178', fontWeight: 800, letterSpacing: '.1em', fontFamily: JP_FONT }}>確認事項</div>
                            <div style={{ fontSize: isPrinting ? '9pt' : '14px', fontWeight: 900, lineHeight: 1.25, marginTop: isPrinting ? '0.5mm' : '2px', wordBreak: 'break-word', fontFamily: JP_FONT, color: '#1c1f22' }}>
                              {p.checkItem}
                            </div>
                          </div>
                        )}
                        {/* 撮影日 / 位置図 */}
                        <div style={{ padding: isPrinting ? '1.5mm 3mm' : '6px 10px', borderBottom: '1px solid #d8d4cc' }}>
                          <div style={{ fontSize: isPrinting ? '5.5pt' : '8.5px', color: '#6b7178', lineHeight: 1.4, fontFamily: JP_FONT }}>
                            {p.shootingDate || '　'}
                          </div>
                          {sections.map && p.locationMap ? (
                            <div style={{ fontSize: isPrinting ? '5.5pt' : '8.5px', color: '#c0492f', lineHeight: 1.4, fontFamily: JP_FONT, marginTop: isPrinting ? '0.5mm' : '1px' }}>
                              {p.locationMap}
                            </div>
                          ) : null}
                        </div>
                        {/* 基準値・実測値（standard または actual があるときのみ） */}
                        {(p.standard || p.actual) && (
                          <div style={{ padding: isPrinting ? '1.5mm 3mm' : '6px 10px', borderBottom: '1px solid #d8d4cc' }}>
                            <div style={{ display: 'flex', gap: isPrinting ? '3.5mm' : '14px', alignItems: 'flex-end' }}>
                              {p.standard && (
                                <div>
                                  <div style={{ fontSize: isPrinting ? '5pt' : '8px', color: '#6b7178', fontWeight: 800, letterSpacing: '.1em', fontFamily: JP_FONT }}>基準値</div>
                                  <div style={{ fontSize: isPrinting ? '9pt' : '13px', fontWeight: 900, color: '#2f363d', lineHeight: 1.05, fontFamily: JP_FONT }}>
                                    {p.standard}
                                  </div>
                                </div>
                              )}
                              {p.actual && (
                                <div style={{ borderLeft: '3px solid #c0492f', paddingLeft: isPrinting ? '2.5mm' : '10px' }}>
                                  <div style={{ fontSize: isPrinting ? '5pt' : '8px', color: '#c0492f', fontWeight: 800, letterSpacing: '.1em', fontFamily: JP_FONT }}>実測値</div>
                                  <div style={{ fontSize: isPrinting ? '14pt' : '20px', fontWeight: 900, color: '#1c1f22', lineHeight: 1, fontFamily: JP_FONT }}>
                                    {p.actual}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {/* 説明（藍鼠バー） */}
                        <div style={{ flex: 1, padding: isPrinting ? '2mm 3mm' : '8px 10px', minHeight: 0, overflow: 'hidden' }}>
                          <div style={{ paddingLeft: isPrinting ? '3mm' : '8px', borderLeft: '3px solid #4a5560', height: '100%', overflow: 'hidden' }}>
                            <div style={{ fontSize: isPrinting ? '5pt' : '8px', color: '#4a5560', fontWeight: 800, letterSpacing: '.05em', marginBottom: isPrinting ? '0.5mm' : '2px', fontFamily: JP_FONT }}>説明</div>
                            <div style={{ fontSize: isPrinting ? '8.9pt' : '13px', color: '#1c1f22', lineHeight: 1.7, fontWeight: 400, wordBreak: 'break-word', fontFamily: JP_FONT, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
                              {p.description || '　'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* ── フッター ── */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: isPrinting ? '2mm 5mm' : '7px 18px', background: '#1c1f22', color: '#b9bec4', fontSize: isPrinting ? '6pt' : '8.5px', letterSpacing: '.08em', flexShrink: 0, fontFamily: JP_FONT }}>
                <span>{pageOffset('photo') + pageIndex + 1} / {totalPages}</span>
              </div>
            </div>
          </div>
        ));}

        case 'beforeAfter': {
          if (!sections.beforeAfter) return [];
          return beforeAfterPages.map((chunk, pageIndex) => (
            <div key={`ba-page-${pageIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `297mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
              <div className={`pdf-page bg-white text-black overflow-hidden ${isPrinting ? '' : 'absolute top-0 left-0 origin-top-left'}`}
                style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `297mm` : `${A4_HEIGHT_PX}px`, transform: isPrinting ? 'none' : `scale(${scale})`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>

                {/* ヘッダー */}
                <div style={{ flexShrink: 0, borderBottom: `${isPrinting ? '1.5px' : '2px'} solid #1a1a1a`, padding: isPrinting ? '0 14mm' : '0 40px', height: isPrinting ? '21mm' : '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {pageIndex === 0 && (
                    <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '12pt' : '16px', fontWeight: 700, letterSpacing: '0.2em', color: '#111' }}>施工前後比較</div>
                  )}
                  <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '7.5pt' : '10px', color: '#aaa', letterSpacing: '0.15em' }}>{pageIndex + 1} / {beforeAfterPages.length}</div>
                </div>

                {/* 2箇所ループ */}
                {chunk.map((item, idx) => {
                  const globalNum = pageIndex * 2 + idx + 1;
                  const numChar = '①②③④⑤⑥⑦⑧⑨⑩'[globalNum - 1] ?? String(globalNum);
                  return (
                    <div key={item.id} style={{
                      flex: 1,
                      borderBottom: idx === 0 ? `1px solid #e0e0e0` : 'none',
                      padding: isPrinting ? '4mm 14mm 0' : '14px 40px 0',
                      display: 'flex', flexDirection: 'column', gap: isPrinting ? '2mm' : '8px',
                      minHeight: 0, overflow: 'hidden',
                    }}>
                      {/* タイトル */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: isPrinting ? '3mm' : '8px', flexShrink: 0 }}>
                        <div style={{ width: isPrinting ? '1mm' : '3px', height: isPrinting ? '4mm' : '16px', background: '#e55a2b', borderRadius: 2, flexShrink: 0 }} />
                        <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '9pt' : '12px', fontWeight: 700, color: '#111', letterSpacing: '0.08em' }}>
                          {numChar} {item.title || '工事箇所'}
                        </div>
                      </div>

                      {/* ラベルバー */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isPrinting ? '1mm' : '3px', flexShrink: 0 }}>
                        <div style={{ background: '#555', color: '#fff', textAlign: 'center', padding: isPrinting ? '1.5mm 0' : '5px 0', fontFamily: JP_FONT, fontSize: isPrinting ? '7.5pt' : '10px', fontWeight: 700, letterSpacing: '0.12em' }}>施　工　前</div>
                        <div style={{ background: '#2a7a4b', color: '#fff', textAlign: 'center', padding: isPrinting ? '1.5mm 0' : '5px 0', fontFamily: JP_FONT, fontSize: isPrinting ? '7.5pt' : '10px', fontWeight: 700, letterSpacing: '0.12em' }}>施　工　後</div>
                      </div>

                      {/* 写真エリア */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isPrinting ? '1mm' : '3px', flexShrink: 0 }}>
                        {[
                          { src: item.beforeImage, circles: item.beforeCircles },
                          { src: item.afterImage, circles: item.afterCircles },
                        ].map((ph, pi) => (
                          <div key={pi} style={{ width: '100%', height: isPrinting ? '65mm' : '289px', overflow: 'hidden', position: 'relative', background: pi === 0 ? '#c8d0d8' : '#a8c4b2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {ph.src ? (
                              <img src={ph.src} alt={pi === 0 ? '施工前' : '施工後'} crossOrigin="anonymous" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            ) : (
                              <div style={{ textAlign: 'center', opacity: 0.5 }}>
                                <div style={{ fontSize: isPrinting ? '14pt' : '28px', marginBottom: 4 }}>📷</div>
                                <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '6pt' : '9px', color: 'rgba(0,0,0,0.5)' }}>{pi === 0 ? '施工前' : '施工後'}</div>
                              </div>
                            )}
                            {(ph.circles ?? []).map((circle) => {
                              const size = Number(circle.size || 20);
                              return (
                                <div
                                  key={circle.id}
                                  className="absolute aspect-square rounded-full border-[3px] border-red-500 print:border-[2px]"
                                  style={{ left: `${circle.x}%`, top: `${circle.y}%`, width: `${size}%`, transform: 'translate(-50%, -50%)' }}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>

                      {/* 説明エリア */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isPrinting ? '1mm' : '3px', flexShrink: 0 }}>
                        <div style={{ background: '#f4f4f4', padding: isPrinting ? '2mm 3mm' : '8px 10px', borderTop: `2px solid #888` }}>
                          <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '7pt' : '9.5px', color: '#444', lineHeight: 1.8, letterSpacing: '0.03em', whiteSpace: 'pre-wrap' }}>{item.beforeDesc || '施工前の状況を記入してください。'}</div>
                        </div>
                        <div style={{ background: '#eef6f1', padding: isPrinting ? '2mm 3mm' : '8px 10px', borderTop: `2px solid #2a7a4b` }}>
                          <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '7pt' : '9.5px', color: '#1a4a2e', lineHeight: 1.8, letterSpacing: '0.03em', whiteSpace: 'pre-wrap' }}>{item.afterDesc || '施工後の状況を記入してください。'}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* 1件しかない場合の空パディング */}
                {chunk.length < 2 && <div style={{ flex: 1 }} />}

                <div style={{ flex: '0 0 auto' }} />

                {/* フッター */}
                <div style={{ flexShrink: 0, borderTop: `1px solid #e0e0e0`, padding: isPrinting ? '0 14mm' : '0 40px', height: isPrinting ? '18mm' : '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '7.5pt' : '10px', color: '#aaa', letterSpacing: '0.1em' }}>{displayContractor}</div>
                  <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '7.5pt' : '10px', color: '#aaa', letterSpacing: '0.1em' }}>{project.projectName ?? ''}</div>
                </div>

              </div>
            </div>
          ));
        }

        case 'material': {
          if (!sections.material) return [];
          return materialPages.map((chunk, pageIndex) => (
          <div key={`material-page-${pageIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `297mm` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div className={`pdf-page w-full h-full flex flex-col bg-white text-black ${isPrinting ? "" : "absolute top-0 left-0 origin-top-left"}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? `297mm` : `${A4_HEIGHT_PX}px`, padding: isPrinting ? '8mm' : '15mm', transform: isPrinting ? 'none' : `scale(${scale})` }}>
              <h2 className="text-xl font-bold pb-1 mb-2 border-b-2 border-gray-800 shrink-0 print:border-black print:pb-0 print:mb-1">使用材料表</h2>
              <div className="flex-1 w-full h-full flex flex-col justify-evenly p-1.5 border-[3px] border-gray-800 bg-white min-h-0 overflow-hidden print:border-black">
                {chunk.map((m, i) => {
                  const isRotated = (Number(m.rotation) || 0) % 180 !== 0;
                  const maxImgWidth = isRotated ? '78mm' : '100%';
                  const maxImgHeight = isRotated ? '120mm' : '78mm';

                  return (
                    <div key={i} className="h-[30%] shrink-0 flex gap-2 p-1.5 rounded border border-gray-500 bg-white print:border-black">
                      <div className="w-[60%] h-full flex items-center justify-center overflow-hidden relative border border-gray-400 bg-gray-50 shrink-0 print:bg-white print:border-gray-500">
                        {m.image ? (
                          <div className="relative" style={{ display: 'inline-block' }}>
                            <img
                              src={proxyUrl(m.image, `material_${m.id}_${sessionId}`)}
                              data-original-src={m.image}
                              crossOrigin="anonymous"
                              loading="lazy"
                              decoding="async"
                              style={{
                                display: 'block',
                                width: 'auto',
                                height: 'auto',
                                maxWidth: maxImgWidth,
                                maxHeight: maxImgHeight,
                                transform: `rotate(${Number(m.rotation) || 0}deg)`
                              }}
                              alt=""
                            />
                          </div>
                        ) : <span className="font-bold text-gray-400">写真未登録</span>}
                      </div>
                      <div className="w-[40%] h-full flex flex-col text-[13px] border border-gray-400 bg-white shrink-0 print:border-black">
                        <div className="flex flex-1 min-h-0 border-b border-gray-400 shrink-0 print:border-black"><div className="w-24 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">品名</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden break-words whitespace-pre-wrap">{m.name || '　'}</div></div>
                        <div className="flex flex-1 min-h-0 border-b border-gray-400 shrink-0 print:border-black"><div className="w-24 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">メーカー</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden break-words whitespace-pre-wrap">{m.manufacturer || '　'}</div></div>
                        <div className="flex flex-[1.5] min-h-0 border-b border-gray-400 shrink-0 print:border-black"><div className="w-24 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-tight print:bg-gray-50 print:border-black">規格・寸法<br />数量</div><div className="px-2 py-1 flex-1 font-bold flex items-center overflow-hidden text-red-700 leading-snug break-words whitespace-pre-wrap">{m.specification || '　'}</div></div>
                        {(() => {
                          // 材料備考欄も同じ段階縮小ロジック
                          const style = pickLongTextStyle(m.remarks);
                          return (
                            <div className="flex flex-1 min-h-0">
                              <div className="w-24 font-bold flex items-center justify-center text-center bg-gray-100 border-r border-gray-400 leading-none print:bg-gray-50 print:border-black">備考</div>
                              <div
                                className="p-2 flex-1 overflow-hidden font-bold flex items-start break-words whitespace-pre-wrap"
                                style={{ fontSize: style.fontSize, lineHeight: style.lineHeight }}
                              >
                                {m.remarks || '　'}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="absolute bottom-[10mm] print:bottom-[5mm] right-[15mm] print:right-[8mm] text-xs font-bold text-gray-500 shrink-0">- {pageOffset('material') + pageIndex + 1} / {totalPages} -</div>
            </div>
          </div>
        ));}

        case 'appendix': {
          if (!sections.appendix) return [];
          return appendixPages.map((src, pageIndex) => (
          <div key={`appendix-${pageIndex}`} style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX * scale}px`, height: isPrinting ? `auto` : `${A4_HEIGHT_PX * scale}px` }} className="pdf-page-wrapper relative bg-white shadow-md shrink-0">
            <div className={`pdf-page bg-white overflow-hidden ${isPrinting ? '' : 'absolute top-0 left-0 origin-top-left'}`}
              style={{ width: isPrinting ? `210mm` : `${A4_WIDTH_PX}px`, height: isPrinting ? 'auto' : `${A4_HEIGHT_PX}px`, transform: isPrinting ? 'none' : `scale(${scale})`, padding: 0 }}>
              <img src={src} alt={`添付資料 ${pageIndex + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              <div className="absolute bottom-[10mm] print:bottom-[5mm] right-[15mm] print:right-[8mm] text-xs font-bold text-gray-500">
                - {pageOffset('appendix') + pageIndex + 1} / {totalPages} -
              </div>
            </div>
          </div>
          ));}

        default: return [];
        }})}
      </div>
    </div>
  );
}
