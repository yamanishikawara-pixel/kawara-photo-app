修正完了しました。

- [scheduleUtils.ts](/Users/yamanishikenta/kawara-photo-app/src/shared/scheduleUtils.ts:195): `SCHEDULE_A4_ROWS_FIRST` / `SCHEDULE_A4_ROWS_OTHERS` を共有定数化し、`scheduleA4PageCount()` を `ScheduleA4` と同じ「フェーズ先頭行でのみ改ページ」ロジックに変更
- [ScheduleA4.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/ScheduleA4.tsx:23): ローカル行数定数を削除し、共有定数を使用
- [PdfExportPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PdfExportPage.tsx:93): `pickProcessLabelStyle()` を追加し、写真カードの「工程」欄に適用

検証: `npm run build` 成功。既存の `src/pages/SchedulePage.tsx` の duplicate `style` attribute 警告とチャンクサイズ警告は出ていますが、ビルドは通っています。