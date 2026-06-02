実装しました。

[PhotoPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/PhotoPage.tsx) の `uploadPhoto` と [MaterialPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MaterialPage.tsx) の `handleImageUpload` に、指定どおり3回リトライと `1000 * attempt` のバックオフを追加しました。圧縮、容量チェック、`trackUpload`、エラー表示、`finally` など他のロジックは触っていません。

検証: `npm run build` 成功。Viteの既存っぽい dynamic import 警告のみ出ています。