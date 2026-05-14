対応しました。`src/pages/PhotoPage.tsx` に以下を反映済みです。

- `photoSaveState` / `saveStateTimer` を追加
- `projectRef` を追加し、`project` と同期する `useEffect` を追加
- `updatePhoto` を `projectRef.current` 参照に変更
- `updatePhoto` の依存配列を `[id]` に変更
- 保存中 / 保存済みステータスをヘッダー右側、グリッド/リスト切替の左に追加
- `saveStateTimer` は unmount 時に clear するようにしました

確認: `npm run build` は成功しています。