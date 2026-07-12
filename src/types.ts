// ============================================================================
// Geometry / Drawing primitives
// ============================================================================

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

// ============================================================================
// Photo / Material
// ============================================================================

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
  standard?: string;
  actual?: string;
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

// ============================================================================
// Map overlays
// ============================================================================

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

export interface WhiteoutBox {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  mapIndex?: number;
}

// ============================================================================
// Master data (user-level templates)
// ============================================================================

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
  standard?: string;   // 基準値
}

export interface WorkTypeTemplateItem {
  process: string;
  description: string;
  standard?: string;   // 基準値
}

export interface WorkTypeTemplate {
  id: number;
  name: string;
  items: WorkTypeTemplateItem[];
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
  workTypeTemplates?: WorkTypeTemplate[];
  storageUsedBytes?: number;
}

// ============================================================================
// Before / After
// ============================================================================

export interface BeforeAfterItem {
  id: string;
  title: string;
  beforeImage: string;
  afterImage: string;
  beforeDesc: string;
  afterDesc: string;
  beforeCircles?: Circle[];
  afterCircles?: Circle[];
}

// ============================================================================
// Project (top-level Firestore document)
// ============================================================================

export interface Project {
  // ── 基本情報（必須） ─────────────────────────────────────────
  projectName: string;
  projectLocation: string;
  constructionPeriod: string;

  /**
   * 施工業者名（canonical）。
   * 表示・保存は常にこのフィールドを使用すること。
   */
  contractorName: string;

  /**
   * 表紙の「作成年月日」（canonical）。
   */
  creationDate: string;

  // ── レガシー互換（読み取り専用・新規書き込み禁止） ──────────
  /**
   * @deprecated 旧フィールド。読み出し時のみ互換目的で参照する。
   * 新規保存時は `contractorName` のみを使用。
   * 参照例: `project.contractorName ?? project.contractor ?? ''`
   */
  contractor?: string;

  /**
   * 完了報告書用の「報告書作成日」。
   * `creationDate` とは用途が異なる（表紙＝企画時、report＝完了時）。
   * 未指定時は完了報告書側で `creationDate` をフォールバック。
   */
  reportDate?: string;

  // ── 写真・材料 ──────────────────────────────────────────────
  photos: Photo[];
  materials?: Material[];

  // ── 位置図関連 ──────────────────────────────────────────────
  mapUrls: string[];
  mapRows: MapRow[];
  mapPins: MapPin[];
  mapLines?: MapLine[];
  mapDimensionLines?: DimensionLine[];
  mapRotations?: number[];
  mapTransforms?: { scale: number; x: number; y: number }[];
  mapLayouts?: { title: string; x?: number; y?: number; rotation?: number }[];
  whiteoutBoxes?: WhiteoutBox[];
  showLegendTable?: boolean;
  /**
   * 各位置図画像の自然アスペクト比 (width / height)。
   *
   * 新形式 (画像基準座標系) で運用されている地図のみ値が入る。
   * 配列の index は mapUrls の index と対応。
   *
   * 未指定 / 0 / NaN の地図は旧形式 (194:120 コンテナ基準) として扱われ、
   * 編集画面で初めて開かれたタイミングで自動的に新形式へ移行される。
   * 詳細は shared/mapCoords.ts を参照。
   */
  mapImageAspects?: number[];

  // ── ビフォーアフター ────────────────────────────────────────
  beforeAfterItems?: BeforeAfterItem[];

  // ── 工程表（ガントチャート） ──────────────────────────────────
  ganttTasks?: import('./pages/SchedulePage').GanttTask[];
  workdayConfig?: import('./utils/workdays').WorkdayConfig;

  // ── 施工保証 ────────────────────────────────────────────────
  warrantyYears?: string;
  warrantyStartDate?: string;
  warrantyNote?: string;

  // ── 添付PDF ────────────────────────────────────────────────
  appendixPdfUrl?: string;
  /**
   * 添付PDFのバイト数。
   * Storage 使用量カウンタの減算時に `getMetadata()` を呼ばず済むよう
   * アップロード時に記録しておく。
   */
  appendixPdfSize?: number;

  // ── メタ情報 ────────────────────────────────────────────────
  createdAt?: string;
  /** 表紙タイトル。未設定時は「工事写真報告書」 */
  coverTitle?: string;
  /** 表紙で非表示にするフィールドのキー一覧 */
  coverHiddenFields?: string[];
  // shareToken は外部共有機能廃止に伴い非推奨。既存 Firestore ドキュメントには
  // 残存する可能性があるが、新規書き込みは行わない。
  shareToken?: string;
  isCompleted?: boolean;
}

// ============================================================================
// Helper accessors（読み出しの canonical フォールバック）
// ----------------------------------------------------------------------------
// 表示側コードでは常にこれらを経由して読むことで、
// レガシーフィールドが残る Firestore ドキュメントにも透過対応する。
// ============================================================================

export const getContractorName = (p: Pick<Project, 'contractorName' | 'contractor'>): string =>
  p.contractorName || p.contractor || '';

export const getReportDate = (p: Pick<Project, 'reportDate' | 'creationDate'>): string =>
  p.reportDate || p.creationDate || '';
