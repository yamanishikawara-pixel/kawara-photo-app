完了しました。`src/pages/SchedulePage.tsx` に以下を反映しています。

- [SchedulePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SchedulePage.tsx:148) に `constructionPeriod` state を追加
- [SchedulePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SchedulePage.tsx:184) で Firestore 読み込み時に `constructionPeriod` を反映
- [SchedulePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SchedulePage.tsx:224) の保存対象に `constructionPeriod` を追加
- [SchedulePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SchedulePage.tsx:258) で実工程の開始日〜終了日から `computedPeriod` を算出し、自動保存
- [SchedulePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SchedulePage.tsx:466) の書類ヘッダー表示を `computedPeriod ?? constructionPeriod ?? 未設定` に変更

確認結果:

- `npx vitest run` 成功: 7 files / 74 tests passed
- `npm run build` 成功

補足: 作業前から `.firebase/hosting.ZGlzdA.cache` と `codex_result.md` に未コミット変更がありました。今回の実装対象として編集したのは `src/pages/SchedulePage.tsx` です。