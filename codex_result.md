実装完了しました。

追加・変更した内容:
- [SchedulePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SchedulePage.tsx) を新規作成
- [types.ts](/Users/yamanishikenta/kawara-photo-app/src/types.ts) に `Project.ganttTasks` を追加
- [App.tsx](/Users/yamanishikenta/kawara-photo-app/src/App.tsx) に `/project/:id/schedule` ルートを追加
- [HomePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/HomePage.tsx) に「工程表」メニューを追加
- 既存の `node:test` 形式テスト 2 件を Vitest 形式に修正し、`npx vitest run` が通る状態にしました

確認結果:
- `npm run build` 成功
- `npx vitest run` 成功、`7 passed / 74 passed`