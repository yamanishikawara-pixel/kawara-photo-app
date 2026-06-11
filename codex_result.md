完了しました。

変更内容:
- `resetReplacedMapAspect` を [src/shared/mapCoords.ts](/Users/yamanishikenta/kawara-photo-app/src/shared/mapCoords.ts) に追加
- [src/pages/MapPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MapPage.tsx) の replace 時 `finalAspects` 計算を純粋関数呼び出しに変更
- [src/shared/mapCoords.test.ts](/Users/yamanishikenta/kawara-photo-app/src/shared/mapCoords.test.ts) に新規5件のテストを追加
- [codex_result.md](/Users/yamanishikenta/kawara-photo-app/codex_result.md) を今回結果で更新

検証:
- `npm run build`: 成功
- `npx vitest run src/shared/mapCoords.test.ts`: 成功、35件 passed

補足: `npm run build` では既存の `src/pages/SchedulePage.tsx` の duplicate `style` attribute 警告が出ていますが、ビルドは成功しています。デプロイは行っていません。