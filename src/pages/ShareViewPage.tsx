import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Circle, MapLine, MapRow, Photo, Project } from '../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import kawaraLogo from '../assets/kawara-logo.png';

function safeStyleLine(val: string | number | undefined | null, defaultUnit: string): string {
  if (val == null || val === '') return `0${defaultUnit}`;
  if (typeof val === 'number') return `${val}${defaultUnit}`;
  return String(val);
}

export default function ShareViewPage() {
  const { id, token } = useParams<{ id: string; token: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'invalid'>('loading');

  useEffect(() => {
    if (!id || !token) { setStatus('invalid'); return; }
    getDoc(doc(db, 'projects', id))
      .then((snap) => {
        if (!snap.exists()) { setStatus('invalid'); return; }
        const data = snap.data() as Project;
        if (data.shareToken !== token) { setStatus('invalid'); return; }
        setProject(data);
        setStatus('ok');
      })
      .catch(() => setStatus('invalid'));
  }, [id, token]);

  if (status === 'loading') return <LoadingSpinner />;

  if (status === 'invalid' || !project) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-700 mb-2">リンクが無効です</h1>
        <p className="text-gray-500 text-sm">このリンクは期限切れか、存在しません。</p>
      </div>
    );
  }

  const activePhotos = (project.photos ?? []).filter((p) => p.image || p.process || p.description);
  const mapUrls = project.mapUrls ?? [];

  return (
    <div className="min-h-screen bg-gray-100 pb-12">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <img src={kawaraLogo} alt="ロゴ" className="h-8 w-auto grayscale opacity-50" />
        <div>
          <div className="text-xs text-gray-400 leading-none">工事写真報告書</div>
          <div className="text-base font-bold text-gray-800 leading-tight truncate max-w-[240px]">{project.projectName || '（現場名未設定）'}</div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">

        {/* 表紙情報 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">現場情報</h2>
          {[
            { label: '工事件名', value: project.projectName },
            { label: '工事場所', value: project.projectLocation },
            { label: '工期', value: project.constructionPeriod },
            { label: '施工業者', value: project.contractorName },
            { label: '作成年月日', value: project.creationDate },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-3 text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
              <span className="text-gray-400 w-24 flex-shrink-0">{label}</span>
              <span className="font-bold text-gray-800 flex-1">{value || '—'}</span>
            </div>
          ))}
        </div>

        {/* 位置図 */}
        {mapUrls.length > 0 && mapUrls.map((u, mapIndex) => (
          <div key={`map-${mapIndex}`} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="font-bold text-gray-800">
                位置図{mapUrls.length > 1 ? ` (${mapIndex + 1}/${mapUrls.length})` : ''}
              </h2>
            </div>
            <div className="relative bg-gray-50">
              <div style={{ display: 'inline-block', position: 'relative', width: '100%' }}>
                <img
                  src={u}
                  alt="位置図"
                  className="w-full h-auto block"
                  style={{ transform: `rotate(${project.mapRotations?.[mapIndex] || 0}deg)` }}
                />

                {/* ピン */}
                {(project.mapPins ?? []).filter(p => p.mapIndex === mapIndex).map(pin => (
                  <div key={pin.id} style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: `translate(-50%, -50%) scale(${pin.size ?? 1})`, zIndex: 10 }} className="absolute">
                    {pin.type === 'arrow' ? (
                      <div className="flex items-center gap-1 px-1 rounded bg-white/80 border border-red-200">
                        <span className="font-bold text-[18px] text-red-600" style={{ transform: `rotate(${pin.rotation ?? 0}deg)` }}>➡</span>
                        <span className="font-bold text-[15px] text-red-600">{pin.label}</span>
                      </div>
                    ) : (
                      <div className="relative flex items-center justify-center">
                        <div className="w-[10mm] h-[10mm] rounded-full border-[3px] border-red-600 bg-red-600/10" />
                        <span className="absolute font-bold text-[13px] px-0.5 rounded text-red-600 bg-white/80">{pin.label}</span>
                      </div>
                    )}
                  </div>
                ))}

                {/* 線 */}
                {(project.mapLines ?? []).filter(l => l.mapIndex === mapIndex).map((line: MapLine) => (
                  <div key={`line-${line.id}`} className="absolute" style={{ left: safeStyleLine(line.x, '%'), top: safeStyleLine(line.y, '%'), width: safeStyleLine(line.length, '%'), height: safeStyleLine(line.thickness, 'px'), backgroundColor: line.color || '#000000', transform: `translate(-50%, -50%) rotate(${line.rotation ?? 0}deg)`, transformOrigin: 'center center', zIndex: 15 }} />
                ))}

                {/* 寸法線 */}
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
                        <div style={{ left: `${midX}%`, top: `${midY}%`, color, backgroundColor: 'rgba(0,0,0,0.5)', fontSize: '12px' }} className="absolute translate-x-[-50%] translate-y-[-50%] font-bold px-1 py-0.5 rounded whitespace-nowrap">
                          {line.text}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 凡例テーブル */}
            {project.showLegendTable !== false && (() => {
              const rows: MapRow[] = project.mapRows ?? [];
              const currentRows = rows.filter(r => r.mapIndex === mapIndex || (r.mapIndex === undefined && mapIndex === 0));
              if (currentRows.length === 0) return null;
              return (
                <div className="px-4 pb-4 pt-2">
                  <table className="w-full text-xs border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 px-2 py-1 text-center w-8">符号</th>
                        <th className="border border-gray-300 px-2 py-1 text-center">部位</th>
                        <th className="border border-gray-300 px-2 py-1 text-center">写真No</th>
                        <th className="border border-gray-300 px-2 py-1 text-center">備考</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRows.map(row => (
                        <tr key={row.id}>
                          <td className="border border-gray-300 px-2 py-1 text-center font-bold text-red-700">{row.symbol}</td>
                          <td className="border border-gray-300 px-2 py-1">{row.part}</td>
                          <td className="border border-gray-300 px-2 py-1 text-center">{row.photoNo ?? row.relatedPhotoNumber}</td>
                          <td className="border border-gray-300 px-2 py-1">{row.remarks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        ))}

        {/* 写真 */}
        {activePhotos.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">工事写真</h2>
            {activePhotos.map((photo: Photo & { circles?: Circle[] }) => (
              <div key={photo.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {photo.image && (
                  <div className="flex items-center justify-center bg-black">
                    <div className="relative" style={{ display: 'inline-block' }}>
                      <img
                        src={photo.image}
                        alt=""
                        style={{
                          display: 'block',
                          width: 'auto',
                          height: 'auto',
                          maxWidth: '100%',
                          maxHeight: '80vh',
                          transform: `rotate(${photo.rotation ?? 0}deg)`,
                        }}
                      />
                      {/* 赤丸 */}
                      {(photo.circles ?? []).map((c: Circle) => (
                        <div
                          key={c.id}
                          className="absolute aspect-square rounded-full border-[3px] border-red-600 pointer-events-none"
                          style={{
                            left: `${c.x}%`,
                            top: `${c.y}%`,
                            width: `${Number(c.size || 20)}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
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
                              <div style={{ left: `${midX}%`, top: `${midY}%`, color, backgroundColor: 'rgba(0,0,0,0.5)', fontSize: '11px' }} className="absolute translate-x-[-50%] translate-y-[-50%] font-bold px-1 py-0.5 rounded whitespace-nowrap">
                                {line.text}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="px-4 py-3 space-y-1.5 text-sm">
                  <div className="flex gap-2 flex-wrap">
                    {photo.photoNumber && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-bold">No. {photo.photoNumber}</span>}
                    {photo.shootingDate && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">{photo.shootingDate}</span>}
                    {photo.locationMap && <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full text-xs">{photo.locationMap}</span>}
                    {photo.process && <span className="bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full text-xs">{photo.process}</span>}
                  </div>
                  {photo.description && <p className="text-gray-700 leading-snug">{photo.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-300 pb-4">瓦工事写真台帳システム</p>
      </div>
    </div>
  );
}
