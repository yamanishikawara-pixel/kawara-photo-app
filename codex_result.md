`src/pages/PdfExportPage.tsx` の表紙スタイルを指定どおり調整しました。

反映内容は、タイトルの中央配置復帰と `top: 96`、ラベル色とダッシュ色の黒化、行区切り線の黒化、各行の `paddingTop` / `paddingBottom` を `8` への変更です。フィールド構造、3列レイアウト、値フォントサイズ、折り返し設定、フッターやロジックは触っていません。

確認は `git diff -- src/pages/PdfExportPage.tsx` で実施済みです。表示確認まではまだ行っていません。