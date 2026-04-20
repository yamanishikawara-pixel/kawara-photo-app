# codex_result — 表紙レイアウト黄金比改善

## 変更ファイル
- src/pages/PdfExportPage.tsx

## 実施した修正
- [x] 修正1: タイトル 32pt / letterSpacing 0.20em
- [x] 修正2: アクセントバー 0.7mm × 90mm
- [x] 修正3: タイトルブロック marginBottom 16mm
- [x] 修正4: ラベル text-align justify（flex+span廃止）
- [x] 修正5: 値フォント 14pt / 18px
- [x] 修正6: 施工保証ラベル同様に変更（3箇所）
- [x] 修正7: 施工保証値フォント 14pt（3箇所）

## npm run build 結果
- 結果: 成功
- ビルド時間: 2.44s
