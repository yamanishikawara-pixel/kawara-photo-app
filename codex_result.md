[HomePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/HomePage.tsx:180) を修正しました。予算アプリを開く際、`project.projectName` があれば `?project=${encodeURIComponent(project.projectName)}` を付けて開きます。

確認結果:
- `npm run build`: 成功
- `firebase deploy --only hosting`: 失敗

デプロイ失敗理由は Firebase CLI 側で以下のエラーです。

```text
Assertion failed: resolving hosting target of a site with no site name or target name
```

`--project kawara-photo-app` 指定でも同じでした。さらに `hosting:sites:list` は Firebase API へのリクエストに失敗しており、この環境からはデプロイ完了まで進められませんでした。