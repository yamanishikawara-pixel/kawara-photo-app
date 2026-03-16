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

// ★修正：毎回ランダムな暗号をつけるのをやめ、写真ごとの固定IDを使うようにしました（これで真っ白バグが直ります）
export const proxyUrl = (url: string, id: string | number) =>
  url ? `${url}${url.includes('?') ? '&' : '?'}cb=${id}` : '';

function isJpegFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg')
  );
}

function getExifOrientationFromJpeg(arrayBuffer: ArrayBuffer): number | undefined {
  // JPEG EXIF (APP1) の Orientation(0x0112) を読む（最小限）
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 12) return undefined;
  if (view.getUint16(0, false) !== 0xffd8) return undefined; // SOI

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;
    if (marker === 0xffd9 || marker === 0xffda) break; // EOI / SOS
    const size = view.getUint16(offset, false);
    offset += 2;
    if (size < 2 || offset + (size - 2) > view.byteLength) break;

    if (marker === 0xffe1) {
      // APP1
      if (
        offset + 6 <= view.byteLength &&
        view.getUint32(offset, false) === 0x45786966 && // "Exif"
        view.getUint16(offset + 4, false) === 0x0000
      ) {
        const tiffStart = offset + 6;
        if (tiffStart + 8 > view.byteLength) return undefined;
        const endian = view.getUint16(tiffStart, false);
        const little = endian === 0x4949; // "II"
        if (!little && endian !== 0x4d4d) return undefined; // "MM"
        if (view.getUint16(tiffStart + 2, little) !== 0x002a) return undefined;
        const ifd0Offset = view.getUint32(tiffStart + 4, little);
        let ifdOffset = tiffStart + ifd0Offset;
        if (ifdOffset + 2 > view.byteLength) return undefined;
        const entries = view.getUint16(ifdOffset, little);
        ifdOffset += 2;
        for (let i = 0; i < entries; i++) {
          const entryOffset = ifdOffset + i * 12;
          if (entryOffset + 12 > view.byteLength) break;
          const tag = view.getUint16(entryOffset, little);
          if (tag !== 0x0112) continue; // Orientation
          const type = view.getUint16(entryOffset + 2, little);
          const count = view.getUint32(entryOffset + 4, little);
          if (type === 3 && count === 1) return view.getUint16(entryOffset + 8, little);
          return undefined;
        }
      }
      return undefined;
    }

    offset += size - 2;
  }
  return undefined;
}

function drawImageWithOrientation(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  outW: number,
  outH: number,
  orientation: number,
) {
  // 1=normal, 3=180, 6=90CW, 8=270CW を主にサポート
  switch (orientation) {
    case 3:
      ctx.translate(outW, outH);
      ctx.rotate(Math.PI);
      ctx.drawImage(img, 0, 0, outW, outH);
      return;
    case 6:
      ctx.translate(outW, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0, outH, outW);
      return;
    case 8:
      ctx.translate(0, outH);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, 0, 0, outH, outW);
      return;
    default:
      ctx.drawImage(img, 0, 0, outW, outH);
  }
}

async function getOrientation(file: File): Promise<number> {
  if (!isJpegFile(file)) return 1;
  try {
    const buf = await file.arrayBuffer();
    return getExifOrientationFromJpeg(buf) ?? 1;
  } catch {
    return 1;
  }
}

export function compressImage(
  file: File,
  callback: (compressedFile: File) => void,
) {
  const safeCallback = (f: File) => {
    try {
      callback(f);
    } catch {
      // ignore callback errors
    }
  };

  if (!file.type.startsWith('image/')) {
    safeCallback(file);
    return;
  }

  // EXIFの向き（回転）を反映してから描画したい。
  // createImageBitmap({ imageOrientation: 'from-image' }) が使える環境では、
  // 向き補正済みの bitmap を得られるので、それを優先する。
  if (typeof createImageBitmap === 'function') {
    (async () => {
      try {
        const bitmap = await createImageBitmap(file, {
          // TS lib / Safari などの差分吸収のため any に落とす
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          imageOrientation: 'from-image',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        let width = bitmap.width;
        let height = bitmap.height;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          bitmap.close?.();
          safeCallback(file);
          return;
        }
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              safeCallback(file);
              return;
            }
            safeCallback(
              new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: file.lastModified,
              }),
            );
          },
          'image/jpeg',
          0.8,
        );
      } catch {
        // fallback to FileReader path below
        //（iOS等でcreateImageBitmapの向き補正が効かない場合があるので、EXIFを手動で補正する）
        const orientation = await getOrientation(file);
        const reader = new FileReader();
        reader.onerror = () => safeCallback(file);
        reader.onload = (e) => {
          const img = new Image();
          img.onerror = () => safeCallback(file);
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const rotated = orientation === 6 || orientation === 8;
            const baseW = rotated ? img.height : img.width;
            const baseH = rotated ? img.width : img.height;
            let outW = baseW;
            let outH = baseH;
            if (outW > MAX_WIDTH) {
              outH = Math.round((outH * MAX_WIDTH) / outW);
              outW = MAX_WIDTH;
            }
            canvas.width = outW;
            canvas.height = outH;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              safeCallback(file);
              return;
            }
            ctx.save();
            drawImageWithOrientation(ctx, img, outW, outH, orientation);
            ctx.restore();
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  safeCallback(file);
                  return;
                }
                safeCallback(
                  new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: file.lastModified,
                  }),
                );
              },
              'image/jpeg',
              0.8,
            );
          };
          if (typeof e.target?.result === 'string') img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    })();
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => safeCallback(file);
  reader.onload = (e) => {
    const img = new Image();
    img.onerror = () => safeCallback(file);
    img.onload = () => {
      (async () => {
        const orientation = await getOrientation(file);
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const rotated = orientation === 6 || orientation === 8;
        const baseW = rotated ? img.height : img.width;
        const baseH = rotated ? img.width : img.height;
        let outW = baseW;
        let outH = baseH;
        if (outW > MAX_WIDTH) {
          outH = Math.round((outH * MAX_WIDTH) / outW);
          outW = MAX_WIDTH;
        }
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          safeCallback(file);
          return;
        }
        ctx.save();
        drawImageWithOrientation(ctx, img, outW, outH, orientation);
        ctx.restore();
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              safeCallback(file);
              return;
            }
            safeCallback(
              new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: file.lastModified,
              }),
            );
          },
          'image/jpeg',
          0.8,
        );
      })();
    };
    if (typeof e.target?.result === 'string') img.src = e.target.result;
  };
  reader.readAsDataURL(file);
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

