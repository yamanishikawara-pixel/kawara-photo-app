`src/pages/ProjectListPage.tsx` に指定どおり反映しました。`getMetadata` と `trackDelete` を追加し、`deleteProject` は削除前にファイルサイズを集計して、削除後に `trackDelete(user.uid, totalBytes)` と `setStorageUsed(...)` で使用量を減算する実装へ差し替えています。

編集対象は [ProjectListPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/ProjectListPage.tsx:1) のみです。テストやビルド確認は今回は実行していません。