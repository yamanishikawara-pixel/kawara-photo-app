# workdir: /Users/yamanishikenta/kawara-photo-app

---

## 1. 依頼の概要

3ファイルに残っている `transition-all` の一部を `transition-colors` に変更する。

`transition-all` はすべての CSS プロパティ（幅・高さ・位置・色など）にアニメーションを適用する。
色だけ変化する要素に使うと、無関係なプロパティまで監視してパフォーマンスが落ちる。
色変化だけの箇所は `transition-colors` に絞ることで効率よく動く。

MapPage.tsx では同じ修正をすでに完了済み。
今回はその残りを3ファイルにまとめて適用する。

---

## 2. 原因

`transition-all` は一括指定なので書きやすいが、
幅・高さ・transformなどのアニメーションがない要素には過剰な指定になる。
色（`color` / `background-color` / `border-color`）だけが変わる要素には `transition-colors` を使うべき。

---

## 3. 修正対象ファイル

- `src/pages/ProjectListPage.tsx`
- `src/pages/MaterialPage.tsx`
- `src/pages/SettingsPage.tsx`

**変更しない理由のある行（以下は今回触らない）:**
- ProjectListPage.tsx 64行目: ストレージバーの「幅」がアニメーションするため `transition-all` のまま
- ProjectListPage.tsx 308行目: カードの `translateY` 移動があるため `transition-all` のまま
- SettingsPage.tsx 157行目: `disabled:opacity-50` の透明度アニメーションがあるため `transition-all` のまま
- SettingsPage.tsx 185行目: ストレージバーの「幅」がアニメーションするため `transition-all` のまま

---

## 4. 各ファイルの修正内容

---

### src/pages/ProjectListPage.tsx

#### 修正1（43行目）ストレージ使用量バーのボタン
ホバー時に `borderColor` だけ変わる → `transition-colors` で十分。

```
変更前: className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all mt-4"
変更後: className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors mt-4"
```

#### 修正2（263行目）「完了済みを表示/非表示」切替ボタン
状態に応じて `borderColor` / `color` / `background` が変わるだけ → `transition-colors`。

```
変更前: className="text-xs font-bold px-3 py-1.5 rounded-full border transition-all"
変更後: className="text-xs font-bold px-3 py-1.5 rounded-full border transition-colors"
```

#### 修正3（273行目）「新規現場」ボタン
ホバー時に `background` だけ変わる → `transition-colors`。

```
変更前: className="flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl font-bold text-sm transition-all"
変更後: className="flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl font-bold text-sm transition-colors"
```

---

### src/pages/MaterialPage.tsx

#### 修正4（67行目）品名入力フィールド
フォーカス時に `borderColor` だけ変わる → `transition-colors`。

```
変更前: className="flex-1 p-3 rounded-l-lg text-sm font-bold outline-none transition-all"
変更後: className="flex-1 p-3 rounded-l-lg text-sm font-bold outline-none transition-colors"
```

#### 修正5（460行目）テキスト入力フィールド
フォーカス時に `borderColor` だけ変わる → `transition-colors`。

```
変更前: className="w-full p-2.5 rounded-lg text-sm outline-none transition-all"
変更後: className="w-full p-2.5 rounded-lg text-sm outline-none transition-colors"
```

#### 修正6（473行目）テキストエリア
フォーカス時に `borderColor` だけ変わる → `transition-colors`。

```
変更前: className="w-full p-2.5 rounded-lg text-sm outline-none transition-all resize-none"
変更後: className="w-full p-2.5 rounded-lg text-sm outline-none transition-colors resize-none"
```

#### 修正7（487行目）「材料を追加」ボタン（破線ボーダー）
ホバー時に `borderColor` と `color` だけ変わる → `transition-colors`。

```
変更前: className="w-full py-5 font-bold text-sm rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 transition-all"
変更後: className="w-full py-5 font-bold text-sm rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 transition-colors"
```

---

### src/pages/SettingsPage.tsx

#### 修正8（52行目）`inputCls` 定数
ページ内のすべての入力欄に使われている共通クラス文字列。
フォーカス時に `borderColor` だけ変わる → `transition-colors`。

```
変更前: const inputCls = "w-full p-3 rounded-xl text-sm font-bold outline-none transition-all";
変更後: const inputCls = "w-full p-3 rounded-xl text-sm font-bold outline-none transition-colors";
```

#### 修正9（432行目）`AddButton` コンポーネント内の追加ボタン（破線ボーダー）
ホバー時に `borderColor` と `color` だけ変わる → `transition-colors`。

```
変更前: className="w-full py-4 font-bold text-sm rounded-xl border-2 border-dashed flex items-center justify-center gap-2 transition-all"
変更後: className="w-full py-4 font-bold text-sm rounded-xl border-2 border-dashed flex items-center justify-center gap-2 transition-colors"
```

---

## 5. 実装手順

1. `src/pages/ProjectListPage.tsx` を開き、修正1〜3を適用する
2. `src/pages/MaterialPage.tsx` を開き、修正4〜7を適用する
3. `src/pages/SettingsPage.tsx` を開き、修正8〜9を適用する
4. 各ファイルを保存する

---

## 6. 検証手順

修正後に以下を確認する。

- [ ] ProjectListPage.tsx 43, 263, 273行目が `transition-colors` になっていること
- [ ] ProjectListPage.tsx 64, 308行目は `transition-all` のまま残っていること
- [ ] MaterialPage.tsx 67, 460, 473, 487行目が `transition-colors` になっていること
- [ ] SettingsPage.tsx 52, 432行目が `transition-colors` になっていること
- [ ] SettingsPage.tsx 157, 185行目は `transition-all` のまま残っていること

---

## 7. 実行コマンド

```bash
npm run build
```

エラーなく完了することを確認する。

---

## 8. 完了後に codex_result.md に書く内容

```markdown
# codex_result

## 変更ファイル
- src/pages/ProjectListPage.tsx（43, 263, 273行目）
- src/pages/MaterialPage.tsx（67, 460, 473, 487行目）
- src/pages/SettingsPage.tsx（52, 432行目）

## 実施した修正（9箇所）
- [x/空] ProjectListPage 修正1: 43行目 transition-all → transition-colors
- [x/空] ProjectListPage 修正2: 263行目 transition-all → transition-colors
- [x/空] ProjectListPage 修正3: 273行目 transition-all → transition-colors
- [x/空] MaterialPage 修正4: 67行目 transition-all → transition-colors
- [x/空] MaterialPage 修正5: 460行目 transition-all → transition-colors
- [x/空] MaterialPage 修正6: 473行目 transition-all → transition-colors
- [x/空] MaterialPage 修正7: 487行目 transition-all → transition-colors
- [x/空] SettingsPage 修正8: 52行目 inputCls定数 transition-all → transition-colors
- [x/空] SettingsPage 修正9: 432行目 AddButton transition-all → transition-colors

## 変更しなかった箇所（理由あり）
- ProjectListPage 64行目: 幅アニメーションのため transition-all のまま
- ProjectListPage 308行目: translateY アニメーションのため transition-all のまま
- SettingsPage 157行目: disabled:opacity のため transition-all のまま
- SettingsPage 185行目: 幅アニメーションのため transition-all のまま

## npm run build 結果
- 結果: 成功 / 失敗
- エラーログ（失敗時のみ）:
- ビルド時間:

## 備考
（気づいた点があれば記載）
```
