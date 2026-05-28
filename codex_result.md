実装しました。

変更内容:
- [PhotoPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PhotoPage.tsx:372)
  - 写真グリッドの長押しメニュー用 state/ref を追加
  - 500ms 長押しハンドラを追加
  - グリッドサムネイルに `onPointerDown/Up/Cancel` を追加
  - フルスクリーンモーダル直前にコンテキストメニューを追加
- [MapPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MapPage.tsx:1487)
  - 既存のピン編集 UI を iOS 風ボトムシートへ置き換え

確認:
- `npm run build` 成功

補足:
- `docs/batch4-cover-wizard.md` は既存の未追跡ファイルとして残っています。今回の作業では触っていません。