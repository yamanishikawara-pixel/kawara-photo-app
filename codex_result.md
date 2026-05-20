共有リンク機能を指定どおり削除しました。

変更内容:
- [src/pages/HomePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/HomePage.tsx): 共有リンク用 import/state/生成関数/UI を削除
- [src/App.tsx](/Users/yamanishikenta/kawara-photo-app/src/App.tsx): `ShareViewPage` lazy import と `/share/...` ルートを削除
- [firestore.rules](/Users/yamanishikenta/kawara-photo-app/firestore.rules): `shares` コレクションのルールブロックを削除

確認:
- `npm run build` 成功
- 共有リンク関連の残存参照は実装上なし。`firestore.rules` のコメントに「共有リンクによる外部公開は廃止」と残っているだけです。