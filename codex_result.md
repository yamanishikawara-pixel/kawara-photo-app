完了しました。

指定 7 タスクを実施し、結果を [codex_result.md](/Users/yamanishikenta/kawara-photo-app/codex_result.md) に記録しました。対象ファイル内の `window.confirm` / `alert(` / 該当 TODO コメントが残っていないことも確認済みです。

検証:
- `npm run build`: 成功
- ビルド時間: `2.44s`

変更した主なファイル:
- [BeforeAfterPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/BeforeAfterPage.tsx)
- [CoverPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/CoverPage.tsx)
- [MapPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MapPage.tsx)
- [MaterialPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MaterialPage.tsx)
- [PhotoPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PhotoPage.tsx)
- [codex_result.md](/Users/yamanishikenta/kawara-photo-app/codex_result.md)

補足: `git status` では今回対象外の `.claude/.last_codex_task_hash`、`codex_task.md`、`src/pages/ProjectListPage.tsx`、`src/shared/storageUtils.ts` にも未コミット変更が見えています。これらは今回の task-03〜09 では触っていません。