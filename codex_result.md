実装は完了しています。変更対象は [src/pages/BeforeAfterPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/BeforeAfterPage.tsx) のみです。`photo-ledger.jsx` は未追跡のまま触っていません。

検証結果:
- Phase 1 後: `npx tsc --noEmit` pass / `npx vitest run` 7 files, 92 tests pass
- Phase 2 後: `npx tsc --noEmit` pass / `npx vitest run` 7 files, 92 tests pass
- Phase 3 後: `npx tsc --noEmit` pass / `npx vitest run` 7 files, 92 tests pass

コミットは作成できませんでした。Phase 1 のコミット時に以下で失敗し、`.git` 配下への書き込み自体も同じく拒否されました。

```text
fatal: Unable to create '/Users/yamanishikenta/kawara-photo-app/.git/index.lock': Operation not permitted
```

現状は `src/pages/BeforeAfterPage.tsx` が未ステージの変更として残っています。