`src/pages/PdfExportPage.tsx` と `src/pages/ShareViewPage.tsx` の位置図レイアウトを指定どおり差し替えました。`colorForSymbol` を両方に追加し、符号連動カラーのピン・凡例バッジに統一しています。`PdfExportPage.tsx` では `showLegendTable` 分岐と `pdf-map-fullbleed` CSS を削除し、クラシック改良版の固定レイアウトへ一本化しました。

確認として `npm run build` を実行し、成功しています。