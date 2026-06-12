実装は完了しました。変更ファイルは以下です。

- [SchedulePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SchedulePage.tsx)
- [workdays.ts](/Users/yamanishikenta/kawara-photo-app/src/utils/workdays.ts)
- [workdays.test.ts](/Users/yamanishikenta/kawara-photo-app/src/utils/workdays.test.ts)
- [types.ts](/Users/yamanishikenta/kawara-photo-app/src/types.ts)

実施内容:
- 機能1: 保存中 / 保存済み / 保存失敗のヘッダー表示
- 機能2: tasks の Undo、ボタン、Ctrl/Cmd+Z
- 機能3: 土曜休み・会社休業日の設定、保存、営業日計算・表示への反映
- `WorkdayConfig` の追加テスト5件を追加

検証:
- 機能1後: `npx tsc --noEmit` OK、`npx vitest run` 94 passed
- 機能2後: `npx tsc --noEmit` OK、`npx vitest run` 94 passed
- 機能3 TDD red: 追加5件中、互換性確認の1件はパス、設定反映が必要な4件が失敗
- 最終: `npx tsc --noEmit` OK、`npx vitest run` 99 passed
- `npm run build` OK（Vite の既存 chunk size / dynamic import warning は出ています）

一点だけ未完了です。コミット作成は `.git` 配下への書き込みがサンドボックスで拒否され、実行できませんでした。

```text
fatal: Unable to create '/Users/yamanishikenta/kawara-photo-app/.git/index.lock': Operation not permitted
```

そのため、指定の3コミットは未作成で、現在は4ファイルが未コミット変更として残っています。