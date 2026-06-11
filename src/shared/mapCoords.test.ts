import { describe, it, expect } from 'vitest';
import {
  LEGACY_MAP_ASPECT,
  resolveMapAspect,
  isLegacyMapCoord,
  convertCoordLegacyToNatural,
  migrateMapToImageAspect,
  removeMapAtIndex,
  applyReplacedMapPages,
  resetReplacedMapAspect,
} from './mapCoords';
import type { Project } from '../types';

// ── resolveMapAspect ─────────────────────────────────────────
describe('resolveMapAspect', () => {
  it('returns LEGACY_MAP_ASPECT when aspects is undefined', () => {
    expect(resolveMapAspect(undefined, 0)).toBeCloseTo(LEGACY_MAP_ASPECT);
  });

  it('returns LEGACY_MAP_ASPECT when index is out of bounds', () => {
    expect(resolveMapAspect([1.5], 5)).toBeCloseTo(LEGACY_MAP_ASPECT);
  });

  it('returns stored aspect when valid', () => {
    expect(resolveMapAspect([1.333], 0)).toBeCloseTo(1.333);
  });

  it('returns LEGACY_MAP_ASPECT for 0 (invalid)', () => {
    expect(resolveMapAspect([0], 0)).toBeCloseTo(LEGACY_MAP_ASPECT);
  });

  it('returns LEGACY_MAP_ASPECT for negative (invalid)', () => {
    expect(resolveMapAspect([-1], 0)).toBeCloseTo(LEGACY_MAP_ASPECT);
  });

  it('returns LEGACY_MAP_ASPECT for NaN (invalid)', () => {
    expect(resolveMapAspect([NaN], 0)).toBeCloseTo(LEGACY_MAP_ASPECT);
  });
});

// ── isLegacyMapCoord ─────────────────────────────────────────
describe('isLegacyMapCoord', () => {
  it('returns true when aspects is undefined', () => {
    expect(isLegacyMapCoord(undefined, 0)).toBe(true);
  });

  it('returns true when index has no valid aspect', () => {
    expect(isLegacyMapCoord([], 0)).toBe(true);
  });

  it('returns false when valid aspect is stored', () => {
    expect(isLegacyMapCoord([1.5], 0)).toBe(false);
  });

  it('returns true for 0 (invalid)', () => {
    expect(isLegacyMapCoord([0], 0)).toBe(true);
  });

  it('returns true for NaN (invalid)', () => {
    expect(isLegacyMapCoord([NaN], 0)).toBe(true);
  });
});

// ── convertCoordLegacyToNatural ──────────────────────────────
describe('convertCoordLegacyToNatural', () => {
  it('same aspect → no change', () => {
    const r = convertCoordLegacyToNatural(50, 50, LEGACY_MAP_ASPECT);
    expect(r.x).toBeCloseTo(50);
    expect(r.y).toBeCloseTo(50);
  });

  it('square image (1:1) center stays at 50,50', () => {
    const r = convertCoordLegacyToNatural(50, 50, 1);
    expect(r.x).toBeCloseTo(50);
    expect(r.y).toBeCloseTo(50);
  });

  it('wider-than-legacy image → y changes, x unchanged', () => {
    // 4:1 横長画像（旧より横長）→ 上下にletterbox
    // 中心(50%)は変換後も50%。非中心座標で検証
    const r = convertCoordLegacyToNatural(30, 30, 4);
    expect(r.x).toBeCloseTo(30); // x はそのまま
    expect(r.y).not.toBeCloseTo(30); // y は変換される（中心以外は変わる）
  });

  it('taller-than-legacy image → x changes, y unchanged', () => {
    // 1:2 縦長画像（旧より縦長）→ 左右にpillarbox
    // 中心(50%)は変換後も50%。非中心座標で検証
    const r = convertCoordLegacyToNatural(40, 30, 0.5);
    expect(r.x).not.toBeCloseTo(40); // x は変換される（中心以外は変わる）
    expect(r.y).toBeCloseTo(30); // y はそのまま
  });

  it('clamps result to 0-100 range', () => {
    // 座標が余白領域にある場合はクランプ
    const r = convertCoordLegacyToNatural(0, 0, 0.5);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });
});

// ── migrateMapToImageAspect ──────────────────────────────────
describe('migrateMapToImageAspect', () => {
  const baseProject: Project = {
    projectName: 'test', projectLocation: '', constructionPeriod: '',
    contractorName: '', creationDate: '',
    photos: [], mapUrls: ['https://example.com/map.jpg'],
    mapPins: [{ id: 1, x: 50, y: 50, label: 'A', type: 'circle', size: 1, rotation: 0, mapIndex: 0 }],
    mapRows: [],
    mapDimensionLines: [{ id: 1, start: { x: 10, y: 10 }, end: { x: 90, y: 90 }, text: '10m', mapIndex: 0 }],
    whiteoutBoxes: [{ id: 1, x: 20, y: 20, width: 10, height: 10, mapIndex: 0 }],
  };

  it('sets mapImageAspects[0] to the given aspect', () => {
    const result = migrateMapToImageAspect(baseProject, 0, 1.5);
    expect(result.mapImageAspects[0]).toBeCloseTo(1.5);
  });

  it('does not affect pins of other mapIndex', () => {
    const proj = {
      ...baseProject,
      mapPins: [
        { id: 1, x: 50, y: 50, label: 'A', type: 'circle' as const, size: 1, rotation: 0, mapIndex: 0 },
        { id: 2, x: 30, y: 30, label: 'B', type: 'circle' as const, size: 1, rotation: 0, mapIndex: 1 },
      ],
    };
    const result = migrateMapToImageAspect(proj, 0, 1.5);
    const pin1 = result.mapPins.find(p => p.id === 2);
    expect(pin1?.x).toBeCloseTo(30);
    expect(pin1?.y).toBeCloseTo(30);
  });

  it('same aspect as legacy → coords stay nearly the same', () => {
    const result = migrateMapToImageAspect(baseProject, 0, LEGACY_MAP_ASPECT);
    const pin = result.mapPins[0];
    expect(pin.x).toBeCloseTo(50, 1);
    expect(pin.y).toBeCloseTo(50, 1);
  });

  it('invalid aspect (0) → returns unchanged data, mapImageAspects NOT set', () => {
    const result = migrateMapToImageAspect(baseProject, 0, 0);
    // 0 は不正値 → 何も変換せず元のデータをそのまま返す
    expect(result.mapImageAspects[0]).toBeUndefined();
    expect(result.mapPins[0].x).toBeCloseTo(50); // 変換されていない
  });

  it('invalid aspect (NaN) → returns unchanged data', () => {
    const result = migrateMapToImageAspect(baseProject, 0, NaN);
    expect(result.mapImageAspects[0]).toBeUndefined();
  });

  it('invalid aspect (negative) → returns unchanged data', () => {
    const result = migrateMapToImageAspect(baseProject, 0, -1);
    expect(result.mapImageAspects[0]).toBeUndefined();
  });
});

// ── removeMapAtIndex ─────────────────────────────────────────
describe('removeMapAtIndex', () => {
  const data = {
    mapUrls: ['https://example.com/0.jpg', 'https://example.com/1.jpg', 'https://example.com/2.jpg'],
    mapRotations: [0, 90, 180],
    mapTransforms: [
      { scale: 1, x: 0, y: 0 },
      { scale: 1.2, x: 1, y: 1 },
      { scale: 1.5, x: 2, y: 2 },
    ],
    mapLayouts: [{ title: '図1' }, { title: '図2' }, { title: '図3' }],
    mapImageAspects: [1.5, 1.6, 1.7],
    mapPins: [
      { id: 1, mapIndex: 0, x: 10, y: 10, label: 'A', type: 'circle' as const, size: 1, rotation: 0 },
      { id: 2, mapIndex: 1, x: 20, y: 20, label: 'B', type: 'circle' as const, size: 1, rotation: 0 },
      { id: 3, mapIndex: 2, x: 30, y: 30, label: 'C', type: 'circle' as const, size: 1, rotation: 0 },
    ],
    mapRows: [
      { id: 1, mapIndex: 0, symbol: 'A', part: '', photoNo: '' },
      { id: 2, mapIndex: 1, symbol: 'B', part: '', photoNo: '' },
      { id: 3, mapIndex: 2, symbol: 'C', part: '', photoNo: '' },
    ],
    mapDimensionLines: [
      { id: 1, mapIndex: 0, start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, text: '1m' },
      { id: 2, mapIndex: 1, start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, text: '2m' },
      { id: 3, mapIndex: 2, start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, text: '3m' },
    ],
    whiteoutBoxes: [
      { id: 1, mapIndex: 0, x: 5, y: 5, width: 1, height: 1 },
      { id: 2, mapIndex: 1, x: 6, y: 6, width: 1, height: 1 },
      { id: 3, mapIndex: 2, x: 7, y: 7, width: 1, height: 1 },
    ],
    mapLines: [
      { id: 1, mapIndex: 0, x: 1, y: 1, length: 10, thickness: 1, color: '#000', rotation: 0 },
      { id: 2, mapIndex: 1, x: 2, y: 2, length: 20, thickness: 1, color: '#000', rotation: 0 },
      { id: 3, mapIndex: 2, x: 3, y: 3, length: 30, thickness: 1, color: '#000', rotation: 0 },
    ],
  };

  it('地図3枚 → 2枚目(index1)を削除すると平行配列からindex1が除去される', () => {
    const result = removeMapAtIndex(data, 1);
    expect(result.mapUrls).toEqual(['https://example.com/0.jpg', 'https://example.com/2.jpg']);
    expect(result.mapRotations).toEqual([0, 180]);
    expect(result.mapTransforms).toEqual([
      { scale: 1, x: 0, y: 0 },
      { scale: 1.5, x: 2, y: 2 },
    ]);
    expect(result.mapLayouts).toEqual([{ title: '図1' }, { title: '図3' }]);
    expect(result.mapImageAspects).toEqual([1.5, 1.7]);
  });

  it('削除した地図 (index1) に属するオーバーレイは削除される', () => {
    const result = removeMapAtIndex(data, 1);
    expect(result.mapPins.find(p => p.id === 2)).toBeUndefined();
    expect(result.mapRows.find(r => r.id === 2)).toBeUndefined();
    expect(result.mapDimensionLines.find(l => l.id === 2)).toBeUndefined();
    expect(result.whiteoutBoxes.find(b => b.id === 2)).toBeUndefined();
    expect(result.mapLines.find(l => l.id === 2)).toBeUndefined();
  });

  it('旧index2(3枚目)のオーバーレイは新index1に振り直され、内容は維持される', () => {
    const result = removeMapAtIndex(data, 1);

    const pin = result.mapPins.find(p => p.id === 3);
    expect(pin?.mapIndex).toBe(1);
    expect(pin?.x).toBe(30);
    expect(pin?.y).toBe(30);

    const row = result.mapRows.find(r => r.id === 3);
    expect(row?.mapIndex).toBe(1);

    const dim = result.mapDimensionLines.find(l => l.id === 3);
    expect(dim?.mapIndex).toBe(1);
    expect(dim?.text).toBe('3m');

    const box = result.whiteoutBoxes.find(b => b.id === 3);
    expect(box?.mapIndex).toBe(1);

    const line = result.mapLines.find(l => l.id === 3);
    expect(line?.mapIndex).toBe(1);
    expect(line?.length).toBe(30);
  });

  it('旧index0(1枚目)のオーバーレイは変化しない', () => {
    const result = removeMapAtIndex(data, 1);
    expect(result.mapPins.find(p => p.id === 1)?.mapIndex).toBe(0);
    expect(result.mapRows.find(r => r.id === 1)?.mapIndex).toBe(0);
    expect(result.mapDimensionLines.find(l => l.id === 1)?.mapIndex).toBe(0);
    expect(result.whiteoutBoxes.find(b => b.id === 1)?.mapIndex).toBe(0);
    expect(result.mapLines.find(l => l.id === 1)?.mapIndex).toBe(0);
  });

  it('mapIndex 未指定の要素は index0 として扱われる', () => {
    const result = removeMapAtIndex({
      mapUrls: ['a', 'b'],
      whiteoutBoxes: [{ id: 99, x: 1, y: 1, width: 1, height: 1 }],
    }, 1);
    expect(result.whiteoutBoxes).toHaveLength(1);
    expect(result.whiteoutBoxes[0].mapIndex).toBe(0);
  });
});

// ── applyReplacedMapPages ────────────────────────────────────
describe('applyReplacedMapPages', () => {
  it('1ページ目は currentMapIndex を置換し、2ページ目以降は末尾に追加する', () => {
    const mapUrls = ['old0', 'old1', 'old2'];
    const mapLayouts = [{ title: '図1' }, { title: '図2' }, { title: '図3' }];
    const result = applyReplacedMapPages(mapUrls, mapLayouts, 1, ['new1-p1', 'new1-p2', 'new1-p3']);

    expect(result.mapUrls).toEqual(['old0', 'new1-p1', 'old2', 'new1-p2', 'new1-p3']);
    // 既存の他地図 (index0, 旧index2) の位置はズレない
    expect(result.mapUrls[0]).toBe('old0');
    expect(result.mapUrls[2]).toBe('old2');
    expect(result.mapLayouts).toHaveLength(5);
  });

  it('単ページの置換は1:1で置換のみ行う(配列長は変わらない)', () => {
    const mapUrls = ['old0', 'old1'];
    const mapLayouts = [{ title: '図1' }, { title: '図2' }];
    const result = applyReplacedMapPages(mapUrls, mapLayouts, 0, ['new0']);
    expect(result.mapUrls).toEqual(['new0', 'old1']);
    expect(result.mapLayouts).toEqual(mapLayouts);
  });

  it('newUrls が空なら何も変更しない', () => {
    const mapUrls = ['old0', 'old1'];
    const mapLayouts = [{ title: '図1' }, { title: '図2' }];
    const result = applyReplacedMapPages(mapUrls, mapLayouts, 0, []);
    expect(result.mapUrls).toEqual(mapUrls);
    expect(result.mapLayouts).toEqual(mapLayouts);
  });
});

// ── resetReplacedMapAspect ───────────────────────────────────
describe('resetReplacedMapAspect', () => {
  it('指定indexのアスペクトを0にリセットする(旧アスペクトは残らない)', () => {
    const result = resetReplacedMapAspect([1.5, 1.6, 1.7], 1);
    expect(result).toEqual([1.5, 0, 1.7]);
  });

  it('リセット後の値は isLegacyMapCoord で旧形式(未記録)扱いになる', () => {
    const result = resetReplacedMapAspect([1.5, 1.6, 1.7], 1);
    expect(isLegacyMapCoord(result, 1)).toBe(true);
  });

  it('他のindexのアスペクトは変化しない', () => {
    const result = resetReplacedMapAspect([1.5, 1.6, 1.7], 1);
    expect(result[0]).toBe(1.5);
    expect(result[2]).toBe(1.7);
  });

  it('indexが範囲外なら何も変更しない', () => {
    const result = resetReplacedMapAspect([1.5, 1.6], 5);
    expect(result).toEqual([1.5, 1.6]);
  });

  it('mapImageAspectsがundefinedなら空配列を返す', () => {
    const result = resetReplacedMapAspect(undefined, 0);
    expect(result).toEqual([]);
  });
});
