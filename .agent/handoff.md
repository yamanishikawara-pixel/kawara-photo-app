# handoff.md — 相談役 ⇄ Claude Code 連携ノート

このファイルは、相談役（チャットのClaude）と Claude Code が「同じノートを見る」ための共有メモです。
人間（ユーザー）がこのファイルを橋渡しします。使い方：

- **相談役** … 「Claude Codeへの依頼」欄に、実装してほしい内容を書く。
- **ユーザー** … その依頼を Claude Code に「.agent/handoff.md を読んで作業して」と渡す。
- **Claude Code** … 実装し、「Claude Codeからの報告」欄に結果（コミットID・検証状況・気づき）を追記する。
- **ユーザー** … その報告を相談役に見せる（コピペ）。相談役が次の依頼を書く。

毎回このファイルの上から下へ、最新の状態が分かるようにする。古い依頼・報告は下の「履歴」へ送る。

---

## いま進行中のこと（1行で）

新規タスクなし。主要機能はすべて完了・本番稼働中。

---

## 相談役 → Claude Code への依頼

（なし）

---

## 完了済み機能（本番稼働中）

すべて `kawara-photo-app.web.app` 本番デプロイ済み。

| 機能 | 概要 | 確認方法 |
|---|---|---|
| 工事写真台帳リデザイン | PdfExportPage の写真ページをリデザイン。ヘッダー（赤錆縦バー・工事名・施工業者名）、写真3行レイアウト、写真No.・工程・撮影日・位置図・説明の自由組みレイアウト | PdfExportPage.tsx L1342-1560 |
| 基準値・実測値 | PhotoPage の台帳に基準値・実測値の入力欄追加。PDF出力にも表示（実測値ラベル赤色） | PhotoPage.tsx L1673-, PdfExportPage.tsx L1510- |
| 確認事項 | 写真ごとの確認事項フィールド追加 | types.ts `checkItem`、PhotoPage.tsx・PdfExportPage.tsx |
| 工事種別テンプレート | 設定画面から工事種別ごとのテンプレート（工程・基準値・確認事項）を登録、写真台帳に一括適用 | SettingsPage.tsx・ProjectListPage.tsx |
| 材料マスタへの画像追加 | 材料マスタに画像を登録でき、PDF出力の材料欄にも表示 | コミット `699a483` |
| 工程表 備考欄・ロゴ削除 | SchedulePage から会社ロゴを削除、備考欄を追加（入力・デバウンス保存・印刷反映） | SchedulePage.tsx、コミット `949000c` / `0bb6b3c` |
| スケジュール管理（CalendarPage） | 月間カレンダー＋予定管理。予定の追加・編集・削除・種類管理・物件紐付け・物件への遷移ボタン | CalendarPage.tsx（680行）、コミット `22138ae`〜`f1d8e3d` |
| Firestore セキュリティルール | scheduleEvents コレクションのルール追加 | firestore.rules |
| Firestore インデックス | scheduleEvents: userId + yearMonth の複合インデックス（有効確認済み） | firestore.indexes.json |

---

## 残タスク

| # | 内容 | 担当 | 状態 |
|---|---|---|---|
| 1 | `src.backup-20260513`（Desktop に移動済み）を削除 | ユーザー手動 | 未実施 |
| 2 | ブランチ `fix/schedule-page` → `main` へのマージ | ユーザーまたは Claude Code | 未実施。いずれ整理が必要 |

---

## 将来の機能案（着手未定）

- **使用材料の集計**: 複数現場をまたいだ材料使用量の集計・CSV出力
- **過去現場の横断検索**: 工事種別・施工業者・期間などで現場を横断検索
- **写真の共有リンク**: 特定現場の写真台帳を URL 共有（閲覧のみ）
- **スケジュールの天気連携**: CalendarPage に天気情報を表示（外部 API）
- **実行予算書との連携**: 工程表や写真台帳から実行予算書の項目に紐付け

---

## 技術的負債・構造的注意点

### kawara-budget: PROJECT_FIELDS の重複定義（将来リファクタ候補）

`tileOrderDate` 追加時に判明。フィールドの追加には以下 **5箇所すべて** に漏れなく反映する必要がある：

1. `projectStorage.js` の `PROJECT_FIELDS` 配列
2. `App.jsx` の `saveProjectToCloud` raw オブジェクト
3. `App.jsx` の `saveQuiet` raw オブジェクト
4. `App.jsx` のオートセーブ raw オブジェクト
5. `App.jsx` の `loadProjectFromCloud` — snap（undo用）と setter の両方

`setDoc` は **全上書き**のため、1箇所でも漏れるとそのフィールドが `undefined` → Firestore 書込時に除外 → **静かにデータが消える**。

将来的には `PROJECT_FIELDS` の単一定義から raw オブジェクトを自動生成する形にリファクタすることが望ましい。

---

## Claude Code → 相談役への報告

### 2026-07-26：kawara-budget 精査対応・tileOrderDate 追加 — 完了・デプロイ済み

- 精査（code-auditor）で指摘された重大1件・要注意4件をすべて修正・デプロイ済み（2026-07-26）

| # | 重大度 | 内容 | コミット |
|---|---|---|---|
| 1 | 重大 | マスタ起動時ロードにタイムスタンプガード追加（`global_master_localUpdatedAt` でローカル優先） | `dee08bb` |
| 2 | 要注意 | 起動時マスタ読込に `masterMatCategories` を追加（保存側との非対称解消） | `81f03cb` |
| 3 | 要注意 | `deleteProject` に `cost_${slug}_localUpdatedAt` の削除を追加（再復活防止） | `51bf96b` |
| 4 | 要注意 | `insuranceRate` が未定義・NaN のとき `welfareCost` が NaN になる問題を修正 | `44da9ff` |
| 5 | 機能追加 | 発注日（`tileOrderDate`）フィールド追加・入力欄・発注書表示（後方互換: 空なら今日の日付） | `87e54bd` |

- 精査で「要注意・要相談」だった発注日の保存も設計確認の上、同セッションで実装
- 構造的注意点（PROJECT_FIELDS の重複定義）は上記「技術的負債」セクションに記録済み

### 2026-07-23：handoff.md 整理・事実確認

- 旧 handoff.md に「未完了」と記載されていた以下3項目を、コードと git 履歴で確認の上「完了済み」に修正：
  1. PdfExportPage 工事写真台帳リデザイン（ソースで実装確認）
  2. 基準値・実測値の型拡張＋入力欄＋台帳表示（types.ts / PhotoPage / PdfExportPage で確認）
  3. スケジュール管理 CalendarPage 段階①〜⑤（git log 5コミット確認・デプロイ 19:37:49 確認）
- handoff.md を全面書き直し。矛盾・重複を削除し、現状を正確に反映。

---

## 履歴（古い依頼・報告）

### 〜2026-07-23：主要機能の実装

以下はすべて完了・デプロイ済みのため詳細履歴は省略。

- BeforeAfterPage 報告書デザイン 全5段階（2026-07-01）
- 写真台帳グリッドのスクロール誤作動修正（2026-07-01）
- PdfExportPage 工事写真台帳リデザイン（多数の fix(pdf) コミットで逐次完成）
- 基準値・実測値・確認事項・工事種別テンプレート（2026-07 前半）
- 工程表 SchedulePage 備考欄追加・ロゴ削除（2026-07-23）
- CalendarPage スケジュール管理 段階①〜⑤（2026-07-23、コミット `22138ae`〜`f1d8e3d`）
