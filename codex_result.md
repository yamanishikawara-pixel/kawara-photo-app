完了しました。`src/pages/SettingsPage.tsx` の工程プルダウンを、矢印ボタン式から `@dnd-kit` のドラッグ並び替えに変更しました。

主な変更:
- `ArrowUp` / `ArrowDown` と `moveProcess` を削除
- `GripVertical` のドラッグハンドルを追加
- `DndContext` / `SortableContext` / `useSortable` / `arrayMove` を使った並び替えに置換
- `SortableProcessRow` コンポーネントを追加
- `customProcesses: processes` の保存形式は変更なし

検証:
- `npm run build` 成功

ビルド中に `SchedulePage.tsx` の既存 duplicate `style` 属性警告が出ていますが、今回の変更対象外で、ビルド自体は通っています。