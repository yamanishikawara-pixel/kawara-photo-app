# PdfExportPage.tsx 精査報告

精査日: 2026-07-21
精査者: code-auditor

---

## 対象ファイル

`/Users/yamanishikenta/kawara-photo-app/src/pages/PdfExportPage.tsx`（1,667 行）

全体を 200 行ずつ 9 分割で走査した。参照型定義: `src/types.ts`、参照定数: `src/shared/utils.ts`。

---

## 要約

重大な問題（データ消失・本番障害）は発見されなかった。Safari/iOS 互換性リスクが 1 件、型と実データの不整合による印刷フロー破壊リスクが 1 件、修正の不整合・残骸・計算ずれが複数件確認された。

---

## 発見した問題（重大度順）

---

### 問題 1

**【重大度】要注意**
**【場所】** `PdfExportPage.tsx:1169-1172`
**【問題】** 位置図の画像コンテナが `aspectRatio` を flex アイテムとして持っており、Safari/iOS で高さが 0 になって位置図画像が全滅する可能性がある。

**【根拠】**
```tsx
// line 1139 — この div が flex column（画像コンテナの直接の親）
<div className="w-full h-full flex flex-col border border-gray-700 ... min-h-0">

  // line 1169-1172 — ← flex の直接の子に aspectRatio を設定
  <div
    className="relative overflow-hidden bg-gray-50 ..."
    style={{ width: '100%', aspectRatio: `${containerAspect}` }}
  >
```

コメント（1166-1168 行）には「画像エリアを flex-1 にすると下に余白が出るため、コンテナの高さは aspectRatio で自動決定する」とある。しかし CLAUDE.md の知見のとおり「Safari は Flex アイテムに aspect-ratio を当てると挙動が不安定」であり、これは過去に台帳写真が全滅した実害と同種のパターン。`width: 100%` だけでインラインサイズが確定した状態では、ブロック方向（高さ）の解決に Safari が失敗して高さ 0 になる恐れがある。内側の `position: absolute; inset: 0` のオーバーレイ群（1174-1175 行）も連動してサイズ 0 になり、ピン・寸法線・白塗りも消える。

**【提案】** Material セクション方式に倣い、flex アイテムとしては `shrink-0` + 明示パーセント高さ（例: 中身の比率に合わせた `h-[XX%]`）を使い、その内部で `position: absolute; inset: 0` で画像を配置する。`aspectRatio` は flex コンテキスト外のコンテナに移すか廃止する。

---

### 問題 2

**【重大度】要注意**
**【場所】** `PdfExportPage.tsx:440, 469, 837`
**【問題】** `project.photos` に対し null/undefined ガードなしで直接 `.filter()` しており、`photos` フィールドを持たない旧 Firestore ドキュメントで印刷・PDF ダウンロードボタンを押した瞬間に `TypeError: Cannot read properties of undefined` が発生して印刷フローが完全に壊れる。

**【根拠】**
```tsx
// handlePrint (440行) — ガードなし
const emptyDatePhotos = project.photos.filter(p => p.image && !p.shootingDate);

// handlePdfDownload (469行) — ガードなし
const emptyDatePhotos = project.photos.filter(p => p.image && !p.shootingDate);

// セクション選択パネル JSX (837行) — ガードなし
? project.photos.filter(p => p.image && !p.shootingDate).length
: 0;
```

同じフィールドへのアクセスが他箇所では保護されている：
```tsx
// handleZipExport (299行) — 保護あり
const photosWithImage = (project.photos ?? []).filter((p) => p.image);

// useMemo activePhotos (508行) — 保護あり
(project?.photos ?? []).filter(...)
```

`types.ts:205` では `photos: Photo[]`（non-optional）と定義されているが、Firestore はスキーマを保証しない。299 行と 508 行が `?? []` で防御していること自体が、開発者がこのリスクを認識している証左。旧プロジェクトや写真なしで作成されたプロジェクトで本番障害になる可能性がある。

**【提案】** 3 箇所とも `(project.photos ?? []).filter(...)` に統一する。

---

### 問題 3

**【重大度】軽微**
**【場所】** `PdfExportPage.tsx:1611`
**【問題】** 材料セクションの img に `objectFit: 'contain'` が残存しており、今回修正された「photo セクションの新アプローチ（objectFit なし）」と不整合。「Material を参考に photo を修正した」という経緯と矛盾する。

**【根拠】**
```tsx
// material img (1605-1612) — objectFit あり
style={{
  display: 'block',
  width: 'auto',
  height: 'auto',
  maxWidth: maxImgWidth,
  maxHeight: maxImgHeight,
  objectFit: 'contain',   // ← 残存
  transform: `rotate(${Number(m.rotation) || 0}deg)`
}}

// photo img (1331-1339) — 修正後は objectFit なし
style={{
  display: 'block',
  width: 'auto',
  height: 'auto',
  maxWidth: imgMaxW,
  maxHeight: imgMaxH,
  transform: `rotate(${rot}deg)`,
}}
```

`width: auto; height: auto` かつ max 制約という構成では `objectFit` はボックスサイズ = 固有サイズになるため実際には無効（no-op）。Safari への悪影響はないが、修正アプローチの参考元に不要なプロパティが残っていることは将来の混乱の種になる。

**【提案】** material img からも `objectFit: 'contain'` を削除して両セクションを統一する。

---

### 問題 4

**【重大度】軽微**
**【場所】** `PdfExportPage.tsx:1176-1181`
**【問題】** 位置図 img に `loading="lazy"` および `decoding="async"` が付与されていない。今回の修正で photo・material・beforeAfter の全 img に追加されたが、位置図だけ漏れている。

**【根拠】**
```tsx
// 位置図 img (1176-1181) — 属性なし
<img
  src={proxyUrl(u, `map_${mapIndex}_${sessionId}`)}
  data-original-src={u}
  crossOrigin="anonymous"
  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
  alt=""
/>

// photo img (1329-1330) — 追加済み
loading="lazy"
decoding="async"

// material img (1603-1604) — 追加済み
loading="lazy"
decoding="async"
```

位置図は現場の航空写真など大容量になりやすい。`decoding="async"` がないと同期デコードがメインスレッドをブロックし、複数地図のプロジェクトで表示遅延が増す。

**【提案】** 1176-1181 の img タグに `loading="lazy" decoding="async"` を追加する。

---

### 問題 5

**【重大度】軽微**
**【場所】** `PdfExportPage.tsx:1389`
**【問題】** 写真の寸法線テキストラベルに `backdropFilter: 'blur(2px)'` のみが指定されており、`-webkit-backdrop-filter` ベンダープリフィックスがない。Safari 18 未満（iOS 17 以前のデバイス）でブラー効果が適用されない。

**【根拠】**
```tsx
// line 1389
style={{
  ...
  backgroundColor: 'rgba(0, 0, 0, 0.4)',
  backdropFilter: 'blur(2px)',   // WebkitBackdropFilter なし
  ...
}}
```

React インラインスタイルでベンダープリフィックスを加えるには `WebkitBackdropFilter: 'blur(2px)'` を別プロパティとして追加する必要がある。機能への影響はなく視覚効果のみだが、iOS 17 以前では寸法線テキストの背景ブラーが消える。

**【提案】** `WebkitBackdropFilter: 'blur(2px)'` を同 style オブジェクトに追記する。

---

### 問題 6

**【重大度】軽微**
**【場所】** `PdfExportPage.tsx:1294`
**【問題】** `_numRows || 1` のフォールバックが実際には到達不能であり、保守者が誤解する可能性がある。

**【根拠】**
```tsx
// line 1294
const _numRows = chunk.length || 1;
```

`chunk` は `photoPages` の各要素で、生成ロジック（515-518 行）が常に 3 要素にパディングしている：
```tsx
for (let i = 0; i < Math.max(activePhotos.length, 3); i += 3) {
  const chunk = activePhotos.slice(i, i + 3);
  while (chunk.length < 3) chunk.push(createEmptyPhoto(nextEmptyId()));
  pages.push(chunk);
}
```
`chunk.length` は常に `3` であり、`|| 1` のブランチには到達しない。将来 chunk サイズを変更した開発者が「`_numRows` が 1 になるケースが考慮されている」と誤解して余計なロジックを追加するリスクがある。

**【提案】** `const _numRows = 3;` と定数化するか、コメントで「chunk.length は常に 3」と明記する。

---

### 問題 7

**【重大度】軽微**
**【場所】** `PdfExportPage.tsx:1273, 1297` / `src/shared/utils.ts:45`
**【問題】** 写真行の印刷サイズ計算に使う定数 `255mm` が、`@media print` CSS が強制する実際のページ高さ `297mm` と乖離しており、プレビューと印刷の見た目に差が生じる。

**【根拠】**
```tsx
// line 1273: pdf-page の印刷 inline 高さ
height: isPrinting ? `265mm` : `${A4_HEIGHT_PX}px`

// line 1297: 写真コンテナの印刷 maxHeight 算出（265mm 前提）
const _innerH_mm = (255 / _numRows) - 4;
// 3 行の場合: 255/3 - 4 = 81mm/行
```

`src/shared/utils.ts:45` では `A4_HEIGHT_PX = 1123`（297mm × 3.78 px/mm）と定義されており、プレビューは 297mm 相当。一方 @media print の CSS（672-675 行）は：

```css
.pdf-page {
  height: 297mm !important;
  min-height: 297mm !important;
  max-height: 297mm !important;
}
```

inline `height: 265mm` は `!important` により 297mm に上書きされる。印刷時、ヘッダー（約 10mm）控除後の flex 列高は約 287mm、各行コンテナは約 96mm になるが、写真 img の `maxHeight` は 81mm のまま。結果として各行内に約 15mm の余白が生じ、説明欄エリアが伸びる。内容は欠損しないが、プレビューと印刷のレイアウトが乖離する。

**【提案】** inline `height: 265mm` を削除して CSS 側の 297mm に統一するか、`_innerH_mm` の計算基準を 297mm ベースに合わせる（ヘッダー高をマジックナンバーにせずインライン計算する）。

---

## 問題なし の観点

- **ビフォーアフター img の `objectFit: 'cover'` + `height: 100%`（line 1532）**: 親 div に明示的高さ（`65mm` / `289px`）がある。`height: 100%` の参照先が確定しており、Safari で安全。今回修正の対象外（beforeAfter は修正前から正常動作）。

- **赤丸オーバーレイの `aspect-square`（lines 1347, 1544）**: `position: absolute` の要素に適用。flex アイテムではないため Safari の Flex+aspect-ratio 問題の直撃は受けない。`width: ${size}%` も明示されており、高さ導出は Safari 14.1+ で動作する。

- **`inset-0` の使用（lines 1081, 1082, 1174, 1175, 1187）**: 全て `position: relative`（Tailwind `relative` クラスまたは inline `position: relative`）の親を基準としており、参照先が確定している。

- **appendix img の `crossOrigin` 欠如・`loading` 欠如（line 1654）**: appendix は `canvas.toDataURL()` で生成済みの `data:` URL のため CORS 不要・lazy loading も無意味。現状で正しい。

- **BeforeAfterItem の `beforeCircles` / `afterCircles`（line 1539）**: `(ph.circles ?? [])` でガード済み。型定義も `beforeCircles?: Circle[]`（optional）と整合。

- **型と実データの不整合（Photo の optional フィールド）**: `rotation`（1299 行: `Number(p.rotation) || 0`）、`dimensionLines`（1358 行: `?? []`）、`circles`（1342 行: `?? []`）、`checkItem`（1419 行: 存在チェック）、`standard`/`actual`（1439 行: 存在チェック）— 全て適切にガードされている。

- **データ消失リスク**: このページは読み取り専用（PDF 出力のみ）であり、Firestore への書き込みは一切行わない。消失リスクなし。

- **セキュリティ**: プロジェクト読み取りは ID 指定のみ。ユーザー設定読み取りは `auth.currentUser` 存在確認後に実施。Firestore ルール側の検証は本精査の対象外。

- **未使用状態・関数の残骸**: `showLegendTable`（types.ts）が PDF 出力で参照しないと 1132-1133 行にコメントで明記されており、意図的な後方互換フィールドとして適切に管理されている。大きな残骸は確認されなかった。

---

## 補足: 位置図 img が旧アプローチのまま

位置図 img（1180 行）は `width: 100%; height: 100%; objectFit: contain` という、今回修正前の photo 方式と同じアプローチを採用している。この img の直接の親（1174-1175 行）は `position: absolute; inset: 0` で、さらにその親（1169-1172 行）が **問題 1** で指摘した flex アイテム + aspectRatio のコンテナ。問題 1 を修正する際、img 側も `width: auto; height: auto; maxWidth; maxHeight` 方式へ変更することを検討すること。

