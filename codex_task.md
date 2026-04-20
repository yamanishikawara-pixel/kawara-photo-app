# workdir: /Users/yamanishikenta/kawara-photo-app

---

## 依頼の概要

`src/pages/PdfExportPage.tsx` の表紙（case 'cover'）を2点修正する。

1. **施工保証をPDFに追加** — CoverPage で入力できる `warrantyYears` / `warrantyStartDate` / `warrantyNote` が現状PDFに出ていない。値があるときだけ表示する。
2. **値テキストの折り返し対応** — `whiteSpace: 'nowrap', overflow: 'hidden'` で長いテキストが切れている。折り返すよう修正する。

他のファイルは一切触らない。

---

## 修正対象ファイル

- `src/pages/PdfExportPage.tsx` のみ

---

## 現状の確認

- COVER_FIELDS（24〜30行目）: 工事件名・工事場所・工期・施工業者・作成年月日の5項目
- フィールド値の style（636行目）: `whiteSpace: 'nowrap', overflow: 'hidden', fontSize: isPrinting ? '15pt' : '20px', lineHeight: 1`
- フィールド行の style（632行目）: `alignItems: 'flex-end'`

---

## 修正1: フィールド値の折り返しを有効にする（636行目）

```tsx
変更前:
                      <div style={{ flex: 1, fontFamily: JP_FONT, fontSize: isPrinting ? '15pt' : '20px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', color: '#111', lineHeight: 1 }}>{value}</div>

変更後:
                      <div style={{ flex: 1, fontFamily: JP_FONT, fontSize: isPrinting ? '12pt' : '16px', fontWeight: 'bold', wordBreak: 'break-all', color: '#111', lineHeight: 1.5 }}>{value}</div>
```

---

## 修正2: フィールド行を上揃えにする（632行目）

値が折り返したとき、ラベルが下端に揃うと不自然になる。上揃えに変更する。

```tsx
変更前:
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-end', borderBottom: '1px solid #e5e5e5', paddingBottom: isPrinting ? '3mm' : '11px' }}>

変更後:
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', borderBottom: '1px solid #e5e5e5', paddingBottom: isPrinting ? '3mm' : '11px', paddingTop: isPrinting ? '1mm' : '4px' }}>
```

---

## 修正3: 施工保証セクションをPDFに追加

フィールドリストの `</div>` 直後（`{/* フィールドリスト */}` の閉じ div の後、640行目あたり）に追加する。

```tsx
追加（640行目の `</div>` の直後）:
              {/* 施工保証セクション（値がある場合のみ表示） */}
              {(project.warrantyYears || project.warrantyStartDate || project.warrantyNote) && (
                <div style={{ width: isPrinting ? '168mm' : '635px', marginTop: isPrinting ? '8mm' : '30px' }}>
                  {/* セパレーター + ラベル */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: isPrinting ? '3mm' : '11px', marginBottom: isPrinting ? '5mm' : '19px' }}>
                    <div style={{ flex: 1, height: isPrinting ? '0.3mm' : '1px', background: '#e0e0e0' }} />
                    <div style={{ fontFamily: JP_FONT, fontSize: isPrinting ? '8pt' : '11px', fontWeight: 'bold', color: '#999', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>施工保証</div>
                    <div style={{ flex: 1, height: isPrinting ? '0.3mm' : '1px', background: '#e0e0e0' }} />
                  </div>
                  {/* 保証フィールド */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: isPrinting ? '5mm' : '19px' }}>
                    {project.warrantyYears && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', borderBottom: '1px solid #e5e5e5', paddingBottom: isPrinting ? '2mm' : '8px', paddingTop: isPrinting ? '1mm' : '4px' }}>
                        <div style={{ width: isPrinting ? '52mm' : '197px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', paddingRight: isPrinting ? '8mm' : '30px', fontFamily: JP_FONT, fontSize: isPrinting ? '10pt' : '13px', fontWeight: 'bold', color: '#777', lineHeight: 1 }}>
                          {'保証期間'.split('').map((c: string, i: number) => <span key={i}>{c}</span>)}
                        </div>
                        <div style={{ flex: 1, fontFamily: JP_FONT, fontSize: isPrinting ? '12pt' : '16px', fontWeight: 'bold', wordBreak: 'break-all', color: '#111', lineHeight: 1.5 }}>{project.warrantyYears}</div>
                      </div>
                    )}
                    {project.warrantyStartDate && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', borderBottom: '1px solid #e5e5e5', paddingBottom: isPrinting ? '2mm' : '8px', paddingTop: isPrinting ? '1mm' : '4px' }}>
                        <div style={{ width: isPrinting ? '52mm' : '197px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', paddingRight: isPrinting ? '8mm' : '30px', fontFamily: JP_FONT, fontSize: isPrinting ? '10pt' : '13px', fontWeight: 'bold', color: '#777', lineHeight: 1 }}>
                          {'保証開始日'.split('').map((c: string, i: number) => <span key={i}>{c}</span>)}
                        </div>
                        <div style={{ flex: 1, fontFamily: JP_FONT, fontSize: isPrinting ? '12pt' : '16px', fontWeight: 'bold', wordBreak: 'break-all', color: '#111', lineHeight: 1.5 }}>{project.warrantyStartDate}</div>
                      </div>
                    )}
                    {project.warrantyNote && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', borderBottom: '1px solid #e5e5e5', paddingBottom: isPrinting ? '2mm' : '8px', paddingTop: isPrinting ? '1mm' : '4px' }}>
                        <div style={{ width: isPrinting ? '52mm' : '197px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', paddingRight: isPrinting ? '8mm' : '30px', fontFamily: JP_FONT, fontSize: isPrinting ? '10pt' : '13px', fontWeight: 'bold', color: '#777', lineHeight: 1 }}>
                          {'補足事項'.split('').map((c: string, i: number) => <span key={i}>{c}</span>)}
                        </div>
                        <div style={{ flex: 1, fontFamily: JP_FONT, fontSize: isPrinting ? '12pt' : '16px', fontWeight: 'bold', wordBreak: 'break-all', color: '#111', lineHeight: 1.5 }}>{project.warrantyNote}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
```

---

## 実装手順

1. `src/pages/PdfExportPage.tsx` を開く
2. 修正1: 636行目の値テキスト div を変更（`whiteSpace: 'nowrap'` 削除、フォントサイズ縮小、`lineHeight` 変更）
3. 修正2: 632行目のフィールド行を `alignItems: 'flex-start'` に変更
4. 修正3: 640行目の直後に施工保証セクションを追加
5. それ以外の行は変更しない
6. ファイルを保存する

---

## 検証手順

- [ ] 636行目の値 div に `whiteSpace` が残っていないこと
- [ ] フォントサイズが `12pt` / `16px` になっていること
- [ ] `alignItems: 'flex-start'` に変更されていること
- [ ] 施工保証セクションが `project.warrantyYears || project.warrantyStartDate || project.warrantyNote` の条件で追加されていること
- [ ] `npm run build` が成功すること

---

## 実行コマンド

```bash
npm run build
```

---

## 完了後に codex_result.md に書く内容

```markdown
# codex_result — 表紙PDF修正

## 変更ファイル
- src/pages/PdfExportPage.tsx

## 実施した修正
- [x/空] 修正1: 値テキストの折り返し対応（whiteSpace削除・フォントサイズ縮小）
- [x/空] 修正2: フィールド行をflex-startに変更
- [x/空] 修正3: 施工保証セクションを条件付きで追加

## npm run build 結果
- 結果: 成功 / 失敗
- ビルド時間:
```
