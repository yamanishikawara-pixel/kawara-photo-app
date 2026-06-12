対応しました。

変更内容:
- [src/shared/scheduleUtils.ts](/Users/yamanishikenta/kawara-photo-app/src/shared/scheduleUtils.ts)
  - `ScheduleTask.link`を削除
  - `cascade()`を各タスク独立の終了日再計算に変更
  - `newTask()`の`link`デフォルト削除
  - `makeTemplate()`は内部フラグ`_parallel`で初期日付だけ生成時に計算

- [src/pages/SchedulePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SchedulePage.tsx)
  - 編集モーダルから「前工程との関係」を削除
  - 「開始日」単独フィールドに変更
  - `newTask({ ..., link: 'sequential' })`の3箇所を削除

確認:
- `npm run build` 成功
- `npm test` は既存の `src/budget/*.test.js` 2ファイルで「No test suite found」により失敗しました。全体では70テストはpassしており、今回変更した工程表まわりの型・ビルドエラーは出ていません。