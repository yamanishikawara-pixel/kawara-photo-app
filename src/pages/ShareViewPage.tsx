import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import type { Circle, MapLine, MapRow, Photo, Project } from '../types';
import { getContractorName } from '../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { resolveMapAspect } from '../shared/mapCoords';
import kawaraLogo from '../assets/kawara-logo.png';
import { Edit3 } from 'lucide-react';

function safeStyleLine(val: string | number | undefined | null, defaultUnit: string): string {
  if (val == null || val === '') return `0${defaultUnit}`;
  if (typeof val === 'number') return `${val}${defaultUnit}`;
  return String(val);
}

// 案1: 符号(A, B, C...)ごとに色を割り当て。PdfExportPage と同じパレットで揃える。
const SYMBOL_PALETTE = [
  '#0f6e56', // 緑
  '#185fa5', // 青
  '#b45309', // 茶
  '#7c2d8a', // 紫
  '#a3185a', // 桃赤
  '#3b4f1a', // 深緑
];
function colorForSymbol(sym: string | undefined): string {
  if (!sym || !sym.trim()) return '#d12c2c';
  const s = sym.trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) >>> 0;
  return SYMBOL_PALETTE[h % SYMBOL_PALETTE.length];
}

const BG      = '#0f0f1a';
const CARD    = '#1c1c30';
const CARD2   = '#12122a';
const BORDER  = '#2e2e50';
const TEXT    = '#f0ede8';
const MUTED   = '#8b8ba8';
const DIM     = '#4b4b70';
const ACCENT  = '#ff6b35';

export default function ShareViewPage() {
  const { id, token, shareToken } = useParams<{ id?: string; token?: string; shareToken?: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'invalid'>('loading');
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setIsOwner(!!user));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (shareToken) {
      // 新形式: shares/{shareToken} → projectId → projects/{projectId}
      let aborted = false;
      (async () => {
        try {
          const shareSnap = await getDoc(doc(db, 'shares', shareToken));
          if (aborted) return;
          if (!shareSnap.exists()) { setStatus('invalid'); return; }
          const { projectId } = shareSnap.data() as { projectId: string };
          const projectSnap = await getDoc(doc(db, 'projects', projectId));
          if (aborted) return;
          if (!projectSnap.exists()) { setStatus('invalid'); return; }
          setResolvedProjectId(projectId);
          setProject(projectSnap.data() as Project);
          setStatus('ok');
        } catch {
          if (!aborted) setStatus('invalid');
        }
      })();
      return () => { aborted = true; };
    } else if (id && token) {
      // 旧形式: 後方互換
      let aborted = false;
      (async () => {
        try {
          const snap = await getDoc(doc(db, 'projects', id));
          if (aborted) return;
          if (!snap.exists()) { setStatus('invalid'); return; }
          const data = snap.data() as Project;
          if (data.shareToken !== token) { setStatus('invalid'); return; }
          setResolvedProjectId(id);
          setProject(data);
          setStatus('ok');
        } catch {
          if (!aborted) setStatus('invalid');
        }
      })();
      return () => { aborted = true; };
    }
  }, [id, token, shareToken]);

  if (!shareToken && (!id || !token)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center font-sans" style={{ background: BG, color: TEXT }}>
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: TEXT }}>リンクが無効です</h1>
        <p className="text-sm" style={{ color: MUTED }}>このリンクは期限切れか、存在しません。</p>
      </div>
    );
  }

  if (status === 'loading') return <LoadingSpinner />;

  if (status === 'invalid' || !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center font-sans" style={{ background: BG, color: TEXT }}>
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: TEXT }}>リンクが無効です</h1>
        <p className="text-sm" style={{ color: MUTED }}>このリンクは期限切れか、存在しません。</p>
      </div>
    );
  }

  const activePhotos = (project.photos ?? []).filter((p) => p.image || p.process || p.description);
  const mapUrls = project.mapUrls ?? [];

  return (
    <div className="min-h-screen pb-12 font-sans" style={{ background: BG, color: TEXT }}>

      {/* ── ヘッダー ── */}
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, backdropFilter: 'blur(8px)' }}
      >
        <img src={kawaraLogo} alt="ロゴ" className="h-7 w-auto" style={{ filter: 'grayscale(1) brightness(1.5)', opacity: 0.5 }} />
        <div className="flex-1 min-w-0">
          <div className="text-xs leading-none mb-0.5" style={{ color: DIM }}>工事写真報告書</div>
          <div className="text-sm font-bold leading-tight truncate" style={{ color: TEXT }}>{project.projectName || '（現場名未設定）'}</div>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={() => navigate(`/project/${resolvedProjectId ?? id}`)}
            className="shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border transition-colors"
            style={{ color: ACCENT, borderColor: `${ACCENT}40`, background: `${ACCENT}12` }}
            onPointerEnter={e => (e.currentTarget.style.background = `${ACCENT}22`)}
            onPointerLeave={e => (e.currentTarget.style.background = `${ACCENT}12`)}
          >
            <Edit3 className="w-3.5 h-3.5" /> 編集に戻る
          </button>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-5">

        {/* ── 現場情報 ── */}
        <div className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: BORDER }}>
            <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: MUTED }}>現場情報</h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            {[
              { label: '工事件名',   value: project.projectName },
              { label: '工事場所',   value: project.projectLocation },
              { label: '工期',       value: project.constructionPeriod },
              { label: '施工業者',   value: getContractorName(project) },
              { label: '作成年月日', value: project.creationDate },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-3 text-sm pb-3 border-b last:border-0 last:pb-0" style={{ borderColor: BORDER }}>
                <span className="w-24 flex-shrink-0 text-xs font-bold" style={{ color: MUTED }}>{label}</span>
                <span className="font-bold flex-1" style={{ color: value ? TEXT : DIM }}>{value || '—'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 位置図 ── */}
        {mapUrls.length > 0 && mapUrls.map((u, mapIndex) => {
          const mapRotation = project.mapRotations?.[mapIndex] || 0;
          const t = project.mapTransforms?.[mapIndex] ?? { scale: 1, x: 0, y: 0 };
          const rows: MapRow[] = (project.mapRows ?? []).filter(r => r.mapIndex === mapIndex || (r.mapIndex === undefined && mapIndex === 0));
          // 新形式 (画像基準) / 旧形式 (194:120) を見分けてコンテナアスペクトを解決。
          // 共有画面は読み取り専用なので、保存値をそのまま尊重する。
          const containerAspect = resolveMapAspect(project.mapImageAspects, mapIndex);

          return (
            <div key={`map-${mapIndex}`} className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: BORDER }}>
                <h2 className="font-bold text-sm" style={{ color: TEXT }}>
                  位置図{mapUrls.length > 1 ? ` (${mapIndex + 1}/${mapUrls.length})` : ''}
                </h2>
              </div>

              {/* 座標系のコンテナアスペクトはマップごとに decide される (resolveMapAspect)。
                  新形式の地図 → 画像の自然アスペクト
                  旧形式の地図 → 194/120 (LEGACY_MAP_ASPECT)
                  これにより、編集画面で開かれて新形式に移行済みの現場は紙面/画面に
                  大きく表示され、まだ移行していない古い現場も座標がズレずに表示される。 */}
              <div className="overflow-hidden flex items-center justify-center" style={{ background: CARD2, maxHeight: '78vh' }}>
                <div className="relative overflow-hidden" style={{ width: '100%', aspectRatio: `${containerAspect}`, maxWidth: `calc(78vh * ${containerAspect})`, maxHeight: '78vh' }}>
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ transform: `translate(${t.x}%, ${t.y}%) scale(${t.scale}) rotate(${mapRotation}deg)`, transformOrigin: 'center center' }}
                  >
                    <img src={u} alt="位置図" className="block w-full h-full object-contain" />

                    {/* ピン(符号連動の複数色) */}
                    {(project.mapPins ?? []).filter(p => (p.mapIndex ?? 0) === mapIndex).map(pin => {
                      const pinColor = colorForSymbol(pin.label);
                      return (
                        <div key={pin.id} style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: `translate(-50%, -50%) scale(${pin.size ?? 1})`, zIndex: 10 }} className="absolute">
                          {pin.type === 'arrow' ? (
                            <div className="flex items-center gap-1 px-1 rounded" style={{ background: 'rgba(255,255,255,0.8)', border: `1px solid ${pinColor}33` }}>
                              <span className="font-bold text-[18px]" style={{ color: pinColor, transform: `rotate(${pin.rotation ?? 0}deg)` }}>➡</span>
                              <span className="font-bold text-[15px]" style={{ color: pinColor }}>{pin.label}</span>
                            </div>
                          ) : (
                            <div className="relative flex items-center justify-center">
                              <div className="w-[10mm] h-[10mm] rounded-full" style={{ border: `3px solid ${pinColor}`, background: `${pinColor}1a` }} />
                              <span className="absolute font-bold text-[13px] px-0.5 rounded" style={{ color: pinColor, background: 'rgba(255,255,255,0.8)' }}>{pin.label}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* 線 */}
                    {(project.mapLines ?? []).filter(l => l.mapIndex === mapIndex).map((line: MapLine) => (
                      <div key={`line-${line.id}`} className="absolute" style={{ left: safeStyleLine(line.x, '%'), top: safeStyleLine(line.y, '%'), width: safeStyleLine(line.length, '%'), height: safeStyleLine(line.thickness, 'px'), backgroundColor: line.color || '#000000', transform: `translate(-50%, -50%) rotate(${line.rotation ?? 0}deg)`, transformOrigin: 'center center', zIndex: 15 }} />
                    ))}

                    {/* 寸法線(文字背景は半透明黒をやめ、白縁取り) */}
                    {(project.mapDimensionLines ?? []).filter(l => (l.mapIndex || 0) === mapIndex).map((line) => {
                      const color = line.color || '#FFFFFF';
                      const thickness = Number(line.size || 2);
                      const midX = (line.start.x + line.end.x) / 2;
                      const midY = (line.start.y + line.end.y) / 2;
                      return (
                        <div key={line.id} className="absolute inset-0 z-20 pointer-events-none w-full h-full" style={{ overflow: 'visible' }}>
                          <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
                            <defs>
                              <marker id={`share-tick-${line.id}`} markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                                <line x1="0" y1="6" x2="12" y2="6" stroke={color} strokeWidth={thickness} />
                                <line x1="3" y1="9" x2="9" y2="3" stroke={color} strokeWidth={thickness * 1.5} />
                              </marker>
                            </defs>
                            <line x1={`${line.start.x}%`} y1={`${line.start.y}%`} x2={`${line.end.x}%`} y2={`${line.end.y}%`} stroke={color} strokeWidth={thickness} fill="none" markerStart={`url(#share-tick-${line.id})`} markerEnd={`url(#share-tick-${line.id})`} />
                          </svg>
                          {line.text && (
                            <div
                              style={{
                                left: `${midX}%`,
                                top: `${midY}%`,
                                color,
                                fontSize: '12px',
                                transform: `translate(-50%, -50%) rotate(${line.textRotation ?? 0}deg)`,
                                paintOrder: 'stroke fill',
                                WebkitTextStroke: '3px white',
                              }}
                              className="absolute font-bold px-0.5 whitespace-nowrap"
                            >
                              {line.text}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* 白塗り */}
                    {(project.whiteoutBoxes ?? []).filter(b => (b.mapIndex || 0) === mapIndex).map(box => (
                      <div key={box.id} className="absolute bg-white pointer-events-none" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%`, transform: 'translate(-50%, -50%)', zIndex: 25 }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* 凡例テーブル(showLegendTable 分岐撤去、空のときだけ非表示) */}
              {rows.length > 0 && (
                <div className="px-4 pb-4 pt-3">
                  <table className="w-full text-xs border-collapse" style={{ borderColor: BORDER }}>
                    <thead>
                      <tr style={{ background: CARD2 }}>
                        {['符号', '部位', '写真No', '備考'].map(h => (
                          <th key={h} className="px-2 py-1.5 text-center font-bold border" style={{ borderColor: BORDER, color: MUTED }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => {
                        const symBg = colorForSymbol(row.symbol);
                        return (
                          <tr key={row.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                            <td className="px-2 py-1.5 text-center border" style={{ borderColor: BORDER }}>
                              {row.symbol && row.symbol.trim() ? (
                                <span
                                  className="inline-flex items-center justify-center font-bold text-white"
                                  style={{
                                    minWidth: '22px',
                                    height: '22px',
                                    padding: '0 6px',
                                    borderRadius: '11px',
                                    background: symBg,
                                    fontSize: '11px',
                                    lineHeight: 1,
                                  }}
                                >
                                  {row.symbol}
                                </span>
                              ) : (
                                <span style={{ color: DIM }}>―</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 border" style={{ borderColor: BORDER, color: TEXT }}>{row.part}</td>
                            <td className="px-2 py-1.5 text-center border" style={{ borderColor: BORDER, color: MUTED }}>{row.photoNo ?? row.relatedPhotoNumber}</td>
                            <td className="px-2 py-1.5 border" style={{ borderColor: BORDER, color: MUTED }}>{row.remarks}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {/* ── 工事写真 ── */}
        {activePhotos.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xs font-bold tracking-widest uppercase px-1" style={{ color: MUTED }}>工事写真</h2>
            {activePhotos.map((photo: Photo & { circles?: Circle[] }) => (
              <div key={photo.id} className="rounded-2xl border overflow-hidden" style={{ background: CARD, borderColor: BORDER }}>
                {photo.image && (
                  <div className="flex items-center justify-center" style={{ background: '#000' }}>
                    <div className="relative" style={{ display: 'inline-block', transform: `rotate(${photo.rotation ?? 0}deg)` }}>
                      <img
                        src={photo.image}
                        alt=""
                        style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '80vh' }}
                      />
                      {/* 赤丸 */}
                      {(photo.circles ?? []).map((c: Circle) => (
                        <div
                          key={c.id}
                          className="absolute aspect-square rounded-full border-[3px] border-red-600 pointer-events-none"
                          style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${Number(c.size || 20)}%`, transform: 'translate(-50%, -50%)' }}
                        />
                      ))}
                      {/* 寸法線 */}
                      {(photo.dimensionLines ?? []).map((line) => {
                        const color = line.color || '#FFFFFF';
                        const thickness = Number(line.size || 2);
                        const midX = (line.start.x + line.end.x) / 2;
                        const midY = (line.start.y + line.end.y) / 2;
                        return (
                          <div key={line.id} className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }}>
                            <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
                              <defs>
                                <marker id={`share-photo-tick-${line.id}`} markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                                  <line x1="0" y1="6" x2="12" y2="6" stroke={color} strokeWidth={thickness} />
                                  <line x1="3" y1="9" x2="9" y2="3" stroke={color} strokeWidth={thickness * 1.5} />
                                </marker>
                              </defs>
                              <line x1={`${line.start.x}%`} y1={`${line.start.y}%`} x2={`${line.end.x}%`} y2={`${line.end.y}%`} stroke={color} strokeWidth={thickness} fill="none" markerStart={`url(#share-photo-tick-${line.id})`} markerEnd={`url(#share-photo-tick-${line.id})`} />
                            </svg>
                            {line.text && (
                              <div style={{ left: `${midX}%`, top: `${midY}%`, color, backgroundColor: 'rgba(0,0,0,0.6)', fontSize: '11px', transform: `translate(-50%, -50%) rotate(${line.textRotation ?? 0}deg)` }} className="absolute font-bold px-1 py-0.5 rounded whitespace-nowrap">
                                {line.text}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* メタ情報 */}
                <div className="px-4 py-3 space-y-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {photo.photoNumber && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${ACCENT}22`, color: ACCENT }}>No. {photo.photoNumber}</span>
                    )}
                    {photo.shootingDate && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: CARD2, color: MUTED }}>{photo.shootingDate}</span>
                    )}
                    {photo.locationMap && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>{photo.locationMap}</span>
                    )}
                    {photo.process && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>{photo.process}</span>
                    )}
                  </div>
                  {photo.description && (
                    <p className="text-sm leading-snug" style={{ color: TEXT }}>{photo.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs pb-4" style={{ color: DIM }}>瓦工事写真台帳システム</p>
      </div>
    </div>
  );
}
