完了しました。変更は [src/pages/SchedulePage.tsx](/Users/yamanishikenta/kawara-photo-app/src/pages/SchedulePage.tsx:241) のみです。

工程開始日を含む月では `gridStartDay` を工程開始日にし、`monthStart` / `daysInMonth` / `todayIdx` をその左端基準で計算するようにしました。日付ヘッダーも [該当箇所](/Users/yamanishikenta/kawara-photo-app/src/pages/SchedulePage.tsx:618) で `gridStartDay + i` を表示します。

確認結果:
- `npx vitest run`: 7 files / 74 tests passed
- `npm run build`: 成功

ビルド時に既存の Vite chunk warning と Firebase App Check の dynamic/static import warning は出ていますが、ビルド自体は成功しています。