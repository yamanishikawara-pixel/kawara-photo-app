工程表機能の削除を完了しました。

変更内容:
- `src/shared/scheduleUtils.ts`
- `src/pages/SchedulePage.tsx`
- `src/pages/ScheduleA4.tsx`

上記3ファイルを削除しました。

あわせて以下から工程表関連を除去しました。
- `src/App.tsx`
- `src/pages/HomePage.tsx`
- `src/types.ts`
- `src/pages/PdfExportPage.tsx`

確認:
- `rg -n "schedule|ScheduleA4|scheduleUtils" src` は一致なし
- `npm run build` 成功

ビルド時に Vite の既存警告として chunk size と Firebase App Check import 警告は出ていますが、今回の削除に伴うエラーはありません。