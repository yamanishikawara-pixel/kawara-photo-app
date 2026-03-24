import type { MouseEvent as RMouseEvent, TouchEvent as RTouchEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

export const ROOF_PARTS = [
  '本棟',
  '隅棟',
  '軒先',
  '袖右',
  '袖左',
  '平部',
  '流れ壁',
  '平行壁',
  '谷',
  'その他',
];

export const PROCESS_SNIPPETS = ['施工前', '施工確認', '施工後'];

export const DESC_SNIPPETS = [
  '基準値：',
  '実測値：',
  '雪害による瓦割れ',
  '凍害による剥離',
  '漆喰の劣化・剥がれ',
  '瓦のズレ修正',
  'ビス打ち補強',
  '清掃・片付け',
];

/** A4サイズのピクセル幅（96dpi想定: 210mm ≒ 794px） */
export const A4_WIDTH_PX = 794;
/** A4サイズのピクセル高さ（96dpi想定: 297mm ≒ 1123px） */
export const A4_HEIGHT_PX = 1123;

/**
 * プレビュー用の scale を算出する（画面幅に収める）
 * @param paddingPx 左右の余白合計（デフォルト 32）
 */
export function getPreviewScale(paddingPx = 32): number {
  const availableWidth = typeof window !== 'undefined' ? window.innerWidth - paddingPx : A4_WIDTH_PX;
  return Math.min(1, availableWidth / A4_WIDTH_PX);
}

// 毎回ランダムな暗号をつけるのをやめ、写真ごとの固定IDを使うようにしました（これで真っ白バグが直ります）
export const proxyUrl = (url: string, id: string | number) =>
  url ? `${url}${url.includes('?') ? '&' : '?'}cb=${id}` : '';

// ★画質とサイズの黄金比設定
const QUALITY = 0.85; 
const MAX_WIDTH = 1600; 

function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

// ★iPhoneの二重回転バグを防ぐため、ブラウザ標準機能を利用した安全な圧縮処理に統合
function safeImageToJpeg(
  file: File,
  callback: (jpeg: File) => void,
  fallback: () => void,
) {
  const reader = new FileReader();
  reader.onerror = fallback;
  reader.onload = (e) => {
    const img = new Image();
    img.onerror = fallback;
    img.onload = () => {
      const canvas = document.createElement('canvas');

      let outW = img.width;
      let outH = img.height;
      if (outW > MAX_WIDTH) {
        outH = Math.round((outH * MAX_WIDTH) / outW);
        outW = MAX_WIDTH;
      }

      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        fallback();
        return;
      }
      
      // ブラウザがEXIFを自動解釈して正しい向きで描画してくれます
      ctx.drawImage(img, 0, 0, outW, outH);
      
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            fallback();
            return;
          }
          const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
          callback(
            new File([blob], newName, {
              type: 'image/jpeg',
              lastModified: file.lastModified,
            }),
          );
        },
        'image/jpeg',
        QUALITY,
      );
    };
    if (typeof e.target?.result === 'string') img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function compressImageImpl(
  file: File,
  callback: (compressedFile: File) => void,
) {
  const safeCallback = (f: File) => {
    try {
      callback(f);
    } catch {
      // ignore
    }
  };

  if (!file.type.startsWith('image/')) {
    safeCallback(file);
    return;
  }

  if (isHeicFile(file)) {
    (async () => {
      try {
        if (typeof window === 'undefined' || typeof Worker === 'undefined') {
          safeImageToJpeg(file, safeCallback, () => safeCallback(file));
          return;
        }

        const { default: heic2any } = await import('heic2any');
        const converted = (await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.92,
        })) as Blob | Blob[];
        const blob = Array.isArray(converted) ? converted[0] : converted;
        const jpegFile = new File(
          [blob],
          file.name.replace(/\.(heic|heif)$/i, '.jpg'),
          { type: 'image/jpeg', lastModified: file.lastModified },
        );
        safeImageToJpeg(jpegFile, safeCallback, () => safeCallback(file));
      } catch {
        safeImageToJpeg(file, safeCallback, () => safeCallback(file));
      }
    })();
    return;
  }

  safeImageToJpeg(file, safeCallback, () => safeCallback(file));
}

export function compressImage(
  file: File,
  callback: (compressedFile: File) => void,
) {
  compressImageImpl(file, callback);
}

export function useDraggablePin(
  initialX: number,
  initialY: number,
  onDragEnd: (x: number, y: number) => void,
) {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const elementStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onDragEndRef = useRef(onDragEnd);
  const positionRef = useRef({ x: initialX, y: initialY });
  onDragEndRef.current = onDragEnd;
  positionRef.current = position;

  useEffect(() => {
    if (dragging) return;
    const next = { x: initialX, y: initialY };
    positionRef.current = next;
    setPosition(next);
  }, [initialX, initialY, dragging]);

  const handleStart = (clientX: number, clientY: number) => {
    setDragging(true);
    dragStart.current = { x: clientX, y: clientY };
    elementStart.current = { x: position.x, y: position.y };
  };

  const onMouseDown = (e: RMouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    handleStart(e.clientX, e.clientY);
  };

  const onTouchStart = (e: RTouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const t = e.touches[0];
    if (!t) return;
    handleStart(t.clientX, t.clientY);
  };

  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!containerRef.current || !containerRef.current.parentElement) return;
      const parentRect =
        containerRef.current.parentElement.getBoundingClientRect();
      if (!parentRect.width || !parentRect.height) return;
      const dx = clientX - dragStart.current.x;
      const dy = clientY - dragStart.current.y;

      const newX = elementStart.current.x + (dx / parentRect.width) * 100;
      const newY = elementStart.current.y + (dy / parentRect.height) * 100;

      const next = {
        x: Math.max(0, Math.min(100, newX)),
        y: Math.max(0, Math.min(100, newY)),
      };
      positionRef.current = next;
      setPosition(next);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (dragging) handleMove(e.clientX, e.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (dragging) {
        e.preventDefault();
        const t = e.touches[0];
        if (!t) return;
        handleMove(t.clientX, t.clientY);
      }
    };

    const onEnd = () => {
      if (dragging) {
        setDragging(false);
        onDragEndRef.current(positionRef.current.x, positionRef.current.y);
      }
    };

    if (dragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchend', onEnd);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchend', onEnd);
    };
  }, [dragging]);

  return { position, onMouseDown, onTouchStart, dragging, containerRef };
}