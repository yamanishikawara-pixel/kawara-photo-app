対応完了しました。対象は [src/pages/SchedulePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SchedulePage.tsx) のみです。

工程表はタスクの実働日ベースで最早開始日から最遅終了日までを連続表示するようになり、月送り UI と `viewYear` / `viewMonth` 関連 state は削除しました。書類ヘッダーの工期も実際の表示範囲に変わっています。

確認結果:
- `grep -n "viewYear\|viewMonth\|moveMonth\|gridStartDay\|daysInMonthTotal" src/pages/SchedulePage.tsx` 該当なし
- `npx vitest run` 成功: 7 files / 74 tests passed
- `npm run build` 成功

ビルド時に既存の chunk size / Firebase App Check import 警告は出ていますが、今回変更による失敗はありません。