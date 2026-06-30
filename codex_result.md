実装は完了しました。変更は [src/pages/PhotoPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PhotoPage.tsx:733) のみです。

対応内容:
- 既存の一括アップロード処理を `processFiles(files: File[])` に共通化
- 既存ファイル選択ボタンは `handleBulkUpload` 経由で従来どおり動作
- 画面全体への画像ドラッグ＆ドロップ対応を追加
- 画像クリップボードペースト対応を追加
- ドラッグ中の「ここに写真をドロップ」オーバーレイを追加

検証:
- `npx tsc --noEmit` パス
- `npx vitest run` パス、7 files / 92 tests
- `npm run build` パス

コミットだけ、この環境からは `.git` 配下への書き込みが拒否されて作成できませんでした。

```txt
fatal: Unable to create '/Users/yamanishikenta/kawara-photo-app/.git/index.lock': Operation not permitted
```

作業ツリーには `src/pages/PhotoPage.tsx` の変更だけが残っています。コミットする場合のメッセージは指定どおりです。

```bash
git add src/pages/PhotoPage.tsx
git commit -m "feat(photo): 写真の一括アップロードにドラッグ&ドロップ・クリップボードペーストを追加"
```