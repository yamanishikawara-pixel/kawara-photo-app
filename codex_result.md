`src/pages/PdfExportPage.tsx` の `case 'cover'` に、指定どおり黄金比ベースの4階層を反映しました。対象は [PdfExportPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PdfExportPage.tsx:825) です。

変更内容は、コメント更新、`coverFields` の `valPt` 調整、タイトルを `42pt`、水平線 `top: 178`、フィールド群 `top: 230`、行高 `72`、ラベル `10pt`、各 `paddingBottom: 8`、フッター社名 `9pt`、ページ番号 `8pt` です。ラベル文言、値の表示ロジック、`isPrinting` 分岐、`gridTemplateColumns: '148px 1fr'` は変更していません。

検証は差分確認まで実施しました。画面レンダリングや PDF 出力の実表示確認はまだです。