export interface Circle {
  id: number;
  x: number;
  y: number;
  size: number;
}

export interface DimensionLine {
  id: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  text: string;
  size?: number;
  color?: string;
  mapIndex?: number;
  textRotation?: number;
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
  /** ピン追加時のマップ回転角の逆数（文字固定用） */
  textRotation?: number;
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

export interface MaterialMaster {
  id: number;
  name: string;
  manufacturer: string;
  specification: string;
  remarks: string;
}

export interface PhotoMaster {
  id: number;
  name: string;        // テンプレート名（選択キー）
  process: string;     // 工程
  description: string; // 説明文
}

export interface UserSettings {
  companyName?: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  customProcesses?: string[];
  customDescTemplates?: Array<{ label: string; text: string }>;
  materialMaster?: MaterialMaster[];
  photoMaster?: PhotoMaster[];
}

export interface WhiteoutBox {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  mapIndex?: number;
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
  mapLines?: MapLine[];
  materials?: Material[];
  createdAt?: string;
  mapDimensionLines?: DimensionLine[];
  showLegendTable?: boolean;
  mapRotations?: number[];
  mapTransforms?: { scale: number; x: number; y: number }[];
  shareToken?: string;
  whiteoutBoxes?: WhiteoutBox[];
  isCompleted?: boolean;
}
export interface Project {
  // ... (既存のコード) ...
  mapRotations?: number[];
  mapTransforms?: { scale: number; x: number; y: number }[];
  
  // ▼ これを追加します（各図面のタイトル、位置、縦横の設定を保存）
  mapLayouts?: { title: string; position: string; orientation: 'horizontal' | 'vertical' }[];
  
  whiteoutBoxes?: WhiteoutBox[];
  // ...
}