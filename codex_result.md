対応しました。

変更内容:
- [MapPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MapPage.tsx): `migratedIndicesRef` を `id` 変更時にリセット
- [MapPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MapPage.tsx): ズーム保存を 200ms デバウンス化し、アンマウント時にタイマー cleanup
- [MapPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MapPage.tsx): 未使用の `mapImageAspects` state と `setMapImageAspects` 呼び出しを削除
- [BeforeAfterPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/BeforeAfterPage.tsx): アイテム削除後に該当 `uploadingKeys` を削除
- [SettingsPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SettingsPage.tsx): 孤立ファイル削除後の自動 `handleRecalcStorage()` 呼び出しを削除し、手動再計算メッセージに変更

確認:
- `npm run build` は成功しました。
- `npm run lint` は失敗しましたが、主に既存の `src.backup-20260513-200517` 配下や既存 lint 指摘が原因です。今回差分の whitespace check は `git diff --check` で問題ありません。