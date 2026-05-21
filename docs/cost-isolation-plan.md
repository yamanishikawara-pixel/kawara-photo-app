# cost_* コレクション ユーザー分離 段階的移行計画

## 現状の問題

`cost_projects` / `cost_master` / `cost_system` コレクションは
`request.auth != null` のみで保護されており、
ログイン済みであれば**任意のユーザーが全ユーザーの予算データを読み書きできる**。

## 移行方針：3段階（不可逆操作を最後に）

### 段階A：ownerId を追記（非破壊・既存データ維持）

kawara-budget アプリ側の変更：
- `cost_projects/{docId}` を書き込む全箇所に `ownerId: auth.currentUser.uid` を追加
- 既存の読み取りロジックは変更しない

**この段階ではルールを変更しない。**

### バックフィル（段階A 完了後）

既存ドキュメントに `ownerId` が付いていないものを一括更新するスクリプトを実行。

```js
// 実行前に必ずバックアップを取ること
const snap = await getDocs(collection(db, 'cost_projects'));
for (const d of snap.docs) {
  if (!d.data().ownerId) {
    // 現状は単一ユーザー運用のため、既知の uid を設定
    await updateDoc(d.ref, { ownerId: '既知のuid' });
  }
}
```

実行後、全ドキュメントに `ownerId` が付いていることを確認してから次段階へ。

### 段階B：Firestore ルール厳格化（バックフィル完了後のみ）

```
match /cost_projects/{document=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
    && request.resource.data.ownerId == request.auth.uid;
}
match /cost_master/{document=**} {
  allow read, write: if request.auth != null;
}
match /cost_system/{document=**} {
  allow read, write: if request.auth != null;
}
```

## 注意事項

- バックフィル前に段階Bを適用すると、`ownerId` 未設定ドキュメントへの書き込みが全失敗する
- 現在は単一ユーザー運用のため実害は限定的だが、SaaS化時には必須
- `cost_master` / `cost_system` はグローバル設定のため引き続き全認証ユーザーが読める設計を維持

## 着手前の確認事項

- [ ] kawara-budget の全データをバックアップ
- [ ] 既存の `cost_*` ドキュメント数を確認
- [ ] バックフィル対象の uid を確定
