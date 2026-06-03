// src/utils.jsx
import { useState, useEffect, useCallback, useRef } from 'react';

// ローカルストレージ連動フック（デバウンス書き込み版）
export function useLocalStorage(key, initialValue) {
  const read = useCallback((k, fallback) => {
    try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }, []);

  // key が変わったら即座に読み直す（現場切り替え対応）
  const [value, setValueRaw] = useState(() => read(key, initialValue));
  useEffect(() => {
    setValueRaw(read(key, initialValue));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // デバウンス書き込み（300ms）
  const pendingRef = useRef(value);
  const timerRef  = useRef(null);

  useEffect(() => {
    pendingRef.current = value;
    if (timerRef.current) clearTimeout(timerRef.current);
    const writeKey = key;
    const writeValue = value;
    timerRef.current = setTimeout(() => {
      try { window.localStorage.setItem(writeKey, JSON.stringify(writeValue)); }
      catch {}
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [key, value]);

  // アンマウント時に未書き込みデータをフラッシュ
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        try { window.localStorage.setItem(key, JSON.stringify(pendingRef.current)); }
        catch {}
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setValue = useCallback((next) => {
    setValueRaw(prev => typeof next === 'function' ? next(prev) : next);
  }, []);

  return [value, setValue];
}

// 共通スタイル・日付関数
export const I = { background:"#08192b", border:"1px solid #1d3d5c", borderRadius:6, padding:"8px 10px", color:"#dde8f2", fontSize:13, outline:"none", width:"100%", fontFamily:"inherit", boxSizing:"border-box" };
export const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
export const fmtDate = s => { if(!s) return "　　　年　　月　　日"; const [y,m,d]=s.split("-"); return `${y}年${m}月${d}日`; };
export const TILES_PER_SQM = {
  "三州53版和型": 16,
  "スーパートライ110スマート": 14,
};

export const toHalfWidth = (s) => {
  if (typeof s !== 'string') return s;
  return s.replace(/[０-９．]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/[。]/g, '.');
};
