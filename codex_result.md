[src/pages/PhotoPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PhotoPage.tsx:1144) のヘッダー行ボタン群だけ変更しました。

- グリップ: `hidden sm:flex ... items-center justify-center`
- ↑↓ボタン: `flex sm:hidden ...`
- `movePhoto` / `handleDragEnd` などのロジックは未変更です。

確認は該当範囲の差分目視のみです。なお、同ファイルには今回以前から `safeUpdate` 周りの未コミット差分がありましたが、触っていません。