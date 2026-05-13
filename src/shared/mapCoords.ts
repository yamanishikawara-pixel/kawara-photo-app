// ============================================================================
// 位置図 (map) 座標系のユーティリティ
// ----------------------------------------------------------------------------
// 背景:
//   旧形式では位置図画像を 194:120 (横長) のコンテナに object-contain で
//   はめており、ピン・寸法線・マップラインの座標はそのコンテナ基準の %
//   として保存されていた。これは A4 縦の紙面で画像が小さく表示される
//   原因だった。
//
//   新形式では各画像の自然アスペクト比を `Project.mapImageAspects[mapIndex]`
//   に保存し、コンテナをその比に合わせて表示する。座標も画像基準の %
//   として保存される。
//
//   旧形式と新形式は `mapImageAspects[mapIndex]` が undefined かどうかで
//   識別する。旧形式の地図は、編集画面で初めて開かれたタイミングで
//   自動的に新形式に移行される (migrateMapToImageAspect)。
//
// 用語:
//   - "旧アスペクト" = 194 / 120 (= 1.6167...)
//   - "画像の自然アスペクト" = image.naturalWidth / image.naturalHeight
//   - "コンテナ" = 画面/紙面上で座標 0..100% の基準となる矩形領域
//
// 不変条件:
//   - 旧形式: コンテナのアスペクト = 194/120、画像は object-contain で
//     レターボックス/ピラーボックスされていた可能性がある
//   - 新形式: コンテナのアスペクト = 画像の自然アスペクト、画像は
//     コンテナにぴったり一致 (レターボックスなし)
// ============================================================================

import type { Project, MapPin, DimensionLine, MapLine, WhiteoutBox } from '../types';

/** 旧コンテナのアスペクト比 (194:120)。マジックナンバーを1箇所に集約。 */
export const LEGACY_MAP_ASPECT = 194 / 120;

/**
 * 指定マップインデックスの「描画コンテナのアスペクト比」を返す。
 * 新形式ならその値、旧形式 (未指定) なら 194/120 を返す。
 */
export function resolveMapAspect(
  imageAspects: number[] | undefined,
  mapIndex: number,
): number {
  const a = imageAspects?.[mapIndex];
  if (typeof a === 'number' && Number.isFinite(a) && a > 0) return a;
  return LEGACY_MAP_ASPECT;
}

/** 旧形式 (= mapImageAspects[mapIndex] が未指定) かどうか。 */
export function isLegacyMapCoord(
  imageAspects: number[] | undefined,
  mapIndex: number,
): boolean {
  const a = imageAspects?.[mapIndex];
  return !(typeof a === 'number' && Number.isFinite(a) && a > 0);
}

/**
 * 旧 194:120 系の (x%, y%) を、新画像アスペクト系の (x%, y%) に変換する。
 *
 * 旧コンテナでは画像が object-contain でレターボックスされている可能性が
 * あった。新コンテナでは画像がコンテナにぴったり一致するため、ピンの
 * 「画像上の位置」は変化しないが「コンテナ上の % 」が変化する。
 *
 * 例: 1:1 (正方形) の画像を 194:120 コンテナに入れると左右にピラーボックス。
 *     旧コンテナ % で 50% は画像の中心だが、旧コンテナの 50% は画像の中心
 *     のままで、新コンテナでは新コンテナ自体が画像と一致するので 50% のまま。
 *     一方、旧コンテナで x=20% (画像左端より左、余白部) の場合は、
 *     新コンテナの 0% 未満に張り出すことになるが、ユーザーがそこにピンを
 *     置くことはまずないため負値クランプで実害なし。
 */
export function convertCoordLegacyToNatural(
  xPct: number,
  yPct: number,
  imageAspect: number,
): { x: number; y: number } {
  const oldAspect = LEGACY_MAP_ASPECT;
  const newAspect = imageAspect;

  if (newAspect > oldAspect) {
    // 画像が旧コンテナより横長 → 旧では上下に余白 (top/bottom letterbox)
    // 画像の高さは旧コンテナ高さ × (oldAspect / newAspect)
    const displayRatio = oldAspect / newAspect;
    const margin = (1 - displayRatio) / 2;
    return {
      x: xPct,
      y: clampPct(((yPct / 100 - margin) / displayRatio) * 100),
    };
  } else if (newAspect < oldAspect) {
    // 画像が旧コンテナより縦長 → 旧では左右に余白 (pillarbox)
    const displayRatio = newAspect / oldAspect;
    const margin = (1 - displayRatio) / 2;
    return {
      x: clampPct(((xPct / 100 - margin) / displayRatio) * 100),
      y: yPct,
    };
  }
  // 同じアスペクトなら変換不要
  return { x: xPct, y: yPct };
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/**
 * MapLine の x/y/length は数値または "12%" 等の文字列で保存されている。
 * 数値を新アスペクト系に変換するが、文字列値はそのまま返す。
 */
function convertMapLineXY(
  val: number | string,
  oldAspect: number,
  newAspect: number,
  axis: 'x' | 'y',
): number | string {
  if (typeof val !== 'number') return val; // 文字列はそのまま (単位付き値)
  // x/y は単一座標。convertCoordLegacyToNatural と同じロジックを軸ごとに展開。
  if (axis === 'x') {
    if (newAspect < oldAspect) {
      const displayRatio = newAspect / oldAspect;
      const margin = (1 - displayRatio) / 2;
      return clampPct(((val / 100 - margin) / displayRatio) * 100);
    }
    return val;
  } else {
    if (newAspect > oldAspect) {
      const displayRatio = oldAspect / newAspect;
      const margin = (1 - displayRatio) / 2;
      return clampPct(((val / 100 - margin) / displayRatio) * 100);
    }
    return val;
  }
}

/**
 * MapLine の length をアスペクト変換する。
 * length は通常「主軸方向 (rotation 適用前は x 方向) の長さ %」として
 * 解釈されているため、x 軸と同じ変換を行う。
 */
function convertMapLineLength(
  val: number | string,
  oldAspect: number,
  newAspect: number,
): number | string {
  return convertMapLineXY(val, oldAspect, newAspect, 'x');
}

/**
 * 旧形式の地図を新形式に移行する。Project の該当 mapIndex に紐づく
 * 全座標 (mapPins, mapDimensionLines, mapLines, whiteoutBoxes) を変換し、
 * mapImageAspects に画像アスペクトを記録した新しい Project (の部分) を返す。
 *
 * 旧形式 (mapImageAspects[mapIndex] が未定義) のときだけ呼ぶこと。
 * 既に新形式ならこの関数は呼んではいけない (二重変換になる)。
 *
 * @param project 現在の Project
 * @param mapIndex 移行対象の地図インデックス
 * @param naturalAspect 画像の自然アスペクト比 (image.naturalWidth / image.naturalHeight)
 * @returns Firestore に書き戻すための差分オブジェクト (project の上書きフィールド)
 */
export function migrateMapToImageAspect(
  project: Pick<Project, 'mapPins' | 'mapDimensionLines' | 'mapLines' | 'whiteoutBoxes' | 'mapImageAspects'>,
  mapIndex: number,
  naturalAspect: number,
): {
  mapPins: MapPin[];
  mapDimensionLines: DimensionLine[];
  mapLines: MapLine[];
  whiteoutBoxes: WhiteoutBox[];
  mapImageAspects: number[];
} {
  const oldAspect = LEGACY_MAP_ASPECT;

  // ピン
  // mapIndex が undefined のピンは「最初の図面(mapIndex === 0)」のものとして扱う。
  // 寸法線・白塗りボックスと一貫した挙動。
  const newPins: MapPin[] = (project.mapPins ?? []).map((p) => {
    if ((p.mapIndex ?? 0) !== mapIndex) return p;
    const conv = convertCoordLegacyToNatural(p.x, p.y, naturalAspect);
    return { ...p, x: conv.x, y: conv.y };
  });

  // 寸法線
  const newDims: DimensionLine[] = (project.mapDimensionLines ?? []).map((d) => {
    if ((d.mapIndex ?? 0) !== mapIndex) return d;
    const s = convertCoordLegacyToNatural(d.start.x, d.start.y, naturalAspect);
    const e = convertCoordLegacyToNatural(d.end.x, d.end.y, naturalAspect);
    return { ...d, start: s, end: e };
  });

  // マップライン (x/y/length は number | string)
  const newLines: MapLine[] = (project.mapLines ?? []).map((l) => {
    if (l.mapIndex !== mapIndex) return l;
    return {
      ...l,
      x: convertMapLineXY(l.x, oldAspect, naturalAspect, 'x'),
      y: convertMapLineXY(l.y, oldAspect, naturalAspect, 'y'),
      length: convertMapLineLength(l.length, oldAspect, naturalAspect),
    };
  });

  // 白塗りボックス (x, y は中心の %、width/height はサイズの %)
  const newWhiteouts: WhiteoutBox[] = (project.whiteoutBoxes ?? []).map((b) => {
    if ((b.mapIndex ?? 0) !== mapIndex) return b;
    const center = convertCoordLegacyToNatural(b.x, b.y, naturalAspect);
    // width / height は length と同様の扱い (それぞれ x/y 軸基準)
    const newW = typeof b.width === 'number'
      ? (convertMapLineXY(b.width, oldAspect, naturalAspect, 'x') as number)
      : b.width;
    const newH = typeof b.height === 'number'
      ? (convertMapLineXY(b.height, oldAspect, naturalAspect, 'y') as number)
      : b.height;
    return { ...b, x: center.x, y: center.y, width: newW, height: newH };
  });

  // mapImageAspects 配列を更新 (該当 index に自然アスペクトを記録)
  const newAspects = [...(project.mapImageAspects ?? [])];
  while (newAspects.length <= mapIndex) newAspects.push(LEGACY_MAP_ASPECT);
  newAspects[mapIndex] = naturalAspect;

  return {
    mapPins: newPins,
    mapDimensionLines: newDims,
    mapLines: newLines,
    whiteoutBoxes: newWhiteouts,
    mapImageAspects: newAspects,
  };
}
