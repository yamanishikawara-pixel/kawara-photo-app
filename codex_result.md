完了しました。

[src/pages/SettingsPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SettingsPage.tsx) に `ArrowUp` / `ArrowDown` import、`moveProcess`、工程リストの上下移動ボタンを追加しました。保存処理は変更していません。

[codex_result.md](/Users/yamanishikenta/kawara-photo-app/codex_result.md) も指定フォーマットで更新済みです。

検証:
- `npm run build`: 成功
- `npx vitest run`: 失敗扱い。ただし失敗は指定どおり既存の `No test suite found` 2件のみで、通常テストは `70 passed`

ビルド・デプロイは行っていません。