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

PdfExportPage 工事写真台帳セクション（case 'photo'）の外観リデザイン — 計画策定済み、段階①待ち

---

## 相談役 → Claude Code への依頼

```
kobetsu-ledger.jsx（プロジェクトルート）を設計図として、
PdfExportPage の工事写真台帳セクション（case 'photo'）の見た目を作り替える。

制約：
- ロジック非干渉（ページ分割・画像最適化・ZIP・印刷処理・Firestore・rotationロジック触らない）
- 型拡張なし。Photo型の既存フィールドのみ使用:
    photoNumber / shootingDate / locationMap / process / description
- description は「所見」として 藍鼠(#4a5560) 左バー付きで表示
- 基準値・実測値スロットは今回作らない（将来チケット）
- UI・入力フォーム側は対象外

以下の計画（段階①〜③）で進めること。承認済み。
```

---

## 実装計画（工事写真台帳リデザイン）

### 前提整理

**差し替え対象ファイル・箇所**
- `src/pages/PdfExportPage.tsx` の `case 'photo':` ブロック（1行目は 1279行目）のみ。
- 具体的には `case 'photo': {` から `}` の閉じ括弧（1408行目付近）まで。

**ロジック非干渉の担保**
- `photoPages`（ページ分割結果）の参照はそのまま維持 → `photoPages.map((chunk, pageIndex) => ...)`
- 各 photo の `p.image / p.rotation / p.circles / p.dimensionLines` は現行の rotation/overlay 描画コードをそのままコピー（触らない）
- `proxyUrl()` / `crossOrigin` / `data-original-src` 属性は現行から変更なし
- `isPrinting` による mm / px 切り替えパターンを継続使用
- `pageOffset('photo')` / `totalPages` はフッターのページ番号計算に引き続き使用
- `sections.map` の条件（位置図行の表示/非表示）を継続尊重
- 外側2枚のラッパー `div.pdf-page-wrapper` / `div.pdf-page` は構造変更なし（ただし `bg-white → bg-[#f7f5f1]` と `padding 削除` は Stage① で実施）

**位置図の配置方針（補足）**
- 現行: 専用行 `位置図 | 値(赤)` のテーブルセル（`sections.map` が true のときのみ表示）
- 新デザイン: 撮影日の右に `/ {p.locationMap}` を赤字で小さく付加。`sections.map` 条件は維持。

---

### 段階① — ページ外枠・背景・ヘッダー・フッター（内部カードは現行のまま）

**変更するもの**
- `pdf-page` div: `bg-white → bg-[#f7f5f1]`（紙色）・`padding: 0` に変更
- 現行の `div.flex-1.border-[3px].border-gray-800.justify-evenly.p-1.5.overflow-hidden` を撤廃
- 現行の絶対配置ページ番号 div を撤廃（フッターに移動するため）
- **追加: ヘッダー**（kobetsu-ledger のヘッダー構造をそのまま移植）
  - 左: 赤錆 6px 縦バー ＋「工事写真台帳」小字 ＋ `project?.projectName` 大字
  - 右: `userSettings?.companyName` のみ
  - border-bottom: 2px solid #1c1f22
- **追加: コンテンツエリア**（`flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0`）
  - 中身は現行の3枚カードを一時的にそのまま入れる
  - ただし `h-[30%] shrink-0` を `flex: 1` に変更（flex で等分）
  - `border border-gray-500 bg-white rounded` の card border は残す（Stage② で除去）
- **追加: フッター**
  - `background: #1c1f22`, `padding: isPrinting ? '2mm 5mm' : '7px 18px'`
  - 左: `{contractorName}　{project?.projectName}`（kobetsu-ledger と同じく会社名+工事名）
  - 右: ページ番号 `{pageOffset('photo') + pageIndex + 1} / {totalPages}`

**検証ポイント**
- 写真・赤丸・寸法線が従来通り表示されること（カード内部変更ゼロなので機能影響はないはず）
- ヘッダー/フッターで A4 が縦に詰まりすぎないこと（3行が均等に並ぶ）
- `npx tsc --noEmit` エラー0件
- コミットメッセージ: `fix(pdf-photo): 段階① ページ外枠・ヘッダー・フッター追加（内部カード現行維持）`

---

### 段階② — 各行レイアウト（No.バッジ・黄金比・写真枠）

**変更するもの**
- 各行 div: `border border-gray-500 bg-white rounded p-1.5` を削除
- 行区切り: `borderBottom: '1px solid #d8d4cc'`（最終行を除く）、 `padding: isPrinting ? '2mm 4mm' : '10px 16px'`、`gap: isPrinting ? '3mm' : '12px'`
- **追加: No.バッジ**（kobetsu-ledger の番号サイドバーをそのまま移植）
  - width: `isPrinting ? '9mm' : '40px'`
  - "No." ラベル（赤錆 8px）
  - 数字（赤錆 32px・900・lineHeight: 0.85）… `(p.photoNumber || String(pageIndex * 3 + i + 1)).padStart(2, '0')`
  - 黒短線（width: 20px, height: 3px, background: #1c1f22）
- 写真エリア:
  - `w-[60%]` → `flex: '0 0 61.8%', maxWidth: '61.8%', aspectRatio: '4 / 3', maxHeight: '88%'`
  - `overflow: 'hidden'`, `background: '#ddd8d0'`, `borderRadius: 2`, `border: '1px solid #d8d4cc'`
  - 内部の rotation/circles/dimensionLines コードは**一切触らない**（現行コードをそのまま入れる）
- 情報エリア: `w-[40%]` → `flex: '1 1 38.2%'`（内部テーブル形式は Stage③ まで維持）

**検証ポイント**
- No.バッジが正しい番号を表示すること
- 写真が 4:3 の枠内に収まること（rotated 写真も含む）
- 赤丸・寸法線の位置がズレていないこと（rotation コードを変えていないので大丈夫なはず）
- 印刷プレビューで 3行が A4 に収まること
- コミットメッセージ: `fix(pdf-photo): 段階② No.バッジ・黄金比レイアウト・写真枠`

---

### 段階③ — 情報欄の文字組み（テーブル廃止・自由組み）

**変更するもの**
- 情報エリア内部のテーブル形式（写真NO/撮影日/位置図/工程/説明 のグリッド行）を全廃
- 置き換え:
  ```
  [工程 ラベル 8px kawara]
  [工程名 12.5px 900 lineClamp:2 wordBreak:break-word]
  [撮影日 / 位置図(sections.map条件) 8.5px kawara]  ← 位置図は赤字
  [所見 8.5px borderLeft:3px solid #4a5560 paddingLeft:8px]  ← description
  ```
- `pickProcessLabelStyle` / `pickLongTextStyle` は不要になるため呼び出しを削除
  （ただし関数定義は他セクション（材料欄など）で使われている可能性があるため、定義は残す）
- 「写真No.」は No.バッジ（Stage②）に移行済みのためテーブル行は不要

**検証ポイント**
- 5フィールド（photoNumber/shootingDate/locationMap/process/description）が全て画面に出ていること
- 工程名が 2行まで折り返し、3行目以降は省略されること
- 所見欄に藍鼠の左バーが付いていること
- 位置図が `sections.map === false` のとき非表示になること
- 印刷で文字が切れていないこと
- コミットメッセージ: `fix(pdf-photo): 段階③ 情報欄テーブル廃止・自由組みレイアウト`

---

## Claude Code → 相談役への報告

### 段階1/5：配色のベース変更 — 完了・デプロイ済み

- 実施内容：`A4Page` コンポーネント（`src/pages/BeforeAfterPage.tsx`）内、色の値のみ3箇所変更。
  - 番号の左の細い縦アクセントバー：`#e8732e` → `#c0492f`（赤錆）
  - 「施工前」ラベル帯の背景：`#5b6b7a` → `#4a5560`（藍鼠）
  - 「施工後」ラベル帯の背景：`#1e9e63` → `#5a7d52`（苔緑）
  - 報告書内の赤丸の線色：`#ff2d20` → `#c0492f`（赤錆。白縁box-shadowは変更なし）
  - 編集ビューの赤丸（`BACircleMarker`）は指示通り対象外、`#ff2d20` のまま未変更
  - 所見欄の borderTop（`#1e9e63`）は段階4の担当のため今回は未変更（意図的）
- コミットID：`b623c1d`（Stopフックによる自動コミット。同コミットに別件のPdfExportPage画質改善・アップロード画質改善も含まれるが、ファイル単位では分離されており本変更は `src/pages/BeforeAfterPage.tsx` の該当3箇所のみ）
- `npx tsc --noEmit` 結果：エラー0件
- テスト結果：`npx vitest run` 7 files / 92 tests 全パス
- 検証：ビルド成果物（`dist/assets/BeforeAfterPage-*.js`）に新色 `c0492f`/`4a5560`/`5a7d52` が含まれることをサーバー側で確認。実機での見た目確認はユーザーが実施し、「何も変わらない」とのコメントあり → 旧色・新色とも同系統の色相（青灰系・緑系・橙赤系）のため、スクリーンショット越しでは違いが分かりにくいことが原因と判断。構造変更（大きな番号・ヘッダー黒ブロック・黒帯フッター）はまだ未実装のため、現時点で「職人・力強さ」が体感しにくいのは想定通り。
- デプロイ：済み（`firebase deploy --only hosting`）
- 気づき：色相が近い配色変更は「変わった感」が出にくい。段階2（ヘッダー構造変更）以降で見た目の変化が明確になる見込み。
- ユーザーに実機で確認してほしいこと：報告書プレビュー・印刷で、保存・赤丸（位置含む）が今まで通り動くこと（色のみの変更なので機能影響は無いはずだが、実機確認は未了）。

### 段階2/5：ヘッダーの作り替え — 完了・デプロイ済み

- 実施内容：`A4Page` ヘッダーを全面差し替え。
  - `LAYOUT.headerH`: 40 → 64（写真エリアの計算式 `photoH` は既存ロジックがこの定数を参照して自動再計算。コード変更なし。マイナスにならないことは目視確認済み）
  - 左：赤錆の縦バー（5px幅）＋小見出し「施工写真報告書」＋ `projectName` を大きく太く（16px・900）。**「ページ1のみ表示」の条件を撤廃し、全ページで表示**するよう変更（craft-reportの方向に合わせた判断）。固定文言「施工前後比較」は削除。
  - 右：黒ブロック（`#1c1f22`）で `contractor`（施工業者名）＋ページ番号。ページ番号は既存の `pageIndex`/`totalPages` をそのまま使用、表示位置を変えただけ。
  - `projectName`/`contractor` とも新しいデータ取得・state追加なし。既存propsをそのまま別の見た目で表示。
- コミットID：`29798c0`
- `npx tsc --noEmit` 結果：エラー0件
- テスト結果：`npx vitest run` 7 files / 92 tests 全パス
- 検証：コード上のロジック確認のみ（写真エリアの高さがマイナスにならないこと、ヘッダー構造がJSX的に閉じていることを確認）。実機での見た目・保存・赤丸・印刷の動作確認は未実施。
- デプロイ：済み
- 気づき：ヘッダーの固定文言「施工前後比較」を撤廃し `projectName` に置き換えたため、現場名が空のプロジェクトでは「工事名未設定」とフォールバック表示される。
- ユーザーに実機で確認してほしいこと：
  - ヘッダーの新デザイン（赤錆縦バー＋工事名／黒ブロックの施工業者名）が崩れずに表示されるか
  - ヘッダーが高くなった分、写真エリアが窮屈になっていないか（3箇所/ページのレイアウトは維持している想定）
  - 保存・赤丸（位置含む）・印刷が今まで通り動くか
  - 問題なければ「次へ」で段階③（番号サイドバー化）に進む

---

## ユーザーの実機確認メモ

（ユーザーが実際に触って気づいたことをここにメモ。相談役・Claude Code 両方が読む）

---

## 次やることリスト

- [x] BeforeAfterPage 報告書デザイン 全5段階完了・デプロイ済み（2026-07-01）
- [x] 写真台帳グリッドのスクロール誤作動修正（ドラッグハンドルを番号バッジのみに限定）（2026-07-01）
- [ ] **PdfExportPage 工事写真台帳 リデザイン**（段階①〜③、上記計画参照）— 段階① 着手待ち
- [ ] 基準値・実測値の型拡張＋入力欄＋台帳強調表示（将来チケット、今回スコープ外）
- [ ] バックアップフォルダ src.backup-20260513（Desktop に移動済み）を数日見なければ削除

---

## 履歴（古い依頼・報告はここへ送る）

### 2026-06-30：BeforeAfterPage 職人路線デザイン化 — 計画策定〜段階1完了

- 依頼：craft-report.jsx の方向性（崩した中の真面目さ／職人・力強さ）に BeforeAfterPage 報告書の見た目を作り替える。保存・赤丸ロジック等は厳守で変更禁止。
- 計画：
  - 適用範囲は `A4Page` コンポーネントのみ（報告書プレビュー＆印刷）。編集フォーム側は対象外。
  - 差し替え箇所：ヘッダー／番号／ラベル帯／赤丸線色／所見／フッター。
  - フッターの「工期・元請け」はデータが無い／state追加が必要なため A案（contractorName + projectName のまま、黒帯デザインのみ）で確定。
  - 段階分け：①配色 → ②ヘッダー → ③番号サイドバー化 → ④所見欄 → ⑤フッター。各段階1コミット、tsc確認、実機確認。
  - A4プレビューと印刷は同一の `<A4Page>` コンポーネントを描画しているため、追加の同期作業なしで両方に反映される。
- 段階1（配色）：`#e8732e`→`#c0492f`／`#5b6b7a`→`#4a5560`／`#1e9e63`→`#5a7d52`／報告書内赤丸`#ff2d20`→`#c0492f`。コミット `b623c1d`。tsc・vitest 全パス。デプロイ済み。実機確認（保存・赤丸・印刷の動作）はユーザー未実施。

### 2026-06-25〜2026-06-30：handoff.md セットアップ／謎コミット確認

- 依頼：handoff.md のセットアップ。
- 報告：`.agent/handoff.md` を新規作成。あわせて謎コミット `ea68764`「確認確認」の中身を確認 → `.firebase/hosting.ZGlzdA.cache` のみ。Firebase Hosting のキャッシュファイルで実害なし。Stopフックの自動コミット。以後のコミットには含まれておらず解消済み。
