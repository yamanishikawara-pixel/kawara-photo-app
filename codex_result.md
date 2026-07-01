[PhotoPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PhotoPage.tsx:1159) を指定どおり修正しました。

写真ボタン全体から `dragHandleProps` と `touch-none` を外し、左上の番号バッジだけに `dragHandleProps` / `touch-none` / `cursor-grab` / `title` を移しています。保存ロジック、アップロード、赤丸、⋮メニューには触れていません。

検証:
`npx tsc --noEmit` パス

コミットは実行しようとしましたが、この環境で `.git` 配下への書き込みが `Operation not permitted` で拒否され、`git add` が失敗しました。変更は作業ツリーに反映済みです。ローカルで実行するコミットコマンドは以下です。

```bash
git add src/pages/PhotoPage.tsx
git commit -m "fix(photo): グリッドのスクロール誤作動を修正（ドラッグハンドルを番号バッジのみに限定）"
```