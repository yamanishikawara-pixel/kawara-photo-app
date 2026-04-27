`HomePage` と `ProjectListPage` に指定の変更を反映しました。`HomePage` では `Calculator` アイコン付きの「実行予算書」メニューを追加し、現場名未入力時の警告つきで `https://kawara-budget.web.app/?project=...` を別タブで開く分岐を入れています。外部リンク表示として `↗` も付けました。

`ProjectListPage` では `?search=` の初期取り込み、検索ボックス、`useMemo` による検索＋完了非表示フィルタ、空状態メッセージ分岐、件数表示の検索モード対応、完全一致カードのオレンジ強調を追加しています。

検証は `npm run build` で完了し、TypeScript エラーなしで通過しました。