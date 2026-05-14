対応しました。対象は [src/pages/MapPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MapPage.tsx:566) のみです。

変更内容:
- デフォルト `editingMode` を `'pan'` から `'pin'` に変更
- `showAdvancedModes` state を追加
- モードボタン群を「ピン追加」「移動/ズーム」中心に変更
- 「寸法線」「消し」を「詳細」折りたたみ内へ移動

ポインターイベント処理、描画ロジック、ズーム・パン操作には触れていません。テスト実行はしていません。