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

export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;

export function getPreviewScale(paddingPx = 32): number {
  const availableWidth = typeof window !== 'undefined' ? window.innerWidth - paddingPx : A4_WIDTH_PX;
  return Math.min(1, availableWidth / A4_WIDTH_PX);
}

export const proxyUrl = (url: string, id: string | number) =>
  url ? `${url}${url.includes('?') ? '&' : '?'}cb=${id}` : '';

// ★高画質設定（1600px, 85%）
const MAX_WIDTH = 1600; 
const QUALITY = 0.85;   

function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

// ★PCがフリーズする原因（FileReader）を捨て、超軽量で瞬間読み込みできるルートに完全変更
function processImageToJpeg(file: File, callback: (f: File) => void) {
  const img = new Image();
  // メモリを全く消費せずに画像を読み込む最強の仕組み
  const objectUrl = URL.createObjectURL(file);

  // 万が一エラーが起きてもフリーズさせず、元の画像をそのまま返す安全設計
  img.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    callback(file);
  };

  img.onload = () => {
    // 読み込み終わったらすぐにメモリを解放！
    URL.revokeObjectURL(objectUrl);
    
    let outW = img.width;
    let outH = img.height;
    
    if (outW > MAX_WIDTH) {
      outH = Math.round((outH * MAX_WIDTH) / outW);
      outW = MAX_WIDTH;
    }

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      callback(file);
      return;
    }

    ctx.drawImage(img, 0, 0, outW, outH);
    
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          callback(file);
          return;
        }
        const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
        callback(new File([blob], newName, { type: 'image/jpeg', lastModified: file.lastModified }));
      },
      'image/jpeg',
      QUALITY
    );
  };

  img.src = objectUrl;
}

export function compressImage(
  file: File,
  callback: (compressedFile: File) => void,
) {
  const safeCallback = (f: File) => {
    try { callback(f); } catch {}
  };

  if (!file.type.startsWith('image/')) {
    safeCallback(file);
    return;
  }

  // iPhone高効率画像（HEIC）の対応
  if (isHeicFile(file)) {
    (async () => {
      try {
        if (typeof window === 'undefined' || typeof Worker === 'undefined') {
          processImageToJpeg(file, safeCallback);
          return;
        }
        const { default: heic2any } = await import('heic2any');
        const converted = (await heic2any({ blob: file, toType: 'image/jpeg', quality: QUALITY })) as Blob | Blob[];
        const blob = Array.isArray(converted) ? converted[0] : converted;
        const jpegFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg', lastModified: file.lastModified });
        processImageToJpeg(jpegFile, safeCallback);
      } catch {
        processImageToJpeg(file, safeCallback);
      }
    })();
    return;
  }

  // ★通常画像（パソコンからのアップロードなど）の処理
  processImageToJpeg(file, safeCallback);
}

// -----------------------------------------------------
// 以下、マップのピンをドラッグするための機能（変更なし）
// -----------------------------------------------------
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