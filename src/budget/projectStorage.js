// projectStorageKey: `cost_${slug}_${field}` 形式のキーを生成する。
// 注意: フィールド名にアンダースコアを含めないこと（slug 部とのデリミタ衝突回避のため）。
// 現 PROJECT_FIELDS は全てキャメルケースまたはアンダースコア無しで安全。
// もし将来フィールド名に "_" が必要になった場合、別のデリミタへ移行する必要がある。
export const PROJECT_FIELDS = [
  "date",
  "koujiName",
  "koujiAddress",
  "clientName",
  "dateJoto",
  "dateChakko",
  "spec",
  "kawaraShu",
  "kawaraColor",
  "hanbaKakuRate",
  "insuranceRate",
  "unchinTanka",
  "yochiArea",
  "targetGrossRate",
  "estimatePrice",
  "grossMode",
  "taxMode",
  "archived",
  "status",
  "tileRows",
  "materialRows",
  "expenseRows",
  "biko",
  "houseMakerName",
  "tileSupplier",
  "tileOrderSupplier",
  "tileOrderDate",
  "tileOrderDeliveryAddress",
  "tileOrderDeliveryDate",
  "tileOrderDeliveryTime",
  "tileOrderNote",
  "tileOrderMaterialRows",
  "tileOrderTileRows",
];

export function projectStorageKey(slug, field) {
  return `cost_${slug}_${field}`;
}

export function getProjectStorageKeys(storage, slug) {
  const validKeys = new Set(PROJECT_FIELDS.map(field => projectStorageKey(slug, field)));
  return Object.keys(storage).filter(key => validKeys.has(key));
}

export function hasProjectNameConflict(projectList, slug, currentSlug = null) {
  return projectList.some(p => p !== currentSlug && p === slug);
}

export function validateProjectSlug(slug) {
  if (!slug || !slug.trim()) return "工事名を入力してください";
  const s = slug.trim();
  if (s.includes("/") || s.includes("\\")) return "工事名にスラッシュ（/ ¥）は使えません";
  if (s === "." || s === "..") return "工事名に「.」「..」は使えません";
  if (/^__.*__$/.test(s)) return "工事名の先頭末尾の二重アンダースコアは予約されています";
  if (s.length > 100) return "工事名は100文字以下にしてください";
  return null;
}
