完了しました。対象は [src/pages/SettingsPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SettingsPage.tsx) のみです。

工事種別テンプレートだけを `localStorage` に自動保存し、SettingsPage 読み込み時に Firestore 保存済み内容と違うドラフトがあれば復元するようにしました。保存成功時にはドラフトを削除し、復元時にはセクション内に通知バナーを表示します。

検証結果:
- `npx eslint src/pages/SettingsPage.tsx` 成功
- `npm run build` 成功
- `npm run lint` は失敗。ただし既存の別ファイルと `src.backup-*` 配下のエラーによるもので、今回変更した `SettingsPage.tsx` 単体では問題ありません。