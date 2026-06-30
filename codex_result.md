実装は完了しています。変更は [src/pages/PhotoPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PhotoPage.tsx:1076) のみです。

グリッドビューを `DndContext` + `SortableContext` + `SortablePhotoCard` 化し、`rectSortingStrategy` で長押しからスライド並び替えできるようにしました。長押しメニュー用 timer は削除し、メニューは各カード右上の `⋮` ボタンから開く形に移しています。追加ボタンは元の見た目を保つため、同じ grid 内に非 sortable 要素として残しました。

確認結果:
- `npx tsc --noEmit` 通過
- `npx vitest run` 通過、7 files / 92 tests
- `npm run build` 通過

コミットは試行しましたが、`.git/index.lock` を作成できず失敗しました。

```text
fatal: Unable to create '/Users/yamanishikenta/kawara-photo-app/.git/index.lock': Operation not permitted
```

作業ツリーには変更が残っています。権限がある通常のターミナルで以下を実行すれば、指定メッセージでコミットできます。

```bash
git add src/pages/PhotoPage.tsx
git commit -m "feat(photo): グリッドビューで長押し→スライド並び替えに対応、メニューは⋮ボタンへ移動"
```