実装しました。

変更箇所:
- [src/types.ts](/Users/yamanishikenta/kawara-photo-app/src/types.ts:226): `coverTitle` / `coverHiddenFields` を `Project` に追加
- [src/pages/CoverPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/CoverPage.tsx:50): 表紙タイトル・表示項目 state、読み込み、保存処理、UI を追加
- [src/pages/PdfExportPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PdfExportPage.tsx:895): 非表示項目の除外、タイトル差し替え、`constructionPeriod` の multiline 反映を追加

確認:
- `npm run build` 成功
- `npx tsc --noEmit` 成功
- `npm run lint` は失敗。今回変更外を含む既存 lint エラーが多数あり、今回触った範囲では既存の `CoverPage.tsx:287` も検出されています。