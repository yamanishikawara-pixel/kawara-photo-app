完了しました。対象は [src/pages/MapPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MapPage.tsx) のみです。

変更内容:
- `COLOR_PALETTE` 直後に `SYMBOL_COLORS` / `colorForSymbol` を追加
- 丸ピンの採番を全マップ横断に変更
- 矢印ピン・丸ピンの表示色を `colorForSymbol` に変更
- 凡例テーブルの符号列の文字色を `colorForSymbol(row.symbol)` に変更

`rg` と `git diff` で指定箇所の反映を確認済みです。テストは実行していません。