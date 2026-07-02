修正①・修正②ともコード変更と検証は完了しています。

変更ファイル:
- [BeforeAfterPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/BeforeAfterPage.tsx)
- [MaterialPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/MaterialPage.tsx)

検証:
- 修正①後: `npx tsc --noEmit` OK、`npx vitest run` OK（7 files / 92 tests）
- 修正②後: `npx tsc --noEmit` OK、`npx vitest run` OK（7 files / 92 tests）

コミットだけ実行できませんでした。`git add` 時点で `.git/index.lock` を作れず、以下で失敗しています。

```text
fatal: Unable to create '/Users/yamanishikenta/kawara-photo-app/.git/index.lock': Operation not permitted
```

`.agent/handoff.md` には既存の未コミット変更がありましたが、触っていません。

ローカルで権限が通る状態なら、以下で指定どおり別コミットにできます。

```bash
git add src/pages/BeforeAfterPage.tsx
git commit -m "fix(before-after): 修正① 保存済み画像消失バグ修正（パス一意化＋旧ファイル削除予約）"

git add src/pages/MaterialPage.tsx
git commit -m "fix(material): 修正② stale closure によるテキスト消失バグ修正（projectRef導入・デバウンス保存）"
```