import type { Project, MapPin, DimensionLine, WhiteoutBox } from '../types';

/** 旧コンテナのアスペクト比（幅/高さ） */
export const LEGACY_ASPECT = 194 / 120;

/**
 * mapIndex のコンテナアスペクト比を返す。
 * 移行済み → 保存されたアスペクト / 未移行 → LEGACY_ASPECT
 */
export function resolveMapAspect(aspects: number[] | undefined, mapIndex: number): number {
  if (aspects && aspects[mapIndex] != null && aspects[mapIndex] > 0) {
    return aspects[mapIndex];
  }
  return LEGACY_ASPECT;
}

/** mapIndex がまだ移行されていない旧形式かどうかを返す */
export function isLegacyMap(aspects: number[] | undefined, mapIndex: number): boolean {
  return !(aspects && aspects[mapIndex] != null && aspects[mapIndex] > 0);
}

// ─── 座標変換ヘルパー ───────────────────────────────────────────

/** 旧コンテナ内での画像表示領域を返す（0〜1 正規化） */
function imageBoxInContainer(containerAspect: number, imageAspect: number) {
  if (imageAspect >= containerAspect) {
    const h = containerAspect / imageAspect;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  } else {
    const w = imageAspect / containerAspect;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
}

/** % 座標を 旧コンテナ系 → 画像系 に変換 */
export function convertPoint(
  cx: number, cy: number,
  containerAspect: number,
  imageAspect: number,
): { x: number; y: number } {
  const box = imageBoxInContainer(containerAspect, imageAspect);
  return {
    x: (cx / 100 - box.x) / box.w * 100,
    y: (cy / 100 - box.y) / box.h * 100,
  };
}

/** 幅方向の長さ（% of container width）を % of image width に変換 */
function convertLengthX(len: number, containerAspect: number, imageAspect: number): number {
  return len / imageBoxInContainer(containerAspect, imageAspect).w;
}

/** 高さ方向の長さ（% of container height）を % of image height に変換 */
function convertLengthY(len: number, containerAspect: number, imageAspect: number): number {
  return len / imageBoxInContainer(containerAspect, imageAspect).h;
}

// ─── 全オーバーレイ一括変換 ────────────────────────────────────

export interface MigratedMapData {
  mapPins: MapPin[];
  mapDimensionLines: DimensionLine[];
  mapLines: Project['mapLines'];
  whiteoutBoxes: WhiteoutBox[];
  mapImageAspects: number[];
}

/**
 * 指定 mapIndex のすべてのオーバーレイ座標を
 * LEGACY (194:120) 系 → 画像アスペクト系 に変換して返す。
 */
export function migrateMapToImageAspect(
  project: Project,
  mapIndex: number,
  imageAspect: number,
): MigratedMapData {
  const cA = LEGACY_ASPECT;

  const mapPins: MapPin[] = (project.mapPins ?? []).map(pin => {
    if (pin.mapIndex !== mapIndex) return pin;
    const { x, y } = convertPoint(pin.x, pin.y, cA, imageAspect);
    return { ...pin, x, y };
  });

  const mapDimensionLines: DimensionLine[] = (project.mapDimensionLines ?? []).map(line => {
    if ((line.mapIndex ?? 0) !== mapIndex) return line;
    const start = convertPoint(line.start.x, line.start.y, cA, imageAspect);
    const end = convertPoint(line.end.x, line.end.y, cA, imageAspect);
    return { ...line, start, end };
  });

  const mapLines = (project.mapLines ?? []).map(line => {
    if ((line.mapIndex ?? 0) !== mapIndex) return line;
    const xNum = typeof line.x === 'string' ? parseFloat(line.x) : line.x;
    const yNum = typeof line.y === 'string' ? parseFloat(line.y) : line.y;
    const lenNum = typeof line.length === 'string' ? parseFloat(line.length) : line.length;
    const { x, y } = convertPoint(xNum, yNum, cA, imageAspect);
    const length = convertLengthX(lenNum as number, cA, imageAspect);
    return { ...line, x, y, length };
  });

  const whiteoutBoxes: WhiteoutBox[] = (project.whiteoutBoxes ?? []).map(box => {
    if ((box.mapIndex ?? 0) !== mapIndex) return box;
    const { x, y } = convertPoint(box.x, box.y, cA, imageAspect);
    const width = convertLengthX(box.width, cA, imageAspect);
    const height = convertLengthY(box.height, cA, imageAspect);
    return { ...box, x, y, width, height };
  });

  const current = [...(project.mapImageAspects ?? [])];
  current[mapIndex] = imageAspect;

  return { mapPins, mapDimensionLines, mapLines, whiteoutBoxes, mapImageAspects: current };
}
