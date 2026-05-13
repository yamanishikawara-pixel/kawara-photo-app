対応しました。対象は [src/pages/PdfExportPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PdfExportPage.tsx) のみです。

変更内容:
- `formatCoverPeriod` を削除
- 工期の `value` を `project.constructionPeriod ?? ''` に戻し
- `cover-val` 内で `row.multiline` の場合だけ `〜/～/~` 位置で DOM レベルの2行 `<div>` に分割
- `whiteSpace: pre-line` 依存を削除

検証:
- `npm run build` 成功済みです。