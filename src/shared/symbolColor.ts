// ピン符号から一貫した色を返す共通ユーティリティ
// MapPage（編集画面）と PdfExportPage（PDF出力）で同じ色を使うために一本化
export const SYMBOL_PALETTE = [
  '#0f6e56', // 緑
  '#185fa5', // 青
  '#b45309', // 茶
  '#7c2d8a', // 紫
  '#a3185a', // 桃赤
  '#3b4f1a', // 深緑
];

export function colorForSymbol(sym: string | undefined | null): string {
  const s = (sym ?? '').trim();
  if (!s) return '#d12c2c';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) >>> 0;
  return SYMBOL_PALETTE[h % SYMBOL_PALETTE.length];
}
