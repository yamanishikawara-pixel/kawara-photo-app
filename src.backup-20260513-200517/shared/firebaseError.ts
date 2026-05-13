// ==========================================
// Firebaseエラーを日本語の分かりやすいメッセージに変換
// 使い方：
//   import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';
//   try { ... } catch (err) {
//     logFirebaseError(err, '保存');
//     setError(firebaseErrorMessage(err, '保存'));
//   }
// ==========================================

export function firebaseErrorMessage(err: unknown, context: string = '操作'): string {
  const code = (err as { code?: string })?.code ?? '';
  const msg = (err as { message?: string })?.message ?? '';

  // ── Firestore ──
  if (code === 'permission-denied') {
    return `${context}の権限がありません。一度ログアウトして、再度ログインしてください。`;
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return `通信が不安定です。電波の良い場所で再度お試しください。`;
  }
  if (code === 'not-found') {
    return `${context}の対象データが見つかりません。既に削除されている可能性があります。`;
  }
  if (code === 'failed-precondition') {
    return `データベースの準備中です。時間をおいて再度お試しください。`;
  }
  if (code === 'resource-exhausted') {
    return `利用上限に達しました。しばらく待ってから再度お試しください。`;
  }
  if (code === 'cancelled') {
    return `${context}がキャンセルされました。`;
  }
  if (code === 'already-exists') {
    return `同じ名前のデータが既に存在します。`;
  }

  // ── Storage ──
  if (code === 'storage/unauthorized') {
    return `アップロード権限がありません。再度ログインしてください。`;
  }
  if (code === 'storage/canceled') {
    return `アップロードがキャンセルされました。`;
  }
  if (code === 'storage/retry-limit-exceeded') {
    return `通信が不安定なため${context}に失敗しました。電波の良い場所で再度お試しください。`;
  }
  if (code === 'storage/quota-exceeded') {
    return `ストレージ容量が不足しています。不要な現場データを削除してください。`;
  }
  if (code === 'storage/invalid-checksum') {
    return `ファイルの整合性チェックに失敗しました。もう一度${context}してください。`;
  }
  if (code === 'storage/object-not-found') {
    return `対象のファイルが見つかりません。`;
  }
  if (code === 'storage/unknown') {
    return `${context}に失敗しました。しばらく待ってから再度お試しください。`;
  }

  // ── Auth（LoginPage以外でも念のため） ──
  if (code === 'auth/network-request-failed') {
    return `ネットワーク接続を確認してください。`;
  }
  if (code === 'auth/too-many-requests') {
    return `アクセスが多すぎます。しばらく待ってから再度お試しください。`;
  }
  if (code === 'auth/requires-recent-login') {
    return `セキュリティのため、再度ログインしてください。`;
  }

  // ── ネットワーク全般（Firebaseコード以外） ──
  if (err instanceof TypeError && /network|fetch|failed to fetch/i.test(msg)) {
    return `通信エラーが発生しました。電波の良い場所で再度お試しください。`;
  }

  // ── デフォルト ──
  return `${context}に失敗しました。しばらく待ってから再度お試しください。`;
}

/**
 * 開発時のみコンソールにエラー詳細を出力。
 * 本番では何も出さないので、ユーザーに技術情報が漏れない。
 */
export function logFirebaseError(err: unknown, context: string): void {
  if (import.meta.env.DEV) {
    const code = (err as { code?: string })?.code ?? 'unknown';
    console.error(`[${context}] code=${code}`, err);
  }
}
