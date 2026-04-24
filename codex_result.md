[PdfExportPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PdfExportPage.tsx) に指定された 9 件を反映しました。変更はこのファイルのみに限定しています。

主な修正は、空ID生成のクロージャ化、`afterprint` 時の PDF 状態リセット、`applyPreset` での並び順維持、`mountedRef` による非マウント後 `setState` 防止、添付PDFの `destroy()` とキャンバス解放、`crossorigin` の保持、ZIP内ファイル名衝突回避、BeforeAfter フッターの `contractorName` fallback、エラーの8秒自動消去です。

検証は `npm run build` で通過しました。