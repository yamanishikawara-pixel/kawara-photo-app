[src/pages/BeforeAfterPage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/BeforeAfterPage.tsx:996) の `.map()` 閉じカッコ欠落を指定どおり `))}` に修正しました。

検証結果:
- `npx tsc --noEmit` 通過
- `npm run build` 通過

コミットは試行しましたが、この実行環境から `.git` 配下へ書き込みできず失敗しました。

```text
fatal: Unable to create '/Users/yamanishikenta/kawara-photo-app/.git/index.lock': Operation not permitted
```

現在の変更は未コミットで残っています。コミットする場合のコマンドは以下です。

```bash
git add src/pages/BeforeAfterPage.tsx
git commit -m "fix(before-after): map閉じカッコ欠落によるビルドエラーを修正"
```