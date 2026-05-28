`src/pages/PhotoPage.tsx` に Batch 2 を反映しました。

変更内容:
- `ChevronLeft` / `ChevronRight` を lucide import に追加
- `fullscreenPhotoId` state を追加
- グリッド写真タップ時にリスト遷移せずフルスクリーンモーダルを開くよう変更
- フローティングカメラボタン直前にフルスクリーン写真編集モーダルを追加
- 写真エリアで左右スワイプによる前後移動も追加

検証:
- `npm run build` 成功済み

対象ファイル: [src/pages/PhotoPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PhotoPage.tsx)