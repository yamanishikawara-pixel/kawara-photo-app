完了しました。

変更内容:
- [ProjectListPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/ProjectListPage.tsx):43, 263, 273 の `transition-all` を `transition-colors` に変更
- [MaterialPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MaterialPage.tsx):67, 460, 473, 487 の `transition-all` を `transition-colors` に変更
- [SettingsPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SettingsPage.tsx):52, 432 の `transition-all` を `transition-colors` に変更
- [codex_result.md](/Users/yamanishikenta/kawara-photo-app/codex_result.md) を今回の結果で更新

確認済み:
- ProjectListPage 64, 308 は `transition-all` のまま
- SettingsPage 157, 185 は `transition-all` のまま
- `npm run build`: 成功
- ビルド時間: Vite 表示 `2.46s`

補足: `git status` 上では `.claude/.last_codex_task_hash`、`codex_task.md`、`src/pages/PdfExportPage.tsx` などにも既存の未コミット変更がありますが、今回の作業では触っていません。