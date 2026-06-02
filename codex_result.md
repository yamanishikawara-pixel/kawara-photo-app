実装しました。

変更内容:
- `MapPage` の回復可能エラーを `setSaveError` に変更
- `deleteMapPhoto` で `mapImageAspects` も削除・保存
- `uploadMapImage` / `BeforeAfterPage.uploadImage` に 3 回リトライ追加
- replace 時に `mapImageAspects` と移行済み状態をリセット
- `mapCoords` の padding を `0` に変更
- `colorForSymbol` を `src/shared/symbolColor.ts` に共通化
- 写真/材料マスタ保存に try/catch とロールバック追加
- `CoverPage.toggleHiddenField` にロールバック追加
- `SettingsPage` の error dismiss と自動消去追加
- `MaterialPage.saveError` の自動消去追加

確認:
- `npm run build` は成功
- `npx eslint src/shared/symbolColor.ts` は成功
- `npm run lint` は失敗しましたが、既存の `src.backup-*` や既存ファイルの不規則空白・未使用変数など今回差分外の既存 lint エラーが原因です

補足: `ShareViewPage.tsx` はこのリポジトリ内に存在しませんでした。