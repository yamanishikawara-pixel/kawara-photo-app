import type { Circle, DimensionLine } from '../types';

/**
 * 写真URL + 赤丸 + 寸法線をCanvasに描画してDataURLを返す。
 * CORSを自前で処理するため html2canvas 不要。
 */
export async function renderAnnotatedPhoto(
  imageUrl: string,
  circles: Circle[],
  dimensionLines: DimensionLine[],
  rotation: number,
  targetW = 480,
  targetH = 340,
): Promise<string> {
  const img = await loadImageWithCORS(imageUrl);

  // 回転後の論理サイズ
  const isRotated90 = rotation % 180 !== 0;
  const logicW = isRotated90 ? img.naturalHeight : img.naturalWidth;
  const logicH = isRotated90 ? img.naturalWidth : img.naturalHeight;

  // targetW × targetH に収まるスケール
  const scale = Math.min(targetW / logicW, targetH / logicH);
  const drawW = logicW * scale;
  const drawH = logicH * scale;

  const canvas = document.createElement('canvas');
  canvas.width = drawW;
  canvas.height = drawH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, drawW, drawH);

  // 回転を考慮して画像を描画
  ctx.save();
  ctx.translate(drawW / 2, drawH / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  if (isRotated90) {
    ctx.drawImage(img, -drawH / 2, -drawW / 2, drawH, drawW);
  } else {
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  }
  ctx.restore();

  // 赤丸
  for (const c of circles) {
    const cx = (c.x / 100) * drawW;
    const cy = (c.y / 100) * drawH;
    const r = ((c.size || 20) / 100) * Math.min(drawW, drawH);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.stroke();
  }

  // 寸法線
  for (const line of dimensionLines) {
    const x1 = (line.start.x / 100) * drawW;
    const y1 = (line.start.y / 100) * drawH;
    const x2 = (line.end.x / 100) * drawW;
    const y2 = (line.end.y / 100) * drawH;
    const color = line.color || '#FFD700';
    const lw = Math.max(1, (line.size || 2));

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();

    // 矢印
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowLen = 8;
    for (const [ex, ey, ea] of [[x2, y2, angle], [x1, y1, angle + Math.PI]] as [number, number, number][]) {
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - arrowLen * Math.cos(ea - 0.4), ey - arrowLen * Math.sin(ea - 0.4));
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - arrowLen * Math.cos(ea + 0.4), ey - arrowLen * Math.sin(ea + 0.4));
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.stroke();
    }

    // テキスト
    if (line.text) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const fs = 12;
      ctx.font = `bold ${fs}px sans-serif`;
      const tw = ctx.measureText(line.text).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(mx - tw / 2 - 3, my - fs, tw + 6, fs + 4);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(line.text, mx, my - fs / 2 + 2);
    }
  }

  canvas.width; // flush
  return canvas.toDataURL('image/jpeg', 0.88);
}

function loadImageWithCORS(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // CORSが失敗したらcrossOriginなしで再試行（アノテーションなし）
      const fallback = new Image();
      fallback.onload = () => resolve(fallback);
      fallback.onerror = reject;
      fallback.src = url + (url.includes('?') ? '&' : '?') + 'nocors=1';
    };
    img.src = url;
  });
}
