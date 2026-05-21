[SettingsPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SettingsPage.tsx) に指定の変更を入れました。

追加内容:
- `listAll` import
- `orphanResult` state
- `handleDetectOrphans`
- ストレージ再計算ボタン直後の「孤立ファイルを検出」ボタンと結果表示

削除処理は入れていません。`handleRecalcStorage` と `handleBulkMigration` も変更していません。

検証:
- `npm run build` 成功済み。