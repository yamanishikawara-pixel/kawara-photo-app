[src/pages/BeforeAfterPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/BeforeAfterPage.tsx) の `A4Page` 内だけ、指定の色値3か所を変更しました。

- 番号アクセントバー: `#e8732e` → `#c0492f`
- ラベル帯: `#5b6b7a` / `#1e9e63` → `#4a5560` / `#5a7d52`
- A4Page 写真プレビュー内の赤丸線色: `#ff2d20` → `#c0492f`

`BACircleMarker` 側の赤丸は `#ff2d20` のまま untouched です。

確認:
- `npx tsc --noEmit` パス
- `git diff --check` パス

コミットは未作成です。`.git/index.lock` 作成が `Operation not permitted` で拒否され、`.git` 配下への書き込み自体も同じ理由でブロックされました。使うコミットメッセージは指定どおり以下です。

```bash
git commit -m "feat(before-after): 報告書を職人路線へ作り替え 段階1/5 配色（ラベル帯・赤丸線色・番号アクセント）"
```