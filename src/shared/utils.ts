import type { MouseEvent as RMouseEvent, TouchEvent as RTouchEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

// ==========================================
// 定義・定数群
// ==========================================
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

// Firebaseのキャッシュ回避用URLプロキシ
export const proxyUrl = (url: string, id: string | number) =>
  url ? `${url}${url.includes('?') ? '&' : '?'}cb=${id}` : '';

// ==========================================
// マップのピンをドラッグするための機能
// ==========================================
export function useDraggablePin(
  initialX: number,
  initialY: number,
  onDragEnd: (x: number, y: number) => void,
  rotation: number = 0,
) {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const elementStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // onDragEndが毎回変わってもuseEffectが再実行されないようにrefで保持
  const onDragEndRef = useRef(onDragEnd);
  const positionRef = useRef({ x: initialX, y: initialY });

  useEffect(() => {
    onDragEndRef.current = onDragEnd;
  }, [onDragEnd]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // 外部からの更新（他のピンを操作した時など）を同期
  useEffect(() => {
    if (dragging) return;
    const next = { x: initialX, y: initialY };
    positionRef.current = next;
    const frame = requestAnimationFrame(() => setPosition(next));
    return () => cancelAnimationFrame(frame);
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
      const parentRect = containerRef.current.parentElement.getBoundingClientRect();
      if (!parentRect.width || !parentRect.height) return;

      const dxScreen = clientX - dragStart.current.x;
      const dyScreen = clientY - dragStart.current.y;

      // 回転角に応じてスクリーン座標のデルタをローカル座標に変換
      const normAngle = ((rotation % 360) + 360) % 360;
      let dx = dxScreen, dy = dyScreen;
      let w = parentRect.width, h = parentRect.height;
      if (normAngle === 90)  { dx = dyScreen;  dy = -dxScreen; w = parentRect.height; h = parentRect.width; }
      else if (normAngle === 180) { dx = -dxScreen; dy = -dyScreen; }
      else if (normAngle === 270) { dx = -dyScreen; dy = dxScreen;  w = parentRect.height; h = parentRect.width; }

      const newX = elementStart.current.x + (dx / w) * 100;
      const newY = elementStart.current.y + (dy / h) * 100;

      // 0〜100%の間に収める（画面外にはみ出さないようにする）
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
        e.preventDefault(); // スクロールを防止
        const t = e.touches[0];
        if (!t) return;
        handleMove(t.clientX, t.clientY);
      }
    };

    const onEnd = () => {
      if (dragging) {
        setDragging(false);
        // ドラッグ終了時の最新の座標を親コンポーネントに伝える
        onDragEndRef.current(positionRef.current.x, positionRef.current.y);
      }
    };

    // ドラッグ中のみ、画面全体にイベントリスナーを貼る（どこまで指を動かしても追従する）
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
  }, [dragging, rotation]);

  return { position, onMouseDown, onTouchStart, dragging, containerRef };
}

// ============================================================================
// ID生成（エンティティID用）
// ============================================================================

/**
 * 衝突しない数値IDを生成する。
 * Date.now() + モジュールスコープの単調増加カウンタで構成する。
 * 同一ミリ秒に複数回呼んでも衝突しない。
 */
let _idCounter = 0;
export function nextId(): number {
  return Date.now() + (++_idCounter);
}
