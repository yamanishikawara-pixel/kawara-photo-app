実装しました。

- [PhotoPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PhotoPage.tsx:344): `floatingCamRef` を追加
- [PhotoPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PhotoPage.tsx:1643): 右下固定のカメラボタンを追加し、既存 `handleBulkUpload` に接続
- [ProjectListPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/ProjectListPage.tsx:106): スワイプ状態を追加
- [ProjectListPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/ProjectListPage.tsx:306): 左スワイプ削除確認、右スワイプ完了トグルのハンドラを追加
- [ProjectListPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/ProjectListPage.tsx:563): 現場カードに pointer event とスワイプ中の追従表示を適用

スワイプ後に同じカードのクリック遷移が発火しないよう、直後のクリックを抑止するガードも入れています。

検証: `npm run build` 成功。