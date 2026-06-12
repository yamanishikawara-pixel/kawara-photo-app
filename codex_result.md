実装完了しました。対象は [src/pages/SchedulePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SchedulePage.tsx) です。

対応内容:
- ドラッグ中の表示範囲固定、前方バッファ追加
- デバウンス保存のアンマウント時フラッシュ
- タスクIDをUUID文字列化し、既存number IDをロード時にサニタイズ
- 閲覧のみではFirestore書き込みしないよう制御
- 祝日範囲外警告、月帯ラベル、日付表示修正
- 46日以上の印刷時に月ごと改ページするチャート分割

確認:
- `npx vitest run` 成功: 7 files / 74 tests passed
- `npm run build` 成功
- `git diff --check -- src/pages/SchedulePage.tsx` 成功

開発サーバーは `vite` の listen がこの環境で `EPERM` になり起動できませんでした。
- `0.0.0.0:5173` 失敗
- `127.0.0.1:5173` 失敗

ビルド時にViteの通常警告として、Firebase App Checkの重複import警告と500kB超チャンク警告が出ていますが、ビルド自体は成功しています。