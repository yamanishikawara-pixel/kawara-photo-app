完了しました。

変更内容:
- [ProjectListPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/ProjectListPage.tsx): `AlertTriangle` import を追加し、`StorageUsageBar` 直後に 80% / 95% の課金警告バナーを追加
- [storage.rules](/Users/yamanishikenta/kawara-photo-app/storage.rules): `photos` / `maps` / `materials` の `allow write` にファイルサイズ制限を追加

検証:
- `npm run build` 成功済みです。