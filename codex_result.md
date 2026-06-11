完了しました。 [ProjectListPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/ProjectListPage.tsx) に以下を反映しています。

- 新規現場ボタンを即作成から作成モーダル起動へ変更
- 現場名入力、工種テンプレート選択、「なし」選択を追加
- `users/{uid}.workTypeTemplates` を既存のユーザー情報取得タイミングで読み込み
- 選択テンプレートの有効行から未撮影写真枠を一括生成
- `addProject` の関数・参照は対象ファイル内に残っていません

確認:
- `npm run build` 成功
- 既存警告として `src/pages/SchedulePage.tsx` の重複 `style` 属性警告と、一部 chunk size 警告は出ていますが、ビルドは通っています

作業前からの未コミット変更と思われる `.claude/settings.json`, `codex_result.md`, `src/pages/SettingsPage.tsx` は触っていません。