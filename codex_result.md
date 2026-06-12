完了しました。ロジック変更は行わず、以下のみ対応しています。

- `src/utils/workdays.ts` を指定内容で追加
- `src/utils/workdays.test.ts` を指定内容で追加
- `src/pages/SchedulePage.tsx` の日付・祝日・営業日計算定義を削除し、`../utils/workdays` から import する形に変更

検証結果:

- `npx tsc --noEmit`：エラーなし
- `npx vitest run`：8 files / 94 tests すべて pass

コミットはしていません。