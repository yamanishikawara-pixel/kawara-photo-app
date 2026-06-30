import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, GripVertical } from 'lucide-react';
import {
  ref, uploadBytes, getDownloadURL,
} from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';
import {
  canUpload, trackUpload,
  genId, storagePathFromUrl, isStorageUrl,
  deleteStorageFileWithAccounting,
} from '../shared/storageUtils';
import type { BeforeAfterItem, Circle } from '../types';
import { getContractorName } from '../types';
import { useDraggablePin, nextId } from '../shared/utils';

// ── 定数 ────────────────────────────────────────────
const W = 595, H = 842;
const SERIF = "'Noto Serif JP', serif";
const SANS  = "'Noto Sans JP', sans-serif";

// レイアウト定数を集約（ヘッダー等を変更する場合はここを触る）
const LAYOUT = {
  headerH: 40,
  footerH: 32,
  pagePadding: 44,
  titleRowH: 20,
  labelBarH: 16,
  descRowH: 35,
  itemGap: 5,
  photoGap: 3,
  sidePadding: 40,
} as const;

// 画像圧縮設定
const IMG_MAX_PX = 1600;   // A4印刷を見越して 800→1600 に拡大
const IMG_QUALITY = 0.92;

// プレビュー写真のフィット方式（屋根写真が切れるのが気になるなら 'contain' に変更）
type PhotoFit = 'cover' | 'contain';
const PHOTO_FIT = 'cover' as PhotoFit;

// ── BeforeAfterItem 型は ../types から import 済み ──
// 空アイテム生成ファクトリ
const makeEmptyItem = (): BeforeAfterItem => ({
  id: genId(),
  title: '', beforeImage: '', afterImage: '', beforeDesc: '', afterDesc: '',
});

// ── A4プレビュー（1ページ2箇所）─────────────────────
interface A4PageProps {
  items: BeforeAfterItem[];
  pageIndex: number;
  totalPages: number;
  projectName: string;
  contractor: string;
}

const A4Page = React.memo(function A4Page({
  items, pageIndex, totalPages, projectName, contractor,
}: A4PageProps) {
  const { headerH, footerH, pagePadding, titleRowH, labelBarH, descRowH, itemGap, photoGap, sidePadding } = LAYOUT;
  const available = H - headerH - footerH - pagePadding;
  const itemH = Math.floor(available / 3);
  // タイトル + ラベルバー + 説明 + ギャップ×3 を引いた残りが写真領域
  const photoH = itemH - titleRowH - labelBarH - descRowH - itemGap * 3;
  const photoW = (W - sidePadding * 2 - photoGap) / 2;

  return (
    <div
      className="a4-page"
      style={{
        width: W, height: H, background: '#fff', fontFamily: SANS,
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* ヘッダー */}
      <div style={{
        height: headerH, borderBottom: '2px solid #1a1a1a', padding: `0 ${sidePadding}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {pageIndex === 0 && (
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.2em', fontFamily: SERIF, color: '#111' }}>
              施工前後比較
            </div>
          )}
        </div>
        <div style={{ fontSize: 10, color: '#aaa', letterSpacing: '0.15em' }}>
          {pageIndex + 1} / {totalPages}
        </div>
      </div>

      {/* 各箇所 */}
      {items.map((item, idx) => {
        const num = pageIndex * 3 + idx + 1;
        const numLabel = '①②③④⑤⑥⑦⑧⑨⑩'[num - 1] ?? `${num}`;
        return (
          <div key={item.id} style={{
            height: itemH, flexShrink: 0,
            borderBottom: idx < items.length - 1 ? '1px solid #e2e2e2' : 'none',
            padding: `14px ${sidePadding}px 0`,
            display: 'flex', flexDirection: 'column', gap: itemGap,
            overflow: 'hidden',
          }}>
            {/* タイトル */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: titleRowH - itemGap, flexShrink: 0 }}>
              <div style={{ width: 3, height: 13, background: '#c0492f', borderRadius: 2, flexShrink: 0 }} />
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#111', letterSpacing: '0.08em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {numLabel} {item.title || '工事箇所'}
              </div>
            </div>

            {/* ラベルバー */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: photoGap, flexShrink: 0 }}>
              <div style={{ background: '#4a5560', color: '#fff', textAlign: 'center', padding: '3px 0', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', fontFamily: SERIF }}>施　工　前</div>
              <div style={{ background: '#5a7d52', color: '#fff', textAlign: 'center', padding: '3px 0', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', fontFamily: SERIF }}>施　工　後</div>
            </div>

            {/* 写真 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: photoGap, flexShrink: 0 }}>
              {[
                { src: item.beforeImage, label: '施工前', circles: item.beforeCircles },
                { src: item.afterImage,  label: '施工後', circles: item.afterCircles },
              ].map((ph, pi) => (
                <div key={pi} style={{
                  width: photoW, height: photoH,
                  background: PHOTO_FIT === 'contain' ? '#f4f4f4' : '#ddd',
                  overflow: 'hidden', flexShrink: 0, position: 'relative',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {ph.src ? (
                    <img
                      src={ph.src}
                      alt={ph.label + '写真'}
                      style={{ width: '100%', height: '100%', objectFit: PHOTO_FIT }}
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                      background: pi === 0 ? '#e8edf2' : '#dcf2e7',
                    }}>
                      <div style={{ fontSize: 28, opacity: 0.5 }}>📷</div>
                      <div style={{ fontSize: 9, color: 'rgba(0,0,0,0.4)', fontFamily: SANS, letterSpacing: '0.08em' }}>
                        {ph.label}
                      </div>
                    </div>
                  )}
                  {(ph.circles ?? []).map((circle) => {
                    const size = Number(circle.size || 20);
                    return (
                      <div
                        key={circle.id}
                        className="absolute aspect-square rounded-full"
                        style={{
                          left: `${circle.x}%`,
                          top: `${circle.y}%`,
                          width: `${size}%`,
                          transform: 'translate(-50%, -50%)',
                          border: '3.5px solid #c0492f',
                          boxShadow: '0 0 0 1.5px #fff, inset 0 0 0 1.5px #fff',
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>

            {/* 説明 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: photoGap, flex: 1, minHeight: 0 }}>
              <div style={{ background: '#f4f4f4', padding: '4px 8px', borderTop: '2px solid #888', overflow: 'hidden' }}>
                <div style={{
                  fontSize: 8.5, color: '#444', lineHeight: 1.5, letterSpacing: '0.03em', whiteSpace: 'pre-wrap',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {item.beforeDesc || '施工前の状況を記入してください。'}
                </div>
              </div>
              <div style={{ background: '#eef6f1', padding: '4px 8px', borderTop: '2px solid #1e9e63', overflow: 'hidden' }}>
                <div style={{
                  fontSize: 8.5, color: '#1a4a2e', lineHeight: 1.5, letterSpacing: '0.03em', whiteSpace: 'pre-wrap',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {item.afterDesc || '施工後の状況を記入してください。'}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {Array.from({ length: Math.max(0, 3 - items.length) }).map((_, i) => (
        <div key={`empty-${i}`} style={{ height: itemH, flexShrink: 0 }} />
      ))}

      <div style={{ flex: 1 }} />

      {/* フッター */}
      <div style={{
        height: footerH, borderTop: '1px solid #e0e0e0', padding: `0 ${sidePadding}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, color: '#aaa', fontFamily: SERIF, letterSpacing: '0.1em' }}>{contractor}</div>
        <div style={{ fontSize: 10, color: '#aaa', letterSpacing: '0.1em' }}>{projectName}</div>
      </div>
    </div>
  );
});

// ── 赤丸マーカー（PhotoPageのPhotoCircleMarkerと同等・ドラッグで移動）──
function BACircleMarker({ circle, isSelected, onSelect, onDragEnd }: {
  circle: Circle;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  const { position, onMouseDown, onTouchStart, dragging, containerRef } = useDraggablePin(circle.x, circle.y, onDragEnd);
  const size = Number(circle.size || 20);
  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => { e.stopPropagation(); onSelect(); onMouseDown(e); }}
      onTouchStart={(e) => { e.stopPropagation(); onSelect(); onTouchStart(e); }}
      onClick={(e) => e.stopPropagation()}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        width: `${size}%`,
        transform: 'translate(-50%, -50%)',
        border: '3.5px solid #ff2d20',
        boxShadow: '0 0 0 1.5px #fff, inset 0 0 0 1.5px #fff',
        touchAction: 'none',
        zIndex: isSelected ? 100 : (dragging ? 30 : 20),
      }}
      className={`absolute aspect-square rounded-full transition-all duration-75 ${dragging ? 'z-30 opacity-80' : 'cursor-pointer hover:bg-red-500/10'} ${isSelected && !dragging ? 'border-dashed bg-red-500/10' : ''}`}
    />
  );
}

// ── 入力フォームカード（1箇所分）─────────────────────
interface ItemCardProps {
  item: BeforeAfterItem;
  index: number;
  uploadingBefore: boolean;
  uploadingAfter: boolean;
  onChange: (field: keyof BeforeAfterItem, value: string) => void;
  onDelete: () => void;
  onImageUpload: (side: 'before' | 'after', dataUrl: string) => void | Promise<void>;
  onError: (msg: string) => void;
  onCirclesChange: (side: 'before' | 'after', circles: Circle[]) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}

const ItemCard = React.memo(function ItemCard({
  item, index,
  uploadingBefore, uploadingAfter,
  onChange, onDelete, onImageUpload, onError, onCirclesChange,
  onDragStart, onDragOver, onDrop,
}: ItemCardProps) {
  const num = '①②③④⑤⑥⑦⑧⑨⑩'[index] ?? `${index + 1}`;
  const [draggable, setDraggable] = useState(false);
  const [circleMode, setCircleMode] = useState<'before' | 'after' | null>(null);
  const [selectedCircleId, setSelectedCircleId] = useState<number | null>(null);

  const fileInputIds = useMemo(() => ({
    before: `file-before-${item.id}`,
    after:  `file-after-${item.id}`,
  }), [item.id]);

  const processFile = (side: 'before' | 'after', file: File) => {
    const reader = new FileReader();
    reader.onerror = () => {
      if (import.meta.env.DEV) console.error('[ItemCard] FileReader error:', reader.error);
      onError('ファイルの読み込みに失敗しました');
    };
    reader.onload = ev => {
      const src = ev.target?.result;
      if (typeof src !== 'string') {
        onError('ファイルの読み込みに失敗しました');
        return;
      }
      const img = new Image();
      img.onerror = () => {
        if (import.meta.env.DEV) console.error('[ItemCard] Image decode failed (unsupported format?)');
        onError('画像の処理に失敗しました。HEIC 等の未対応形式の可能性があります。JPEG/PNG でお試しください。');
      };
      img.onload = () => {
        try {
          const scale = Math.min(1, IMG_MAX_PX / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('canvas context unavailable');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', IMG_QUALITY);
          void onImageUpload(side, dataUrl);
        } catch (err) {
          if (import.meta.env.DEV) console.error('[ItemCard] processFile failed:', err);
          onError('画像の処理に失敗しました');
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleFile = (side: 'before' | 'after') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 同じファイルを再選択しても change イベントが飛ぶように
    e.target.value = '';
    if (!file) return;
    processFile(side, file);
  };

  const rotateImage = (side: 'before' | 'after') => {
    const isUp = side === 'before' ? uploadingBefore : uploadingAfter;
    if (isUp) return; // 連打防止
    const src = side === 'before' ? item.beforeImage : item.afterImage;
    if (!src) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => {
      if (import.meta.env.DEV) console.error('[ItemCard] rotateImage: img load failed');
      onError('画像の読み込みに失敗しました(CORS エラーの可能性があります)');
    };
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.height;
        canvas.height = img.width;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas context unavailable');
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        const dataUrl = canvas.toDataURL('image/jpeg', IMG_QUALITY);
        void onImageUpload(side, dataUrl);
      } catch (err) {
        if (import.meta.env.DEV) console.error('[ItemCard] rotateImage failed:', err);
        onError('画像の回転に失敗しました(CORS エラーの可能性があります)');
      }
    };
    img.src = src;
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    background: '#12122a', border: '1px solid #2e2e50',
    borderRadius: 8, color: '#f0ede8', fontSize: 13,
    outline: 'none', fontFamily: 'inherit',
  };
  const textareaStyle: React.CSSProperties = {
    ...inputStyle, resize: 'vertical', minHeight: 72, lineHeight: 1.7,
  };

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={() => setDraggable(false)}
      style={{
        background: '#1c1c30', border: '1px solid #2e2e50', borderRadius: 14,
        padding: 16, marginBottom: 12,
      }}
    >
      {/* カードヘッダー（ハンドル部分のみドラッグ可） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span
          onMouseDown={() => setDraggable(true)}
          onMouseUp={() => setDraggable(false)}
          onTouchStart={() => setDraggable(true)}
          onTouchEnd={() => setDraggable(false)}
          style={{
            cursor: 'grab', display: 'flex', alignItems: 'center',
            touchAction: 'none', padding: 2,
          }}
          title="ドラッグして並び替え"
          aria-label="ドラッグハンドル"
        >
          <GripVertical size={16} style={{ color: '#3d3d60' }} />
        </span>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#ff6b35', letterSpacing: '0.05em', flex: 1 }}>
          {num} 工事箇所
        </div>
        <button
          type="button"
          onClick={onDelete}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, borderRadius: 6 }}
          title="削除"
          aria-label="工事箇所を削除"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* タイトル */}
      <div style={{ marginBottom: 12 }}>
        <label
          htmlFor={`title-${item.id}`}
          style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 5, letterSpacing: '0.08em' }}
        >
          工事箇所名
        </label>
        <input
          id={`title-${item.id}`}
          type="text"
          value={item.title}
          onChange={e => onChange('title', e.target.value)}
          placeholder="例:下地板取替え・屋根下 化粧板"
          style={inputStyle}
        />
      </div>

      {/* 写真アップロード */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {(['before', 'after'] as const).map(side => {
          const isUp = side === 'before' ? uploadingBefore : uploadingAfter;
          const img = side === 'before' ? item.beforeImage : item.afterImage;
          const inputId = fileInputIds[side];
          return (
            <div key={side}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: side === 'before' ? '#aaa' : '#4ade80', letterSpacing: '0.08em', fontWeight: 600 }}>
                  {side === 'before' ? '📷 施工前' : '📷 施工後'}
                </span>
                {img && (
                  <button
                    type="button"
                    onClick={e => {
                      e.preventDefault(); e.stopPropagation();
                      setCircleMode(prev => prev === side ? null : side);
                      setSelectedCircleId(null);
                    }}
                    disabled={isUp}
                    style={{
                      background: circleMode === side ? '#ef4444' : 'rgba(255,255,255,.1)',
                      border: 'none', borderRadius: 6,
                      color: circleMode === side ? '#fff' : '#cdd5de',
                      cursor: isUp ? 'wait' : 'pointer',
                      padding: '3px 8px', fontSize: 11, fontWeight: 700, lineHeight: 1,
                    }}
                    title="赤丸を追加"
                    aria-label="赤丸モード切替"
                  >⭕</button>
                )}
              </div>
              <input
                id={inputId}
                type="file"
                accept="image/*"
                onChange={handleFile(side)}
                style={{ display: 'none' }}
                disabled={isUp}
              />
              {/* 写真表示エリア(タップでは何もしない。赤丸モード時のみ丸の追加/選択解除) */}
              <div
                onClick={e => {
                  if (circleMode !== side || !img) return;
                  if (selectedCircleId !== null) { setSelectedCircleId(null); return; }
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                  const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
                  const circles = side === 'before' ? (item.beforeCircles ?? []) : (item.afterCircles ?? []);
                  onCirclesChange(side, [...circles, { id: nextId(), x, y, size: 20 }]);
                }}
                style={{
                  display: 'flex',
                  cursor: isUp ? 'wait' : (circleMode === side ? 'crosshair' : 'default'),
                  aspectRatio: '4/3', borderRadius: 8, overflow: 'hidden',
                  border: circleMode === side ? '2px solid #ef4444' : `1.5px dashed ${side === 'before' ? '#3d3d60' : '#1a5e38'}`,
                  background: side === 'before' ? '#12122a' : '#0f1f15',
                  alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                  opacity: isUp ? 0.6 : 1,
                }}
              >
                {img ? (
                  <>
                    <img
                      src={img}
                      alt={side === 'before' ? '施工前写真' : '施工後写真'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); rotateImage(side); }}
                      disabled={isUp}
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 6,
                        color: '#fff', cursor: isUp ? 'wait' : 'pointer', padding: '3px 6px',
                        fontSize: 14, lineHeight: 1,
                      }}
                      title="90°回転"
                      aria-label="画像を90度回転"
                    >↻</button>
                    {(side === 'before' ? (item.beforeCircles ?? []) : (item.afterCircles ?? [])).map(circle => (
                      <BACircleMarker
                        key={circle.id}
                        circle={circle}
                        isSelected={circleMode === side && selectedCircleId === circle.id}
                        onSelect={() => { setCircleMode(side); setSelectedCircleId(circle.id); }}
                        onDragEnd={(x, y) => {
                          const circles = side === 'before' ? (item.beforeCircles ?? []) : (item.afterCircles ?? []);
                          onCirclesChange(side, circles.map(c => c.id === circle.id ? { ...c, x, y } : c));
                        }}
                      />
                    ))}
                    <label
                      htmlFor={inputId}
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: 'absolute', bottom: 4, right: 4,
                        background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 6,
                        color: '#fff', cursor: isUp ? 'wait' : 'pointer', padding: '3px 6px',
                        fontSize: 14, lineHeight: 1,
                      }}
                      title="写真を差し替え"
                      aria-label="写真を差し替え"
                    >📁</label>
                    {isUp && (
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      }}>
                        アップロード中…
                      </div>
                    )}
                  </>
                ) : (
                  <label
                    htmlFor={inputId}
                    style={{
                      width: '100%', height: '100%',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      cursor: isUp ? 'wait' : 'pointer', textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 4, opacity: 0.4 }}>+</div>
                    <div style={{ fontSize: 9, color: '#4b5563' }}>タップして選択</div>
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 赤丸サイズ調整・削除 */}
      {circleMode && selectedCircleId !== null && (() => {
        const circles = circleMode === 'before' ? (item.beforeCircles ?? []) : (item.afterCircles ?? []);
        const sel = circles.find(c => c.id === selectedCircleId);
        if (!sel) return null;
        const size = Number(sel.size || 20);
        const update = (newProps: Partial<Circle>) => {
          onCirclesChange(circleMode, circles.map(c => c.id === selectedCircleId ? { ...c, ...newProps } : c));
        };
        const remove = () => {
          onCirclesChange(circleMode, circles.filter(c => c.id !== selectedCircleId));
          setSelectedCircleId(null);
        };
        return (
          <div style={{ display: 'flex', alignItems: 'center', borderRadius: 8, overflow: 'hidden', border: '1px solid #3d3d60', marginBottom: 12 }}>
            <span style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#8b8ba8', padding: '0 8px' }}>赤丸サイズ</span>
            <input
              type="range"
              min={5}
              max={80}
              step={5}
              value={size}
              onChange={e => update({ size: Number(e.target.value) })}
              style={{ flex: 1, accentColor: '#ef4444', margin: '0 8px' }}
            />
            <button type="button" onClick={remove} aria-label="赤丸を削除" style={{ padding: '8px 14px', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}><Trash2 className="w-4 h-4" /></button>
          </div>
        );
      })()}

      {/* 説明テキスト */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label
            htmlFor={`before-desc-${item.id}`}
            style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 5, letterSpacing: '0.08em' }}
          >
            施工前の状況
          </label>
          <textarea
            id={`before-desc-${item.id}`}
            value={item.beforeDesc}
            onChange={e => onChange('beforeDesc', e.target.value)}
            placeholder="劣化・損傷の状態を記入"
            style={textareaStyle}
          />
        </div>
        <div>
          <label
            htmlFor={`after-desc-${item.id}`}
            style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 5, letterSpacing: '0.08em' }}
          >
            施工後の状態
          </label>
          <textarea
            id={`after-desc-${item.id}`}
            value={item.afterDesc}
            onChange={e => onChange('afterDesc', e.target.value)}
            placeholder="修繕内容・効果を記入"
            style={textareaStyle}
          />
        </div>
      </div>
    </div>
  );
});

// ── メインコンポーネント ──────────────────────────────
export function BeforeAfterPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'edit' | 'report'>('edit');
  const [projectName, setProjectName] = useState('');
  const [contractor, setContractor] = useState('');
  const [items, setItems] = useState<BeforeAfterItem[]>(() => [makeEmptyItem()]);

  // アップロード中キー（itemId:side）の集合 → 粒度の細かい UI 表示に
  const [uploadingKeys, setUploadingKeys] = useState<Set<string>>(new Set());
  const uploading = uploadingKeys.size > 0;

  const dragIndex = useRef<number | null>(null);
  const pendingDeletePaths = useRef<string[]>([]);
  const isDirty = useRef<boolean>(false);
  const sessionUploadedPaths = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const savedTimerRef = useRef<number | null>(null);

  // エラー自動消去（8秒）
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 8000);
    return () => clearTimeout(t);
  }, [error]);

  // Firestore ロード + クリーンアップ
  useEffect(() => {
    mountedRef.current = true;
    let aborted = false;

    (async () => {
      if (!id) { setLoading(false); return; }
      try {
        const d = await getDoc(doc(db, 'projects', id));
        if (aborted || !mountedRef.current) return;
        if (d.exists()) {
          const p = d.data();
          setProjectName(p.projectName ?? '');
          // canonical: contractorName / legacy fallback: contractor
          setContractor(getContractorName(p as { contractorName?: string; contractor?: string }));
          if (Array.isArray(p.beforeAfterItems) && p.beforeAfterItems.length) {
            setItems(p.beforeAfterItems);
          }
        }
      } catch (err) {
        logFirebaseError(err, 'プロジェクト読み込み');
        if (mountedRef.current) setError(firebaseErrorMessage(err, 'プロジェクト読み込み'));
      } finally {
        if (!aborted && mountedRef.current) setLoading(false);
      }
    })();

    return () => {
      aborted = true;
      mountedRef.current = false;
      // 保存タイマー停止
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
      // 未保存でアンマウント時のロールバック削除
      const uid = auth.currentUser?.uid;
      const pathsSnapshot = Array.from(sessionUploadedPaths.current);
      sessionUploadedPaths.current.clear();
      pathsSnapshot.forEach(p => {
        // サイズ減算込みで削除（orphan 対策）
        void deleteStorageFileWithAccounting(p, uid);
      });
    };
  }, [id]);

  // ブラウザ離脱警告（リロード・タブ閉じ時のみ。SPA 内遷移は戻るボタンで別途ガード）
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty.current) return;
      e.preventDefault();
      e.returnValue = ''; // Chrome で必須
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ── アイテム操作 ──
  const addItem = useCallback(() => {
    setItems(prev => [...prev, makeEmptyItem()]);
    isDirty.current = true;
  }, []);

  const deleteItem = useCallback((idx: number) => {
    const target = items[idx];
    if (!target) return;
    const hasContent = target.title || target.beforeDesc || target.afterDesc
      || target.beforeImage || target.afterImage;
    if (hasContent && !window.confirm('この工事箇所を削除します。よろしいですか?')) {
      return;
    }
    // Storage 削除予約（保存時にまとめて実行）
    [target.beforeImage, target.afterImage].forEach(url => {
      if (isStorageUrl(url)) {
        const p = storagePathFromUrl(url);
        if (p) pendingDeletePaths.current.push(p);
      }
    });
    isDirty.current = true;
    setItems(prev => {
      const next = prev.filter((_, i) => i !== idx);
      // 最後の1件を消した場合は空カードを補充（プレビューが消えないように）
      return next.length === 0 ? [makeEmptyItem()] : next;
    });
    // W2: 削除したアイテムのアップロード状態をクリア
    setUploadingKeys(prev => {
      const next = new Set(prev);
      next.delete(`${target.id}:before`);
      next.delete(`${target.id}:after`);
      return next;
    });
  }, [items]);

  const updateItem = useCallback((idx: number, field: keyof BeforeAfterItem, value: string) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
    isDirty.current = true;
  }, []);

  const updateItemCircles = useCallback((idx: number, side: 'before' | 'after', circles: Circle[]) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [side === 'before' ? 'beforeCircles' : 'afterCircles']: circles } : it)));
    isDirty.current = true;
  }, []);

  // ── DnD ──
  const handleDragStart = useCallback((idx: number) => (e: React.DragEvent) => {
    dragIndex.current = idx;
    // Firefox は setData を呼ばないとドラッグが開始しない
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch { /* noop */ }
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((idx: number) => () => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === idx) return;
    setItems(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    isDirty.current = true;
  }, []);

  // ── アップロード（itemId ベースで stale closure 回避）──
  const uploadImage = useCallback(async (
    itemId: string,
    side: 'before' | 'after',
    dataUrl: string,
  ): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid || !id) return;
    const key = `${itemId}:${side}`;
    setUploadingKeys(prev => { const n = new Set(prev); n.add(key); return n; });
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      // 容量チェック
      const userSnap = await getDoc(doc(db, 'users', uid));
      const usedBytes = userSnap.data()?.storageUsedBytes ?? 0;
      if (!canUpload(usedBytes, blob.size)) {
        if (mountedRef.current) setError('ストレージ容量が不足しています。');
        return;
      }
      const path = `users/${uid}/projects/${id}/beforeafter/${itemId}_${side}.jpg`;
      const storageRef = ref(storage, path);
      let downloadUrl = '';
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) await new Promise(res => setTimeout(res, 1000 * attempt));
          await uploadBytes(storageRef, blob);
          downloadUrl = await getDownloadURL(storageRef);
          lastErr = null;
          break;
        } catch (err) { lastErr = err; }
      }
      if (lastErr) throw lastErr;
      await trackUpload(uid, blob.size);
      sessionUploadedPaths.current.add(path);
      if (!mountedRef.current) return;
      // 並び替え直後でも id で参照するため stale にならない
      setItems(prev => prev.map(it =>
        it.id === itemId
          ? { ...it, [side === 'before' ? 'beforeImage' : 'afterImage']: downloadUrl }
          : it,
      ));
      isDirty.current = true;
    } catch (err) {
      logFirebaseError(err, '画像アップロード');
      if (mountedRef.current) setError(firebaseErrorMessage(err, '画像アップロード'));
    } finally {
      if (mountedRef.current) {
        setUploadingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
      }
    }
  }, [id]);

  // ── 保存 ──
  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const uid = auth.currentUser?.uid;
      let migrationFailed = false;

      // base64 残存データを Storage に移行
      const migratedItems = await Promise.all(items.map(async (item) => {
        let beforeImage = item.beforeImage;
        let afterImage = item.afterImage;

        if (uid && beforeImage.startsWith('data:')) {
          try {
            const blob = await (await fetch(beforeImage)).blob();
            const r = ref(storage, `users/${uid}/projects/${id}/beforeafter/${item.id}_before.jpg`);
            await uploadBytes(r, blob);
            await trackUpload(uid, blob.size);
            sessionUploadedPaths.current.add(r.fullPath);
            beforeImage = await getDownloadURL(r);
          } catch (err) {
            logFirebaseError(err, `画像移行(施工前 / item=${item.id})`);
            migrationFailed = true;
          }
        }
        if (uid && afterImage.startsWith('data:')) {
          try {
            const blob = await (await fetch(afterImage)).blob();
            const r = ref(storage, `users/${uid}/projects/${id}/beforeafter/${item.id}_after.jpg`);
            await uploadBytes(r, blob);
            await trackUpload(uid, blob.size);
            sessionUploadedPaths.current.add(r.fullPath);
            afterImage = await getDownloadURL(r);
          } catch (err) {
            logFirebaseError(err, `画像移行(施工後 / item=${item.id})`);
            migrationFailed = true;
          }
        }
        return { ...item, beforeImage, afterImage };
      }));

      // Firestore 1MB 制限を踏まないよう、base64 残存があるなら保存中止
      const stillHasBase64 = migratedItems.some(it =>
        it.beforeImage.startsWith('data:') || it.afterImage.startsWith('data:'),
      );
      if (stillHasBase64) {
        if (mountedRef.current) {
          setItems(migratedItems); // 成功した分だけ反映
          setError('一部の画像のアップロードに失敗しました。通信環境を確認のうえ、再度保存してください。');
        }
        return;
      }

      if (mountedRef.current) setItems(migratedItems);
      await updateDoc(doc(db, 'projects', id), { beforeAfterItems: migratedItems });

      // 削除待ち Storage ファイルを処理（サイズ減算込み）
      const pathsToDelete = [...pendingDeletePaths.current];
      pendingDeletePaths.current = [];
      await Promise.allSettled(
        pathsToDelete.map(p => deleteStorageFileWithAccounting(p, uid)),
      );

      if (mountedRef.current) {
        setSaved(true);
        isDirty.current = false;
        sessionUploadedPaths.current.clear();
        // 前の timer を消してから新しく貼る
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = window.setTimeout(() => {
          if (mountedRef.current) setSaved(false);
          savedTimerRef.current = null;
        }, 2500);

        if (migrationFailed) {
          setError('一部の画像で問題が発生しました（ログをご確認ください）');
        }
      }
    } catch (err) {
      logFirebaseError(err, '保存');
      if (mountedRef.current) setError(firebaseErrorMessage(err, '保存'));
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  // ── ページ分割（メモ化して無駄な再計算を抑制）──
  const pages = useMemo(() => {
    const p: BeforeAfterItem[][] = [];
    for (let i = 0; i < items.length; i += 3) p.push(items.slice(i, i + 3));
    return p;
  }, [items]);

  // ── 戻る（未保存ガード）──
  const handleBack = useCallback(() => {
    if (isDirty.current && !window.confirm('保存されていない変更があります。戻りますか?')) return;
    navigate(`/project/${id}`);
  }, [navigate, id]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen font-sans" style={{ background: '#0f0f1a', color: '#f0ede8' }}>
      {/* 印刷時スタイル（window.print() / PDF 書き出し対応の土台）*/}
      <style>{`
        .a4-print-only { display: none; }
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .a4-preview-wrap { transform: none !important; margin: 0 !important; }
          .a4-print-only { display: block !important; }
          .a4-preview-wrap { display: none !important; }
          .a4-page { page-break-after: always; box-shadow: none !important; }
          .a4-page:last-child { page-break-after: auto; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pt-4 pb-16">

        {/* ヘッダー */}
        <div className="flex items-center justify-between py-5 no-print" style={{ gap: 8 }}>
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-2 text-sm font-bold"
            style={{ color: '#8b8ba8' }}
            onPointerEnter={e => (e.currentTarget.style.color = '#ff6b35')}
            onPointerLeave={e => (e.currentTarget.style.color = '#8b8ba8')}
          >
            <ArrowLeft className="w-4 h-4" />
            現場ホーム
          </button>

          {/* 編集 / 報告書 切替 */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,.08)', borderRadius: 11, padding: 3 }}>
            {(['edit', 'report'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                style={{
                  border: 'none', borderRadius: 9, padding: '7px 16px',
                  fontSize: 13, fontWeight: 700,
                  background: view === k ? '#fff' : 'transparent',
                  color: view === k ? '#161b21' : '#aeb8c2',
                  cursor: 'pointer',
                  transition: 'background .15s, color .15s',
                }}
              >
                {k === 'edit' ? '編集' : '報告書'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {view === 'report' && (
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  border: 'none', borderRadius: 8, padding: '8px 14px',
                  fontSize: 13, fontWeight: 700,
                  background: 'rgba(255,255,255,.12)', color: '#f0ede8',
                  cursor: 'pointer',
                }}
              >
                🖨 印刷/PDF
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={uploading || saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold"
              style={{
                background: saved ? '#10b981' : '#ff6b35',
                color: '#fff',
                opacity: uploading || saving ? 0.7 : 1,
                cursor: uploading || saving ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading && (
                <span style={{ fontSize: 11, color: '#fbbf24', marginRight: 8 }}>
                  画像アップロード中…
                </span>
              )}
              <Save className="w-4 h-4" />
              {saving ? '保存中…' : saved ? '保存済み ✓' : '保存'}
            </button>
          </div>
        </div>

        {error && (
          <div
            className="no-print"
            style={{
              background: '#3a1010', border: '1px solid #7a2020', borderRadius: 8,
              padding: '10px 14px', marginBottom: 16, color: '#f87171', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
            role="alert"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              aria-label="エラーを閉じる"
            >✕</button>
          </div>
        )}

        {/* 編集ビュー */}
        {view === 'edit' && (
          <div className="w-full flex flex-col gap-0 no-print">
            {items.map((item, idx) => (
              <ItemCard
                key={item.id}
                item={item}
                index={idx}
                uploadingBefore={uploadingKeys.has(`${item.id}:before`)}
                uploadingAfter={uploadingKeys.has(`${item.id}:after`)}
                onChange={(f, v) => updateItem(idx, f, v)}
                onDelete={() => deleteItem(idx)}
                onImageUpload={(side, dataUrl) => uploadImage(item.id, side, dataUrl)}
                onError={setError}
                onCirclesChange={(side, circles) => updateItemCircles(idx, side, circles)}
                onDragStart={handleDragStart(idx)}
                onDragOver={handleDragOver}
                onDrop={handleDrop(idx)}
              />
            ))}
            <button
              type="button"
              onClick={addItem}
              disabled={uploading || saving}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold border-2 border-dashed transition-colors"
              style={{
                borderColor: '#2e2e50', color: '#6b7280',
                opacity: uploading || saving ? 0.7 : 1,
                cursor: uploading || saving ? 'not-allowed' : 'pointer',
              }}
              onPointerEnter={e => {
                e.currentTarget.style.borderColor = '#ff6b35';
                e.currentTarget.style.color = '#ff6b35';
              }}
              onPointerLeave={e => {
                e.currentTarget.style.borderColor = '#2e2e50';
                e.currentTarget.style.color = '#6b7280';
              }}
            >
              <Plus className="w-4 h-4" />
              工事箇所を追加
            </button>
          </div>
        )}

        {/* 報告書ビュー（＋印刷専用 hidden コンテナ） */}
        {view === 'report' && (
          <div className="flex flex-col gap-6 items-center">
            <div className="no-print" style={{ fontSize: 11, color: '#4b5563', letterSpacing: '0.1em' }}>
              A4 プレビュー（{pages.length}ページ）
            </div>
            {pages.map((pageItems, pi) => (
              <div
                key={pi}
                className="a4-preview-wrap"
                style={{
                  transform: 'scale(0.85)',
                  transformOrigin: 'top center',
                  marginBottom: `calc(${H}px * 0.85 - ${H}px)`,
                }}
              >
                <A4Page
                  items={pageItems}
                  pageIndex={pi}
                  totalPages={pages.length}
                  projectName={projectName}
                  contractor={contractor}
                />
              </div>
            ))}
          </div>
        )}

        {/* 印刷専用コンテナ（編集ビュー表示中に Cmd+P された場合も正しく印刷されるよう常にDOMに存在） */}
        <div className="a4-print-only">
          {pages.map((pageItems, pi) => (
            <A4Page
              key={pi}
              items={pageItems}
              pageIndex={pi}
              totalPages={pages.length}
              projectName={projectName}
              contractor={contractor}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
