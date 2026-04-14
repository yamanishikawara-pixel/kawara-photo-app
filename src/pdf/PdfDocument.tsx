import {
  Document, Page, View, Text, Image, Font, StyleSheet,
} from '@react-pdf/renderer';
import type { Project, UserSettings } from '../types';

// ── フォント登録（BIZ UDPGothic / public/ に配置済み）──
Font.register({
  family: 'BIZ',
  fonts: [
    { src: '/BIZUDPGothic-Regular.ttf', fontWeight: 'normal' },
    { src: '/BIZUDPGothic-Bold.ttf', fontWeight: 'bold' },
  ],
});
Font.registerHyphenationCallback((w) => [w]); // 日本語の自動ハイフン無効

// ── スタイル ──
const S = StyleSheet.create({
  page: { fontFamily: 'BIZ', padding: 20, backgroundColor: '#ffffff' },
  // 表紙
  coverWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coverLogo: { width: 100, height: 60, objectFit: 'contain', marginBottom: 20 },
  coverTitle: { fontSize: 28, fontWeight: 'bold', letterSpacing: 6, marginBottom: 8 },
  coverLine1: { width: 300, borderBottomWidth: 3, borderBottomColor: '#000', marginBottom: 2 },
  coverLine2: { width: 300, borderBottomWidth: 0.5, borderBottomColor: '#000', marginBottom: 32 },
  coverField: { flexDirection: 'row', width: 320, borderBottomWidth: 1, borderBottomColor: '#000', paddingBottom: 6, marginBottom: 12 },
  coverFieldLabel: { width: 90, fontSize: 11, fontWeight: 'bold' },
  coverFieldValue: { flex: 1, fontSize: 13, fontWeight: 'bold' },
  coverFooter: { position: 'absolute', bottom: 20, right: 20, alignItems: 'flex-end' },
  coverFooterText: { fontSize: 9 },
  // ページ共通ヘッダー
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 4, marginBottom: 6 },
  pageHeaderTitle: { fontSize: 10, fontWeight: 'bold', color: '#374151' },
  pageNum: { fontSize: 8, color: '#9ca3af' },
  // 写真ページ
  // A4(842pt) - padding(40) - header(24) - gaps(10) = 768pt → 3分割 = 256pt
  photoSection: { height: 248, flexDirection: 'row', borderWidth: 0.5, borderColor: '#e5e7eb', borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  photoLeft: { width: '56%', height: 248, borderRightWidth: 0.5, borderRightColor: '#e5e7eb', backgroundColor: '#f8fafc' },
  photoImg: { width: '100%', height: '100%', objectFit: 'contain' },
  photoRight: { flex: 1, padding: 6, gap: 4 },
  photoBadge: { backgroundColor: '#111827', color: '#fff', fontSize: 8, fontWeight: 'bold', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, alignSelf: 'flex-start', marginBottom: 4 },
  photoMeta: { flexDirection: 'row', gap: 6, marginBottom: 3 },
  photoMetaLabel: { fontSize: 7, color: '#6b7280', fontWeight: 'bold' },
  photoMetaValue: { fontSize: 8, color: '#111827', flex: 1 },
  photoProcess: { fontSize: 9, fontWeight: 'bold', color: '#1d4ed8', marginBottom: 2 },
  photoDesc: { fontSize: 8, color: '#374151', lineHeight: 1.4 },
  photoEmpty: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  photoEmptyText: { fontSize: 8, color: '#d1d5db' },
  // 材料ページ
  materialSection: { height: 248, flexDirection: 'row', borderWidth: 0.5, borderColor: '#e5e7eb', borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  materialImg: { width: '40%', height: 248, borderRightWidth: 0.5, borderRightColor: '#e5e7eb', backgroundColor: '#f8fafc' },
  materialInfo: { flex: 1, padding: 6 },
  materialName: { fontSize: 10, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  materialRow: { flexDirection: 'row', marginBottom: 2 },
  materialLabel: { fontSize: 7, color: '#6b7280', fontWeight: 'bold', width: 48 },
  materialValue: { fontSize: 8, color: '#374151', flex: 1 },
  // 位置図
  mapPage: { padding: 0, backgroundColor: '#ffffff' },
  mapImg: { width: '100%', height: '100%', objectFit: 'contain' },
});

// ── 表紙 ──
function CoverPage({ project, userSettings, logoData, fallbackLogoData }: {
  project: Project;
  userSettings: UserSettings | null;
  logoData: string | null;
  fallbackLogoData: string;
}) {
  const companyName = userSettings?.companyName || project.contractorName || '';
  const address = userSettings?.address || '';
  const phone = userSettings?.phone || '';
  const logoSrc = logoData || fallbackLogoData;

  const fields = [
    { label: '工事件名', value: project.projectName },
    { label: '工事場所', value: project.projectLocation },
    { label: '工　　期', value: project.constructionPeriod },
    { label: '施工業者', value: companyName },
    { label: '作成年月日', value: project.creationDate },
  ];

  return (
    <Page size="A4" style={S.page}>
      <View style={S.coverWrap}>
        <Image src={logoSrc} style={S.coverLogo} />
        <Text style={S.coverTitle}>工事写真報告書</Text>
        <View style={S.coverLine1} />
        <View style={S.coverLine2} />
        {fields.map((f) => (
          <View key={f.label} style={S.coverField}>
            <Text style={S.coverFieldLabel}>{f.label}</Text>
            <Text style={S.coverFieldValue}>{f.value || '　'}</Text>
          </View>
        ))}
      </View>
      {(address || phone) && (
        <View style={S.coverFooter}>
          {address && <Text style={S.coverFooterText}>{address}</Text>}
          {phone && <Text style={S.coverFooterText}>{phone}</Text>}
        </View>
      )}
    </Page>
  );
}

// ── 位置図ページ ──
function MapPage({ mapData }: { mapData: string; index: number; total: number }) {
  return (
    <Page size="A4" style={S.mapPage}>
      {mapData ? (
        <Image src={mapData} style={S.mapImg} />
      ) : (
        <View style={[S.page, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontFamily: 'BIZ', fontSize: 12, color: '#9ca3af' }}>位置図なし</Text>
        </View>
      )}
    </Page>
  );
}

// ── 写真1枚セクション ──
function PhotoSection({ photo, renderedSrc, idx }: {
  photo: { id: number; photoNumber: string; shootingDate: string; process: string; description: string; image: string | null };
  renderedSrc: string | null;
  idx: number;
}) {
  return (
    <View style={S.photoSection}>
      <View style={S.photoLeft}>
        {renderedSrc ? (
          <Image src={renderedSrc} style={S.photoImg} />
        ) : (
          <View style={S.photoEmpty}>
            <Text style={S.photoEmptyText}>画像なし</Text>
          </View>
        )}
      </View>
      <View style={S.photoRight}>
        <Text style={S.photoBadge}>No. {photo.photoNumber || String(idx + 1)}</Text>
        <View style={S.photoMeta}>
          <Text style={S.photoMetaLabel}>撮影日</Text>
          <Text style={S.photoMetaValue}>{photo.shootingDate || '　'}</Text>
        </View>
        {photo.process ? <Text style={S.photoProcess}>{photo.process}</Text> : null}
        {photo.description ? <Text style={S.photoDesc}>{photo.description}</Text> : null}
      </View>
    </View>
  );
}

// ── 写真ページ ──
function PhotoPage({ photos, renderedSrcs, pageIdx, total, projectName }: {
  photos: Array<{ id: number; photoNumber: string; shootingDate: string; process: string; description: string; image: string | null }>;
  renderedSrcs: (string | null)[];
  pageIdx: number;
  total: number;
  projectName: string;
}) {
  return (
    <Page size="A4" style={S.page}>
      <View style={S.pageHeader}>
        <Text style={S.pageHeaderTitle}>{projectName || '工事写真報告書'}</Text>
        <Text style={S.pageNum}>{pageIdx + 1} / {total}</Text>
      </View>
      {photos.map((photo, i) => (
        <PhotoSection key={photo.id} photo={photo} renderedSrc={renderedSrcs[i] ?? null} idx={i} />
      ))}
    </Page>
  );
}

// ── 材料ページ ──
function MaterialPage({ materials, renderedSrcs, pageIdx, total, projectName }: {
  materials: Array<{ id: number; name: string; manufacturer: string; specification: string; remarks: string; image: string | null }>;
  renderedSrcs: (string | null)[];
  pageIdx: number;
  total: number;
  projectName: string;
}) {
  return (
    <Page size="A4" style={S.page}>
      <View style={S.pageHeader}>
        <Text style={S.pageHeaderTitle}>{projectName || '工事写真報告書'}　使用材料</Text>
        <Text style={S.pageNum}>{pageIdx + 1} / {total}</Text>
      </View>
      {materials.map((m, i) => (
        <View key={m.id} style={S.materialSection}>
          <View style={S.materialImg}>
            {renderedSrcs[i] ? (
              <Image src={renderedSrcs[i]!} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <View style={[S.photoEmpty]}>
                <Text style={S.photoEmptyText}>画像なし</Text>
              </View>
            )}
          </View>
          <View style={S.materialInfo}>
            <Text style={S.materialName}>{m.name || '　'}</Text>
            {m.manufacturer ? (
              <View style={S.materialRow}>
                <Text style={S.materialLabel}>メーカー</Text>
                <Text style={S.materialValue}>{m.manufacturer}</Text>
              </View>
            ) : null}
            {m.specification ? (
              <View style={S.materialRow}>
                <Text style={S.materialLabel}>規　　格</Text>
                <Text style={S.materialValue}>{m.specification}</Text>
              </View>
            ) : null}
            {m.remarks ? (
              <View style={S.materialRow}>
                <Text style={S.materialLabel}>備　　考</Text>
                <Text style={S.materialValue}>{m.remarks}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </Page>
  );
}

// ── メインドキュメント ──
export interface PdfDocumentProps {
  project: Project;
  userSettings: UserSettings | null;
  logoData: string | null;
  fallbackLogoData: string;
  /** photoId → DataURL（赤丸・寸法線焼き込み済み）*/
  photoDataMap: Map<number, string>;
  /** material id → DataURL */
  materialDataMap: Map<number, string>;
  /** mapUrl → DataURL */
  mapDataMap: Map<string, string>;
}

export function PdfDocument({
  project, userSettings, logoData, fallbackLogoData,
  photoDataMap, materialDataMap, mapDataMap,
}: PdfDocumentProps) {
  const mapUrls = project.mapUrls?.length ? project.mapUrls : [''];
  const activePhotos = (project.photos ?? []).filter((p) => p.image || p.process || p.description);
  const photoChunks: typeof activePhotos[] = [];
  for (let i = 0; i < Math.max(activePhotos.length, 3); i += 3) {
    const chunk = activePhotos.slice(i, i + 3);
    while (chunk.length < 3) chunk.push({ id: -(i + chunk.length), image: null, photoNumber: '', shootingDate: '', locationMap: '', process: '', description: '', circles: [] });
    photoChunks.push(chunk);
  }

  const activeMaterials = (project.materials ?? []).filter(
    (m) => m.image || m.name || m.manufacturer || m.specification || m.remarks
  );
  const materialChunks: typeof activeMaterials[] = [];
  if (activeMaterials.length > 0) {
    for (let i = 0; i < Math.max(activeMaterials.length, 3); i += 3) {
      const chunk = activeMaterials.slice(i, i + 3);
      while (chunk.length < 3) chunk.push({ id: -(i + chunk.length), image: null, name: '', manufacturer: '', specification: '', remarks: '', rotation: 0 });
      materialChunks.push(chunk);
    }
  }

  const totalPages = 1 + mapUrls.length + photoChunks.length + materialChunks.length;

  return (
    <Document>
      {/* 表紙 */}
      <CoverPage project={project} userSettings={userSettings} logoData={logoData} fallbackLogoData={fallbackLogoData} />

      {/* 位置図 */}
      {mapUrls.map((url, i) => (
        <MapPage key={i} mapData={url ? (mapDataMap.get(url) ?? '') : ''} index={i} total={totalPages} />
      ))}

      {/* 写真ページ */}
      {photoChunks.map((chunk, pi) => (
        <PhotoPage
          key={pi}
          photos={chunk}
          renderedSrcs={chunk.map((p) => (p.id < 0 ? null : (photoDataMap.get(p.id) ?? null)))}
          pageIdx={1 + mapUrls.length + pi}
          total={totalPages}
          projectName={project.projectName}
        />
      ))}

      {/* 材料ページ */}
      {materialChunks.map((chunk, pi) => (
        <MaterialPage
          key={pi}
          materials={chunk}
          renderedSrcs={chunk.map((m) => (m.id < 0 ? null : (materialDataMap.get(m.id) ?? null)))}
          pageIdx={1 + mapUrls.length + photoChunks.length + pi}
          total={totalPages}
          projectName={project.projectName}
        />
      ))}
    </Document>
  );
}
