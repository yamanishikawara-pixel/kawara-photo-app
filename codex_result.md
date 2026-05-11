座標系刷新を実装しました。

`src/shared/mapCoords.ts` を追加して、旧 `194 / 120` コンテナ基準から画像アスペクト基準へ移行する共通ロジックをまとめました。[mapCoords.ts](/Users/yamanishikenta/kawara-photo-app/src/shared/mapCoords.ts:1) です。`Project` には `mapImageAspects?: number[]` を追加しています。[types.ts](/Users/yamanishikenta/kawara-photo-app/src/types.ts:186)

`MapPage` は `project.mapImageAspects` を優先して表示アスペクトを決めるように変更し、印刷セーフエリアのオーバーレイは削除、画像 `onLoad` 時に未移行データだけ自動マイグレーションして Firestore へ書き戻すようにしました。[MapPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MapPage.tsx:14) [MapPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MapPage.tsx:1018) [MapPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MapPage.tsx:1242)  
`PdfExportPage` と `ShareViewPage` も `resolveMapAspect(...)` ベースの動的 aspect に切り替えています。[PdfExportPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PdfExportPage.tsx:17) [PdfExportPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PdfExportPage.tsx:1036) [ShareViewPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/ShareViewPage.tsx:12) [ShareViewPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/ShareViewPage.tsx:151)

検証は `npm run build` で通しています。