完了しました。

[src/budget/App.jsx](/Users/yamanishikenta/kawara-photo-app/src/budget/App.jsx:1099) の「瓦 計算明細」に `単価` 列を追加し、各行で `row.unitPrice` を直接編集できる入力欄を入れました。空欄時はマスタ標準単価を placeholder 表示し、入力値は既存の `calcTileRowCost` にそのまま渡る形です。

確認:
- `npm run build` 成功
- 既存警告として `src/pages/SchedulePage.tsx` の重複 `style` 属性警告、Firebase App Check の import 警告、chunk size 警告は出ていますが、今回変更によるビルド失敗はありません。