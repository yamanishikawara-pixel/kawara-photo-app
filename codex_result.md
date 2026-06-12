完了しました。

[src/pages/SchedulePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SchedulePage.tsx) に以下だけ変更しています。

- `DEBOUNCE_MS` の直後に `BUFFER_DAYS = 7` を追加
- タスクがある場合の `rangeEnd` を `scheduleEndDate + 7日` に変更
- タスク未登録時は従来どおり本日から30日間

確認結果:

- `npx vitest run`: 7 files / 74 tests passed
- `npm run build`: 成功

ビルド時に既存の chunk size / Firebase App Check dynamic import 警告は出ていますが、ビルド自体は成功しており、今回の変更範囲とは無関係です。