# workdir: /Users/yamanishikenta/kawara-photo-app

## 概要

タスク1（ConfirmModal.tsx）・タスク2（ErrorMessage.tsx）は完了済み。
残るタスク3〜12をこの指示書に従って順番に修正する。

修正の種類は1つだけ：
**`onMouseEnter` / `onMouseLeave` → `onPointerEnter` / `onPointerLeave` に置き換える**

加えて MapPage.tsx の `transition-all` → `transition-colors` 置き換えも行う。

ロジック・レイアウト・Firestore処理・画像処理には一切触れないこと。
各ファイルの修正後は最後にまとめて `npm run build` を1回実行する。

---

## タスク3: src/pages/LoginPage.tsx

`onMouseEnter` / `onMouseLeave` が5カ所ある。すべて `onPointerEnter` / `onPointerLeave` に置き換える。

### 修正1（170〜173行目）送信ボタン
```
変更前: onMouseEnter={(e) => {
          if (!loading) e.currentTarget.style.background = '#e85d2a';
        }}
        onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT)}

変更後: onPointerEnter={(e) => {
          if (!loading) e.currentTarget.style.background = '#e85d2a';
        }}
        onPointerLeave={(e) => (e.currentTarget.style.background = ACCENT)}
```

### 修正2（198〜199行目）ログイン↔登録切替ボタン
```
変更前: onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)}
        onMouseLeave={(e) => (e.currentTarget.style.color = TEXT_MUTED)}

変更後: onPointerEnter={(e) => (e.currentTarget.style.color = ACCENT)}
        onPointerLeave={(e) => (e.currentTarget.style.color = TEXT_MUTED)}
```

### 修正3（213〜214行目）パスワードをお忘れの方ボタン
```
変更前: onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)}
        onMouseLeave={(e) => (e.currentTarget.style.color = TEXT_DIM)}

変更後: onPointerEnter={(e) => (e.currentTarget.style.color = ACCENT)}
        onPointerLeave={(e) => (e.currentTarget.style.color = TEXT_DIM)}
```

### 修正4（268〜271行目）パスワードリセット送信ボタン
```
変更前: onMouseEnter={(e) => {
          if (!resetLoading) e.currentTarget.style.background = '#e85d2a';
        }}
        onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT)}

変更後: onPointerEnter={(e) => {
          if (!resetLoading) e.currentTarget.style.background = '#e85d2a';
        }}
        onPointerLeave={(e) => (e.currentTarget.style.background = ACCENT)}
```

### 修正5（281〜282行目）パスワードリセットキャンセルボタン
```
変更前: onMouseEnter={(e) => (e.currentTarget.style.color = TEXT_MUTED)}
        onMouseLeave={(e) => (e.currentTarget.style.color = TEXT_DIM)}

変更後: onPointerEnter={(e) => (e.currentTarget.style.color = TEXT_MUTED)}
        onPointerLeave={(e) => (e.currentTarget.style.color = TEXT_DIM)}
```

---

## タスク4: src/pages/ProjectListPage.tsx

`onMouseEnter` / `onMouseLeave` が7カ所ある。すべて `onPointerEnter` / `onPointerLeave` に置き換える。

### 修正1（45〜50行目）StorageUsageBar ボタン
```
変更前: onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = barColor;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e50';
        }}

変更後: onPointerEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = barColor;
        }}
        onPointerLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e50';
        }}
```

### 修正2（228〜229行目）設定ボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#ff6b35')}
        onMouseLeave={e => (e.currentTarget.style.color = '#8b8ba8')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#ff6b35')}
        onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
```

### 修正3（233〜234行目）ログアウトボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#f0ede8')}
        onMouseLeave={e => (e.currentTarget.style.color = '#8b8ba8')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')}
        onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
```

### 修正4（275〜276行目）新規現場ボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.background = '#e85d2a')}
        onMouseLeave={e => (e.currentTarget.style.background = '#ff6b35')}

変更後: onPointerEnter={e => (e.currentTarget.style.background = '#e85d2a')}
        onPointerLeave={e => (e.currentTarget.style.background = '#ff6b35')}
```

### 修正5（314〜323行目）プロジェクトカード
```
変更前: onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = '#ff6b35';
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 24px rgba(255,107,53,0.15)';
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = p.isCompleted ? '#1e4035' : '#2e2e50';
          (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        }}

変更後: onPointerEnter={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = '#ff6b35';
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 24px rgba(255,107,53,0.15)';
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
        }}
        onPointerLeave={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = p.isCompleted ? '#1e4035' : '#2e2e50';
          (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        }}
```

### 修正6（363〜364行目）完了チェックボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#10b981')}
        onMouseLeave={e => (e.currentTarget.style.color = p.isCompleted ? '#10b981' : '#3d3d60')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#10b981')}
        onPointerLeave={e => (e.currentTarget.style.color = p.isCompleted ? '#10b981' : '#3d3d60')}
```

### 修正7（374〜375行目）削除ボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = '#3d3d60')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}
```

---

## タスク5: src/pages/PhotoPage.tsx

`onMouseEnter` / `onMouseLeave` が15カ所ある。すべて `onPointerEnter` / `onPointerLeave` に置き換える。
ファイル内の `onMouseEnter` を全件 `onPointerEnter` に、`onMouseLeave` を全件 `onPointerLeave` に一括置換して構わない。

確認：PhotoPage.tsx 内の onMouseEnter / onMouseLeave はホバー演出のみで使われている。
onClick など他のイベントハンドラには触れないこと。

---

## タスク6: src/pages/MaterialPage.tsx

`onMouseEnter` / `onMouseLeave` が10カ所ある。すべて `onPointerEnter` / `onPointerLeave` に置き換える。
ファイル内の `onMouseEnter` を全件 `onPointerEnter` に、`onMouseLeave` を全件 `onPointerLeave` に一括置換して構わない。

確認：MaterialPage.tsx 内の onMouseEnter / onMouseLeave はホバー演出のみで使われている。
onClick など他のイベントハンドラには触れないこと。

---

## タスク7: src/pages/CoverPage.tsx

`onMouseEnter` / `onMouseLeave` が3カ所ある。すべて `onPointerEnter` / `onPointerLeave` に置き換える。

### 修正1（142〜143行目）もどるボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = ACCENT)}
        onMouseLeave={e => (e.currentTarget.style.color = '#8b8ba8')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = ACCENT)}
        onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
```

### 修正2（264〜265行目）添付PDF削除ボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onPointerLeave={e => (e.currentTarget.style.color = '#6b7280')}
```

### 修正3（277〜282行目）PDF選択ボタン
```
変更前: onMouseEnter={e => {
          e.currentTarget.style.borderColor = ACCENT;
          e.currentTarget.style.color = ACCENT;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = '#2e2e50';
          e.currentTarget.style.color = '#6b7280';
        }}

変更後: onPointerEnter={e => {
          e.currentTarget.style.borderColor = ACCENT;
          e.currentTarget.style.color = ACCENT;
        }}
        onPointerLeave={e => {
          e.currentTarget.style.borderColor = '#2e2e50';
          e.currentTarget.style.color = '#6b7280';
        }}
```

---

## タスク8: src/pages/BeforeAfterPage.tsx

`onMouseEnter` / `onMouseLeave` が3カ所ある。すべて `onPointerEnter` / `onPointerLeave` に置き換える。

### 修正1（155〜156行目）もどるボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = ACCENT)}
        onMouseLeave={e => (e.currentTarget.style.color = '#8b8ba8')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = ACCENT)}
        onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
```

### 修正2（180〜181行目）ペア追加ボタン
```
変更前: onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#2e2e50'; e.currentTarget.style.color = '#6b7280'; }}

変更後: onPointerEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
        onPointerLeave={e => { e.currentTarget.style.borderColor = '#2e2e50'; e.currentTarget.style.color = '#6b7280'; }}
```

### 修正3（231〜232行目）ペア削除ボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = '#4b4b70')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onPointerLeave={e => (e.currentTarget.style.color = '#4b4b70')}
```

---

## タスク9: src/pages/SettingsPage.tsx

`onMouseEnter` / `onMouseLeave` が8カ所ある。すべて `onPointerEnter` / `onPointerLeave` に置き換える。

### 修正1（149〜150行目）ホームへボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#ff6b35')}
        onMouseLeave={e => (e.currentTarget.style.color = '#8b8ba8')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#ff6b35')}
        onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
```

### 修正2（159〜160行目）設定を保存ボタン
```
変更前: onMouseEnter={e => !saving && ((e.currentTarget as HTMLButtonElement).style.background = '#e85d2a')}
        onMouseLeave={e => !saving && ((e.currentTarget as HTMLButtonElement).style.background = '#ff6b35')}

変更後: onPointerEnter={e => !saving && ((e.currentTarget as HTMLButtonElement).style.background = '#e85d2a')}
        onPointerLeave={e => !saving && ((e.currentTarget as HTMLButtonElement).style.background = '#ff6b35')}
```

### 修正3（213行目）ロゴアップロードラベル
```
変更前: onMouseEnter={e => (e.currentTarget.style.borderColor = '#ff6b35')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = '#3d3d60')}

変更後: onPointerEnter={e => (e.currentTarget.style.borderColor = '#ff6b35')}
        onPointerLeave={e => (e.currentTarget.style.borderColor = '#3d3d60')}
```

### 修正4（274〜275行目）工程削除ボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = '#3d3d60')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}
```

### 修正5（323〜324行目）テンプレート削除ボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = '#3d3d60')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}
```

### 修正6（365〜366行目）材料削除ボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = '#3d3d60')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}
```

### 修正7（413〜414行目）定型文削除ボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = '#3d3d60')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}
```

### 修正8（434〜435行目）AddButton関数内の追加ボタン
```
変更前: onMouseEnter={e => { (e.currentTarget.style.borderColor = accent); (e.currentTarget.style.color = accent); }}
        onMouseLeave={e => { (e.currentTarget.style.borderColor = '#2e2e50'); (e.currentTarget.style.color = '#8b8ba8'); }}

変更後: onPointerEnter={e => { (e.currentTarget.style.borderColor = accent); (e.currentTarget.style.color = accent); }}
        onPointerLeave={e => { (e.currentTarget.style.borderColor = '#2e2e50'); (e.currentTarget.style.color = '#8b8ba8'); }}
```

---

## タスク10: src/pages/ShareViewPage.tsx

`onMouseEnter` / `onMouseLeave` が1カ所ある。

### 修正1（95〜96行目）編集に戻るボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.background = `${ACCENT}22`)}
        onMouseLeave={e => (e.currentTarget.style.background = `${ACCENT}12`)}

変更後: onPointerEnter={e => (e.currentTarget.style.background = `${ACCENT}22`)}
        onPointerLeave={e => (e.currentTarget.style.background = `${ACCENT}12`)}
```

---

## タスク11: src/pages/MapPage.tsx（onMouseEnter/Leave の置き換え）

`onMouseEnter` / `onMouseLeave` が9カ所ある。すべて `onPointerEnter` / `onPointerLeave` に置き換える。

### 修正1（513〜514行目）テーブル行ホバー
```
変更前: onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}

変更後: onPointerEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}
        onPointerLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
```

### 修正2（520行目）行削除ボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#3d3d60')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')} onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}
```

### 修正3（1132〜1133行目）もどるボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#ff6b35')}
        onMouseLeave={e => (e.currentTarget.style.color = '#8b8ba8')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#ff6b35')}
        onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
```

### 修正4（1168行目）図面削除ボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#3d3d60')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#ef4444')} onPointerLeave={e => (e.currentTarget.style.color = '#3d3d60')}
```

### 修正5（1226行目）左回転ボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#f0ede8')} onMouseLeave={e => (e.currentTarget.style.color = '#8b8ba8')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')} onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
```

### 修正6（1227行目）右回転ボタン
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#f0ede8')} onMouseLeave={e => (e.currentTarget.style.color = '#8b8ba8')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')} onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
```

### 修正7（1228行目）差し替えラベル
```
変更前: onMouseEnter={e => (e.currentTarget.style.color = '#f0ede8')} onMouseLeave={e => (e.currentTarget.style.color = '#8b8ba8')}

変更後: onPointerEnter={e => (e.currentTarget.style.color = '#f0ede8')} onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
```

### 修正8（1345行目）図面アップロードラベル
```
変更前: onMouseEnter={e => (e.currentTarget.style.borderColor = '#3b82f6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#3d3d60')}

変更後: onPointerEnter={e => (e.currentTarget.style.borderColor = '#3b82f6')} onPointerLeave={e => (e.currentTarget.style.borderColor = '#3d3d60')}
```

---

## タスク12: src/pages/MapPage.tsx（transition-all → transition-colors）

MapPage.tsx 内の `transition-all` のうち、**色変化のみ**に使われている箇所を `transition-colors` に変える。
`active:scale-*` や `scale()` など拡縮アニメーションと一緒に使われている箇所は変えない。

### 変更する箇所（色変化のみ・拡縮なし）

- 428行目: タグボタン群 `className="... transition-all"` → `transition-colors`
- 1113行目: 回転角度選択ボタン `className="... transition-all"` → `transition-colors`
- 1118行目: 完了ボタン `className="... transition-all"` → `transition-colors`
- 1155〜1158行目: 描画モード切替ボタン（pan/pin/dimension/whiteout）各 `transition-all` → `transition-colors`
- 1167行目: 図面タブボタン `transition-all` → `transition-colors`
- 1171行目: 図面追加ラベル `transition-all` → `transition-colors`

### 変更しない箇所（拡縮あり・そのまま）

- 26行目: ToolButton（active:scale-90 あり）
- 303〜304行目: 削除・完了ボタン（active:scale-95 あり）
- 433行目: ✓完了ボタン
- 493行目: ピン要素（duration-75・scale あり）
- 1103行目: タイトル入力欄
- 1185行目: カラーパレットボタン（scale あり）
- 1187行目: 自由色ラベル（hover:scale-105 あり）
- 1251行目: マップdiv（ring アニメーションあり）

---

## 実行コマンド

すべての修正が完了したら、以下を1回実行する：

```bash
npm run build
```

---

## 完了後に codex_result.md に書く内容

```markdown
# codex_result — タスク3〜12

## 変更ファイル一覧
- src/pages/LoginPage.tsx
- src/pages/ProjectListPage.tsx
- src/pages/PhotoPage.tsx
- src/pages/MaterialPage.tsx
- src/pages/CoverPage.tsx
- src/pages/BeforeAfterPage.tsx
- src/pages/SettingsPage.tsx
- src/pages/ShareViewPage.tsx
- src/pages/MapPage.tsx（onMouseEnter/Leave × 8）
- src/pages/MapPage.tsx（transition-all → transition-colors × 8）

## タスク別完了状況
- [x/空] タスク3: LoginPage.tsx（5カ所）
- [x/空] タスク4: ProjectListPage.tsx（7カ所）
- [x/空] タスク5: PhotoPage.tsx（15カ所）
- [x/空] タスク6: MaterialPage.tsx（10カ所）
- [x/空] タスク7: CoverPage.tsx（3カ所）
- [x/空] タスク8: BeforeAfterPage.tsx（3カ所）
- [x/空] タスク9: SettingsPage.tsx（8カ所）
- [x/空] タスク10: ShareViewPage.tsx（1カ所）
- [x/空] タスク11: MapPage.tsx onPointer置換（8カ所）
- [x/空] タスク12: MapPage.tsx transition-colors（8カ所）

## npm run build 結果
- 結果: 成功 / 失敗
- エラーログ（失敗時のみ）:
- ビルド時間:

## 備考
```
