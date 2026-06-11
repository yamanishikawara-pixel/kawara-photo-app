対応しました。

[src/budget/App.jsx](/Users/yamanishikenta/kawara-photo-app/src/budget/App.jsx:528) に `tileHinmeiOptions` の `useMemo` を追加し、瓦明細の品名 `FilterInput` だけ `items={tileHinmeiOptions}` に変更しました。

副資材・労務側や `row.category`、原価計算ロジックには触れていません。差分確認済みです。