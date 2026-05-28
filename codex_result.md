実装しました。対象は [src/pages/CoverPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/CoverPage.tsx:39) です。

変更内容:
- `WIZARD_FIELDS` を追加
- `wizardMode` / `wizardStep` state を追加
- `coverWizardMode` を `localStorage` に保存
- ページタイトル右側にウィザード切替ボタンを追加
- 表紙カスタマイズ直後にウィザード入力UIを追加
- `coverHiddenFields` の非表示項目はウィザードからスキップ
- ウィザードON時は基本情報一覧を隠し、OFF時は従来通り表示

確認:
- `npm run build` 成功済みです。