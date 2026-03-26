export interface Circle {
  id: number;
  x: number;
  y: number;
  size: number;
}
export interface DimensionLine {
  id: number;
  start: { x: number; y: number }; // 始点のX,Y座標（%）
  end: { x: number; y: number };   // 終点のX,Y座標（%）
  text: string;                    // 入力する文字
  size?: number;                   // 線の太さ
  color?: string;                  // 線の色
}
export interface Photo {
  id: number;
  image: string | null;
  photoNumber: string;
  shootingDate: string;
  locationMap: string;
  process: string;
  description: string;
  circles: Circle[];
  rotation?: number;
  dimensionLines?: DimensionLine[];
}

export interface MapRow {
  id: number;
  mapIndex?: number;
  symbol: string;
  part: string;
  photoNo?: string;
  relatedPhotoNumber?: string;
  remarks?: string;
}

export type MapPinType = 'circle' | 'arrow';

export interface MapPin {
  id: number;
  mapIndex: number;
  x: number;
  y: number;
  label: string;
  type: MapPinType;
  rotation: number;
  /** 位置図上の表示スケール（未指定は 1） */
  size?: number;
}

export interface MapLine {
  id: number;
  mapIndex: number;
  /** 数値は `defaultUnit` が付与される。`'50%'` のように単位付き文字列も可 */
  x: number | string;
  y: number | string;
  length: number | string;
  thickness: number | string;
  color: string;
  rotation: number;
}

export interface Material {
  id: number;
  image: string | null;
  name: string;
  manufacturer: string;
  specification: string;
  remarks: string;
  rotation: number;
}

export interface Project {
  projectName: string;
  projectLocation: string;
  constructionPeriod: string;
  contractorName: string;
  creationDate: string;
  photos: Photo[];
  mapUrls: string[];
  mapRows: MapRow[];
  mapPins: MapPin[];
  /** 位置図上の線（任意） */
  mapLines?: MapLine[];
  /** 使用材料（任意） */
  materials?: Material[];
  createdAt?: string;
}

