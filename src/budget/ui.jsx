import { useEffect, useRef, useState } from 'react';
import { I } from './utils';

// 検索フィルター付き入力欄
export function FilterInput({ value, onChange, items, placeholder, style: extraStyle, onKeyDown }) {
  const [open, setOpen] = useState(false); const [filter, setFilter] = useState(""); const ref = useRef(null);
  useEffect(() => { const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", handleClick); return () => document.removeEventListener("mousedown", handleClick); }, []);
  const filtered = items.filter(it => !filter || it.toLowerCase().includes(filter.toLowerCase())).slice(0, 30);
  const highlight = (text, query) => { if (!query) return text; const idx = text.toLowerCase().indexOf(query.toLowerCase()); if (idx === -1) return text; return <>{text.slice(0, idx)}<mark>{text.slice(idx, idx + query.length)}</mark>{text.slice(idx + query.length)}</>; };
  const handleKeyDown = (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && open) setOpen(false);
    if (onKeyDown) onKeyDown(e);
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input style={{ ...I, ...extraStyle }} value={value} placeholder={placeholder} onChange={e => { onChange(e.target.value); setFilter(e.target.value); setOpen(true); }} onFocus={e => e.target.select?.()} onKeyDown={handleKeyDown} />
      {open && filtered.length > 0 && ( <div className="filter-dropdown">{filtered.map(it => <div key={it} onMouseDown={() => { onChange(it); setFilter(""); setOpen(false); }}>{highlight(it, filter)}</div>)}</div> )}
    </div>
  );
}

// レイアウト用部品
export function Field({label, children}) { return <div style={{display:"flex",flexDirection:"column",gap:4}}><label style={{fontSize:11,color:"#7aadcf",fontWeight:600,letterSpacing:1}}>{label}</label>{children}</div>; }

export function Card({title, id, color, action, children}) { return ( <div id={id} style={{background:"#0b1e30",border:"1px solid #1d3d5c",borderRadius:12,overflow:"hidden",marginBottom:16}}> <div style={{background:"#071624",borderBottom:"1px solid #1d3d5c",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}> <span style={{fontSize:13,fontWeight:700,color,letterSpacing:1}}>{title}</span>{action} </div> <div style={{padding:16}}>{children}</div> </div> ); }

export function Toast({ message, onClose }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    const t = setTimeout(() => onCloseRef.current?.(), 2500);
    return () => clearTimeout(t);
  }, []);
  return <div className="toast">{message}</div>;
}
