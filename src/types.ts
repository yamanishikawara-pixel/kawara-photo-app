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
}

// ==========================================
// ★ ここから新設：材料報告書用の設計図
// ==========================================
export interface Material {
  id: number;
  image: string | null;   // 材料の写真（パッケージや資材）
  name: string;           // 品名
  manufacturer: string;   // メーカー
  specification: string;  // 規格 / 寸法 / 数量など
  remarks: string;        // 備考（使用箇所など）
  rotation?: number;      // 写真の回転（手動補正用）
}
// ==========================================

export interface Project {
  projectName: string;
  projectLocation: string;
  constructionPeriod: string;
  contractorName: string;
  creationDate: string;
  photos: Photo[];
  mapUrls: string[]; // ★ここが図面のURLを入れる箱。今回ここを最大3つまで使うようにプログラム側で制御します
  mapRows: MapRow[];
  mapPins: MapPin[];
  materials?: Material[];
  createdAt?: string;
}