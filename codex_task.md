# workdir: /Users/yamanishikenta/kawara-photo-app

`src/pages/HomePage.tsx` を以下の3点に従って修正してください。
修正完了後に `npm run build` を実行し、結果を `codex_result.md` に記録してください。

---

## 対象ファイル: src/pages/HomePage.tsx

---

### 修正1: マウスイベントをポインターイベントに置き換え（タッチ残留バグの解消）

`onMouseEnter` / `onMouseLeave` はタッチデバイスでタップ後にホバースタイルが残留する。
`onPointerEnter` / `onPointerLeave` に統一することでマウス・タッチ両対応になる。

**現状（メニューボタン）:**
```tsx
onMouseEnter={e => {
  const el = e.currentTarget;
  el.style.borderColor = item.accent;
  el.style.background = '#21213a';
}}
onMouseLeave={e => {
  const el = e.currentTarget;
  el.style.borderColor = '#2e2e50';
  el.style.background = '#1c1c30';
}}
```

**修正後:**
```tsx
onPointerEnter={e => {
  const el = e.currentTarget;
  el.style.borderColor = item.accent;
  el.style.background = '#21213a';
}}
onPointerLeave={e => {
  const el = e.currentTarget;
  el.style.borderColor = '#2e2e50';
  el.style.background = '#1c1c30';
}}
```

同様に、ヘッダーの「現場一覧」ボタンも置き換える:

```tsx
// 現状
onMouseEnter={e => (e.currentTarget.style.color = '#ff6b35')}
onMouseLeave={e => (e.currentTarget.style.color = '#8b8ba8')}

// 修正後
onPointerEnter={e => (e.currentTarget.style.color = '#ff6b35')}
onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
```

---

### 修正2: サムネイル img の冗長クラスを削除

`absolute inset-0` が付いている場合、`w-full h-full` は不要。

**現状:**
```tsx
<img src={thumb} alt="現場写真" className="absolute inset-0 w-full h-full object-cover" />
```

**修正後:**
```tsx
<img src={thumb} alt="現場写真" className="absolute inset-0 object-cover w-full h-full" />
```

※ クラス順を `position → size → display` の順に整理する（機能変更なし・可読性向上）。

---

### 修正3: モバイルのグリッド gap を gap-2 → gap-3 に調整

`gap-2`（8px）はタップターゲット間が狭くなりすぎる。
`gap-3`（12px）に広げて指が当たりやすくする。

**現状:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
```

**修正後:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
```

---

## 実行手順

1. 上記3点を `src/pages/HomePage.tsx` に適用する
2. `npm run build` を実行する
3. 以下のフォーマットで `codex_result.md` を上書き保存する

```markdown
# codex_result

## 実施した修正
- [x/空] 修正1: onMouseEnter → onPointerEnter（ヘッダー・メニュー両方）
- [x/空] 修正2: img の冗長クラス整理
- [x/空] 修正3: gap-2 → gap-3

## npm run build
- 結果: 成功 / 失敗
- エラーログ（失敗時のみ）:
- ビルド時間:

## 備考
```
