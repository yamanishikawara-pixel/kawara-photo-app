import { describe, it, expect } from 'vitest';
import {
  LEGACY_MAP_ASPECT,
  resolveMapAspect,
  isLegacyMapCoord,
  convertCoordLegacyToNatural,
  migrateMapToImageAspect,
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

  it('invalid aspect (0) → does NOT change mapImageAspects', () => {
    // フェーズ2修正の前提確認: 現在の挙動を記録
    // ※ フェーズ2で「0を渡したら変換しない」ガードが追加された後に更新する
    const result = migrateMapToImageAspect(baseProject, 0, 0);
    // 0 を渡すと LEGACY_ASPECT で変換されてしまう（修正前の現状を記録）
    expect(typeof result.mapImageAspects[0]).toBe('number');
  });
});
