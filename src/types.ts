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
}

export interface MapRow {
  id: number;
  symbol: string;
  part: string;
  relatedPhotoNumber: string;
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
  createdAt?: string;
}

