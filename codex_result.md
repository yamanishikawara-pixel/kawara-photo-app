7項目を反映しました。

`HomePage` では `aborted` フラグ付きの非同期読込に置き換えて、Firebaseエラーの詳細化も追加しました。[src/pages/HomePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/HomePage.tsx)  
`CoverPage` は添付PDFを `upload -> Firestore更新 -> 差分だけ容量加算` に変更し、同一パス上書き前提にしています。[src/pages/CoverPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/CoverPage.tsx)  
`ProjectListPage` では削除前に `userId` の所有権再確認を追加しました。[src/pages/ProjectListPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/ProjectListPage.tsx)

画像圧縮は共通化して [src/shared/imageUtils.ts](/Users/yamanishikenta/kawara-photo-app/src/shared/imageUtils.ts) を新規作成し、`PhotoPage` のローカル実装を置換、`MaterialPage` にも圧縮処理を追加しました。[src/pages/PhotoPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PhotoPage.tsx) [src/pages/MaterialPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MaterialPage.tsx)  
あわせて `PhotoPage` でマスタ保存名の `trim` 対応と、複数写真削除の `Promise.allSettled` 並列化も入れています。

検証は `npm run build` で通過済みです。