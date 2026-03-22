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
  size?: number;
}

// ==========================================
// ★ これがないとエラーになります！（基準線の設計図）
// ==========================================
export interface MapLine {
  id: number;
  mapIndex: number;
  x: number;
  y: number;
  length: number;
  rotation: number;
  thickness: number;
  color: string;
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
  mapLines?: MapLine[]; // ★ ここにも追加
  materials?: Material[];
  createdAt?: string;
}