import { doc, updateDoc, increment } from 'firebase/firestore';
import { ref, deleteObject, getMetadata } from 'firebase/storage';
import { db, storage } from '../firebase';

// ============================================================================
// 定数・表示ヘルパー
// ============================================================================

/** 1ユーザーあたりのストレージ上限 (500 MB) */
export const STORAGE_LIMIT_BYTES = 500 * 1024 * 1024;

/** バイト数を人が読みやすい文字列に変換 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 使用率 0〜1 を返す */
export function storageUsageRatio(usedBytes: number): number {
  return Math.min(1, usedBytes / STORAGE_LIMIT_BYTES);
}

// ============================================================================
// 容量チェック・カウンタ更新
// ============================================================================

/**
 * アップロード前に容量チェック。
 * @returns true = アップロード可能 / false = 上限超過
 */
export function canUpload(usedBytes: number, newFileBytes: number): boolean {
  return usedBytes + newFileBytes <= STORAGE_LIMIT_BYTES;
}

/**
 * アップロード成功後にFirestoreのストレージ使用量を加算する。
 * 失敗してもアップロード自体はすでに完了しているため、エラーはコンソールのみ。
 */
export async function trackUpload(uid: string, bytes: number): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      storageUsedBytes: increment(bytes),
    });
  } catch (e) {
    import.meta.env.DEV && console.warn('storageUsedBytes の更新に失敗しました:', e);
  }
}

/** 削除成功後にFirestoreのストレージ使用量を減算する。 */
export async function trackDelete(uid: string, bytes: number): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      storageUsedBytes: increment(-bytes),
    });
  } catch (e) {
    import.meta.env.DEV && console.warn('storageUsedBytes の減算に失敗しました:', e);
  }
}

// ============================================================================
// ID生成
// ============================================================================

/**
 * crypto.randomUUID() のフォールバック付きID生成。
 * Safari 15.4未満の古いiPad/iPhoneでも動作する。
 */
export const genId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* noop */ }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

// ============================================================================
// Storage URL / パス操作
// ============================================================================

/**
 * Firebase Storage の HTTPS URL からストレージパスを抽出する。
 *
 * 例:
 *   入力: https://firebasestorage.googleapis.com/v0/b/xxx/o/users%2Fuid%2Ffile.jpg?alt=media
 *   出力: users/uid/file.jpg
 *
 * @returns パス文字列 / URL形式でない場合は null
 */
export function storagePathFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const encoded = u.pathname.split('/o/')[1];
    return encoded ? decodeURIComponent(encoded.split('?')[0]) : null;
  } catch {
    return null;
  }
}

/**
 * 文字列が Firebase Storage の URL かを判定する。
 * ドメイン名(firebasestorage.googleapis.com / firebasestorage.app)の
 * ハードコーディングを避け、パス抽出の可否で判断する。
 */
export function isStorageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http')) return false;
  return storagePathFromUrl(url) !== null;
}

// ============================================================================
// 削除 + 使用量減算の統合関数
// ============================================================================

/**
 * Storage ファイルを削除し、使用量カウンタも減算する統合関数。
 *
 * - pathOrUrl は Storage パス または HTTPS URL どちらも受け付ける
 * - knownSize 指定時は getMetadata 呼び出しを省略(高速)
 * - getMetadata 失敗でも削除は続行する
 * - 削除成功時のみ trackDelete を呼ぶ(失敗時はカウンタを触らない)
 *
 * @param pathOrUrl Storage パス ("users/uid/file.jpg") または HTTPS URL
 * @param uid カウンタ減算対象のユーザーID(未指定時は減算しない)
 * @param knownSize 既知のファイルサイズ(バイト)。未指定なら getMetadata で取得
 */
export async function deleteStorageFileWithAccounting(
  pathOrUrl: string,
  uid: string | undefined,
  knownSize?: number,
): Promise<void> {
  if (!pathOrUrl) return;

  // URL 形式ならパスに変換
  const path = pathOrUrl.startsWith('http')
    ? storagePathFromUrl(pathOrUrl)
    : pathOrUrl;
  if (!path) {
    import.meta.env.DEV && console.warn('[storageUtils] invalid path/url:', pathOrUrl);
    return;
  }

  const fileRef = ref(storage, path);

  // サイズ取得(knownSize があれば優先)
  let size = knownSize ?? 0;
  if (size <= 0) {
    try {
      const meta = await getMetadata(fileRef);
      size = meta.size ?? 0;
    } catch (err) {
      // メタデータ取得失敗でも削除は続行
      import.meta.env.DEV && console.warn('[storageUtils] getMetadata failed:', path, err);
    }
  }

  // 削除実行
  try {
    await deleteObject(fileRef);
  } catch (err) {
    import.meta.env.DEV && console.warn('[storageUtils] deleteObject failed:', path, err);
    return; // 削除失敗時はカウンタを触らない
  }

  // カウンタ減算
  if (uid && size > 0) {
    await trackDelete(uid, size);
  }
}