import { doc, updateDoc } from 'firebase/firestore';
import { increment } from 'firebase/firestore';
import { db } from '../firebase';

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
    console.warn('storageUsedBytes の更新に失敗しました:', e);
  }
}
