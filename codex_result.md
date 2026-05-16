`src/App.tsx` を指定どおり更新しました。

ログイン後に `users/{uid}` から `logoUrl` と `companyName` を取得し、`apple-touch-icon`、`document.title`、`apple-mobile-web-app-title` を動的に更新します。ProtectedRoute、PageLoader、ルーティング構造は触っていません。

検証: `npm run build` 成功。