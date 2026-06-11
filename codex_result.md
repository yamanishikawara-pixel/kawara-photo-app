対応完了しました。

変更内容:
- [src/types.ts](/Users/yamanishikenta/kawara-photo-app/src/types.ts:117) に `WorkTypeTemplateItem` / `WorkTypeTemplate` と `UserSettings.workTypeTemplates` を追加
- [src/pages/SettingsPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SettingsPage.tsx:21) に工事種別テンプレートの state、読み込み、保存、D&D 行、並び替え、写真テンプレートへの upsert 一括反映 UI を追加
- `processSensors` は既存のものを再利用しています

確認:
- `npm run build` 成功
- `npx tsc --noEmit` 成功

補足: `npm run build` 時に既存の `src/pages/SchedulePage.tsx` について重複 `style` 属性の Vite 警告が出ていますが、今回の対象外ファイルで、ビルドは成功しています。