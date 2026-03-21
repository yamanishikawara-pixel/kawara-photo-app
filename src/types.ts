export interface Circle {
  id: number;
  x: number;
  y: number;
  size: number;
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
  size?: number; // ★ 新設：マーカーの拡大縮小用
}

// ==========================================
// ★ 新設：基準線（直線）用の設計図
// ==========================================
export interface MapLine {
  id: number;
  mapIndex: number;
  x: number;          // 中心のX座標
  y: number;          // 中心のY座標
  length: number;     // 長さ
  rotation: number;   // 角度
  thickness: number;  // 太さ
  color: string;      // 色
}

export interface Material {
  id: number;
  image: string | null;
  name: string;
  manufacturer: string;
  specification: string;
  remarks: string;
  rotation?: number;
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
  mapLines?: MapLine[]; // ★ 新設：基準線の箱
  materials?: Material[];
  createdAt?: string;
}