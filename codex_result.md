完了しました。`src/pages/ProjectListPage.tsx` に以下を追加済みです。

- `lucide-react` import に `Calculator` を追加
- `validateBudgetProjectName` を追加
- タイトル行の「完了済みを非表示」前に「実行予算書」ボタンを追加
- 各物件カードの完了ボタン前に電卓ボタンを追加
- カード側は `e.stopPropagation()` ありなので既存のカードクリック `navigate` には干渉しません

確認として `npm run lint` を実行しましたが、既存の lint エラーで失敗しています。今回の追加箇所ではなく、例として `src/pages/ProjectListPage.tsx` の既存 `no-unused-expressions`、`PdfExportPage.tsx` の未使用変数や不正空白、`src.backup-*` 配下のエラーなどが出ています。