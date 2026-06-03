export const TSUBO_RATE = 3.305785;

export function calcTileRowCost({ row, kawaraShu, kawaraColor, hanbaKakuRate, masterStdPrices, masterDiscounts }) {
  const stdPrice = (row.unitPrice !== "" && row.unitPrice !== undefined && row.unitPrice !== null)
    ? Number(row.unitPrice)
    : (masterStdPrices[kawaraShu]?.[row.hinmei] || 0);
  const rate = (row.unitRate !== "" && row.unitRate !== undefined && row.unitRate !== null)
    ? Number(row.unitRate)
    : (hanbaKakuRate !== "" && hanbaKakuRate !== undefined)
      ? Number(hanbaKakuRate)
      : calcDiscountRate(masterDiscounts, kawaraShu, row.category, row.hinmei, kawaraColor);
  const costPrice = Math.ceil(stdPrice * (rate / 100));
  const rowTotal = Math.ceil(costPrice * (Number(row.suryo) || 0));
  return { stdPrice, rate, costPrice, rowTotal };
}

export function calcDiscountRate(masterDiscounts, kawaraShu, category, hinmei, color) {
  let rateGroup = kawaraShu;
  if (kawaraShu === "三州53版和型") {
    if (category === "鬼瓦") rateGroup = "一般鬼";
  }
  return masterDiscounts[rateGroup]?.[color] ?? masterDiscounts[kawaraShu]?.[color] ?? 0;
}
