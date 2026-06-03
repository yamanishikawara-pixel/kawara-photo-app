import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget } from './budgetCalculations.js';

const baseInput = {
  kawaraShu: '三州53版和型',
  kawaraColor: '銀鱗',
  masterStdPrices: {
    '三州53版和型': {
      '瓦A': 100,
    },
  },
  masterDiscounts: {
    '三州53版和型': {
      '銀鱗': 50,
    },
  },
  hanbaKakuRate: '',
  insuranceRate: 10,
  unchinTanka: 13,
};

test('calculateBudget totals tile, material, expense, freight, and welfare costs', () => {
  const result = calculateBudget({
    ...baseInput,
    tileRows: [{ hinmei: '瓦A', suryo: 10, tani: '枚', category: '' }],
    materialRows: [{ hinmei: '資材A', suryo: 2, costPrice: 300 }],
    expenseRows: [{ hinmei: '労務A', suryo: 3, costPrice: 1000, isLabor: true }],
  });

  assert.deepEqual(result, {
    tileSub: 500,
    matSub: 600,
    expSub: 3000,
    welfareCost: 300,
    unchinTotal: 130,
    totalCost: 4530,
    totalTilePieces: 10,
  });
});

test('calculateBudget uses manual selling rate before master discount rate', () => {
  const result = calculateBudget({
    ...baseInput,
    hanbaKakuRate: 80,
    tileRows: [{ hinmei: '瓦A', suryo: 1, tani: '枚', category: '' }],
    materialRows: [],
    expenseRows: [],
  });

  assert.equal(result.tileSub, 80);
});
