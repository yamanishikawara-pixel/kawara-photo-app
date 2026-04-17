完了しました。

対象ファイルの `onMouseEnter` / `onMouseLeave` はすべて `onPointerEnter` / `onPointerLeave` に置き換え済みです。MapPage の `transition-all` も、色変化のみの箇所だけ `transition-colors` に変更し、拡縮や ring を伴う箇所は残しています。

結果は [codex_result.md](/Users/yamanishikenta/kawara-photo-app/codex_result.md) に記録しました。

検証:
- 対象ファイル内の `onMouseEnter|onMouseLeave`: 0件
- `npm run build`: 成功
- ビルド時間: Vite 表示 `2.45s`

補足: MapPage は指示本文に「9カ所」とあり、実際にも手動追加行ボタン分が残っていたため、そこも含めて全件置換しました。transition 置換も変更対象リストの実数に合わせて9カ所です。