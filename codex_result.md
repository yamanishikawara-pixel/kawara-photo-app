実装と検証は完了しました。変更は [src/pages/BeforeAfterPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/BeforeAfterPage.tsx) のみで、保存・アップロード・データ構造・赤丸座標ロジックには触れていません。

確認結果:
- `npx tsc --noEmit` パス
- `npm run build` パス
- `print-color-adjust` 既存設定を確認済み

コミットだけ失敗しました。`.git/index.lock` を作成できず、`.git` 配下への書き込みがこの環境で `Operation not permitted` になっています。

実行したコミットコマンド:
```sh
git add src/pages/BeforeAfterPage.tsx && git commit -m "feat(before-after): A4プレビューの配色を変更（白縁赤丸・ラベルバー・プレースホルダー）"
```