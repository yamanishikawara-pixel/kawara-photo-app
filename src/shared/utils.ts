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

// ★現場のメジャーの目盛りが読める最高画質設定！
const MAX_WIDTH = 1600; 
const QUALITY = 0.85;   

function isJpegFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg')
  );
}

function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

function imageFileToJpegViaImgElement(
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
      ctx.drawImage(img, 0, 0, outW, outH);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            fallback();
            return;
          }
          callback(
            new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
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

function getExifOrientationFromJpeg(arrayBuffer: ArrayBuffer): number | undefined {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 12) return undefined;
  if (view.getUint16(0, false) !== 0xffd8) return undefined;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;
    if (marker === 0xffd9 || marker === 0xffda) break;
    const size = view.getUint16(offset, false);
    offset += 2;
    if (size < 2 || offset + (size - 2) > view.byteLength) break;

    if (marker === 0xffe1) {
      if (
        offset + 6 <= view.byteLength &&
        view.getUint32(offset, false) === 0x45786966 && 
        view.getUint16(offset + 4, false) === 0x0000
      ) {
        const tiffStart = offset + 6;
        if (tiffStart + 8 > view.byteLength) return undefined;
        const endian = view.getUint16(tiffStart, false);
        const little = endian === 0x4949; 
        if (!little && endian !== 0x4d4d) return undefined; 
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
          if (tag !== 0x0112) continue; 
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
  switch (orientation) {
    case 2:
      ctx.translate(outW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, outW, outH);
      return;
    case 3:
      ctx.translate(outW, outH);
      ctx.rotate(Math.PI);
      ctx.drawImage(img, 0, 0, outW, outH);
      return;
    case 4:
      ctx.translate(0, outH);
      ctx.scale(1, -1);
      ctx.drawImage(img, 0, 0, outW, outH);
      return;
    case 5:
      ctx.rotate(Math.PI / 2);
      ctx.scale(1, -1);
      ctx.drawImage(img, 0, 0, outH, outW);
      return;
    case 6:
      ctx.translate(outW, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0, outH, outW);
      return;
    case 7:
      ctx.translate(outW, outH);
      ctx.rotate(Math.PI / 2);
      ctx.scale(-1, 1);
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
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result;
      if (buf instanceof ArrayBuffer) {
        const o = getExifOrientationFromJpeg(buf);
        resolve(o ?? 1);
      } else {
        resolve(1);
      }
    };
    reader.onerror = () => resolve(1);
    reader.readAsArrayBuffer(file);
  });
}

function compressImageImpl(
  file: File,
  callback: (compressedFile: File) => void,
  opts?: { skipExifOrientation?: boolean },
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
          imageFileToJpegViaImgElement(
            file,
            (jpeg) => compressImageImpl(jpeg, callback, { skipExifOrientation: true }),
            () => safeCallback(file),
          );
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
        compressImageImpl(jpegFile, callback, { skipExifOrientation: true });
      } catch {
        imageFileToJpegViaImgElement(
          file,
          (jpeg) => compressImageImpl(jpeg, callback, { skipExifOrientation: true }),
          () => safeCallback(file),
        );
      }
    })();
    return;
  }

  // ★PC・iPadでの高速・安定処理（一番最初の安定していたコードそのままです！）
  if (typeof createImageBitmap === 'function') {
    (async () => {
      try {
        const orientation = opts?.skipExifOrientation ? 1 : await getOrientation(file);
        const bitmap = await createImageBitmap(file, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          imageOrientation: 'none',
        } as any);

        const canvas = document.createElement('canvas');
        const rotated =
          orientation === 5 ||
          orientation === 6 ||
          orientation === 7 ||
          orientation === 8;
        const baseW = rotated ? bitmap.height : bitmap.width;
        const baseH = rotated ? bitmap.width : bitmap.height;
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
          bitmap.close?.();
          safeCallback(file);
          return;
        }
        ctx.save();
        drawImageWithOrientation(ctx, bitmap, outW, outH, orientation);
        ctx.restore();
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
          QUALITY,
        );
      } catch {
        const orientation = opts?.skipExifOrientation ? 1 : await getOrientation(file);
        const reader = new FileReader();
        reader.onerror = () => safeCallback(file);
        reader.onload = (e) => {
          const img = new Image();
          img.onerror = () => safeCallback(file);
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const rotated =
              orientation === 5 ||
              orientation === 6 ||
              orientation === 7 ||
              orientation === 8;
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
              QUALITY,
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
        const orientation = opts?.skipExifOrientation ? 1 : await getOrientation(file);
        const canvas = document.createElement('canvas');
        const rotated =
          orientation === 5 ||
          orientation === 6 ||
          orientation === 7 ||
          orientation === 8;
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
          QUALITY,
        );
      })();
    };
    if (typeof e.target?.result === 'string') img.src = e.target.result;
  };
  reader.readAsDataURL(file);
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