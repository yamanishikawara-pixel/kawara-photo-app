import { calcTileRowCost } from './calcUtils.js';

export function calculateBudget({
  tileRows,
  materialRows,
  expenseRows,
  masterStdPrices,
  masterDiscounts,
  kawaraShu,
  kawaraColor,
  hanbaKakuRate,
  insuranceRate,
  unchinTanka,
}) {
  let tileSub = 0, matSub = 0, expSub = 0, laborTargetTotal = 0, totalTilePieces = 0;

  tileRows.forEach(row => {
    if (!row.hinmei || !row.suryo) return;
    const { rowTotal } = calcTileRowCost({ row, kawaraShu, kawaraColor, hanbaKakuRate, masterStdPrices, masterDiscounts });
    tileSub += rowTotal;
    if (row.tani === "枚") totalTilePieces += Number(row.suryo) || 0;
  });

  materialRows.forEach(row => {
    const suryo = Number(row.suryo) || 0;
    if (!row.hinmei || suryo === 0) return;
    matSub += Math.ceil((Number(row.costPrice) || 0) * suryo);
  });

  expenseRows.forEach(row => {
    const suryo = Number(row.suryo) || 0;
    if (!row.hinmei || suryo === 0) return;
    const rowCost = Math.ceil((Number(row.costPrice) || 0) * suryo);
    expSub += rowCost;
    if (row.isLabor) laborTargetTotal += rowCost;
  });

  const unchinTotal = Math.ceil(totalTilePieces * (Number(unchinTanka) || 0));
  const welfareCost = Math.ceil(laborTargetTotal * (Number(insuranceRate) / 100));
  const totalCost = tileSub + matSub + expSub + welfareCost + unchinTotal;

  return { totalCost, tileSub, matSub, expSub, welfareCost, unchinTotal, totalTilePieces };
}

export function calcTaxBreakdown({ estimatePrice, taxMode, taxRate }) {
  const ep = Number(estimatePrice) || 0;
  const rate = Number(taxRate) || 0;
  if (ep <= 0 || rate <= 0) return { exclusive: ep, tax: 0, inclusive: ep };
  if (taxMode === "inclusive") {
    const exclusive = Math.floor(ep / (1 + rate / 100));
    return { exclusive, tax: ep - exclusive, inclusive: ep };
  }
  const tax = Math.ceil(ep * rate / 100);
  return { exclusive: ep, tax, inclusive: ep + tax };
}

export function calcRateMetrics({ totalCost, tileSub, matSub, expSub, welfareCost, unchinTotal, estimatePrice }) {
  const ep = Number(estimatePrice) || 0;
  const grossRate = ep > 0 ? (ep - totalCost) / ep * 100 : 0;
  const tileRate  = totalCost > 0 ? tileSub      / totalCost * 100 : 0;
  const matRate   = totalCost > 0 ? matSub       / totalCost * 100 : 0;
  const expRate   = totalCost > 0 ? expSub       / totalCost * 100 : 0;
  const welRate   = totalCost > 0 ? welfareCost  / totalCost * 100 : 0;
  const unchinRate= totalCost > 0 ? unchinTotal  / totalCost * 100 : 0;
  return { grossRate, tileRate, matRate, expRate, welRate, unchinRate };
}
