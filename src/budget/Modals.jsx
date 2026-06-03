// src/Modals.jsx
import React, { useState } from 'react';
import { I, toHalfWidth } from './utils';
import { PRODUCT_DATA, EXPENSE_ITEMS, MATERIAL_CATEGORIES } from './constants';

// 🛒 カタログモーダル
export function CatalogModal({ type, kawaraShu, masterMats, masterStdPrices, onApply, onClose }) {
    const [cart, setCart] = useState([]);
    
    const addToCart = (item) => {
        setCart(prev => {
            const ex = prev.find(x => x.hinmei === item.hinmei);
            if(ex) return prev.map(x => x.hinmei === item.hinmei ? {...x, suryo: x.suryo+1} : x);
            return [...prev, {...item, suryo: 1}];
        });
    };
    const updateQty = (hinmei, qty) => setCart(prev => prev.map(x => x.hinmei === hinmei ? {...x, suryo: qty} : x));
    const removeItem = (hinmei) => setCart(prev => prev.filter(x => x.hinmei !== hinmei));

    let catalogUI = null; let title = "";
    const catBtn = { background:"#1e293b", border:"1px solid #334155", color:"#dde8f2", padding:"8px 14px", borderRadius:20, fontSize:12, cursor:"pointer", transition:"all 0.2s" };

    if (type === 'tile') {
        title = `瓦 カタログ（${kawaraShu}）`;
        const data = PRODUCT_DATA[kawaraShu] || {};
        catalogUI = Object.keys(data).map(cat => (
            <div key={cat} style={{marginBottom:16}}>
                <div style={{fontSize:12, color:"#38bdf8", fontWeight:700, marginBottom:8}}>{cat}</div>
                <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
                    {data[cat].map(h => <button key={h} onClick={()=>addToCart({hinmei:h, category:cat, tani:"枚", unitPrice: masterStdPrices[kawaraShu]?.[h]||0})} style={catBtn}>＋ {h}</button>)}
                </div>
            </div>
        ));
    } else if (type === 'material') {
        title = "副資材 カタログ";
        const allCatItems = new Set(Object.values(MATERIAL_CATEGORIES).flat());
        const uncategorizedMats = Object.keys(masterMats).filter(h => !allCatItems.has(h));
        catalogUI = (
            <div>
                {Object.entries(MATERIAL_CATEGORIES).map(([cat, names]) => {
                    const available = names.filter(h => masterMats[h] !== undefined);
                    if (available.length === 0) return null;
                    return (
                        <div key={cat} style={{marginBottom:16}}>
                            <div style={{fontSize:12, color:"#38bdf8", fontWeight:700, marginBottom:8}}>{cat}</div>
                            <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
                                {available.map(h => <button key={h} onClick={()=>addToCart({hinmei:h, tani:"巻", costPrice: masterMats[h]})} style={catBtn}>＋ {h}</button>)}
                            </div>
                        </div>
                    );
                })}
                {uncategorizedMats.length > 0 && (
                    <div style={{marginBottom:16}}>
                        <div style={{fontSize:12, color:"#38bdf8", fontWeight:700, marginBottom:8}}>その他</div>
                        <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
                            {uncategorizedMats.map(h => <button key={h} onClick={()=>addToCart({hinmei:h, tani:"巻", costPrice: masterMats[h]})} style={catBtn}>＋ {h}</button>)}
                        </div>
                    </div>
                )}
            </div>
        );
    } else if (type === 'expense') {
        title = "労務・経費 カタログ";
        catalogUI = (
            <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
                {EXPENSE_ITEMS.map(h => <button key={h} onClick={()=>addToCart({hinmei:h, tani:"式", costPrice: 0, isLabor: h.includes("人工")&&!h.includes("応援")})} style={catBtn}>＋ {h}</button>)}
            </div>
        );
    }

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{maxWidth:850, display:"flex", flexDirection:"column", height:"85vh", padding:0, overflow:"hidden"}}>
                <div style={{padding:"16px 20px", borderBottom:"1px solid #1d3d5c", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#071624"}}>
                    <h3 style={{margin:0, color:"#38bdf8"}}>{title}</h3>
                    <button onClick={onClose} style={{background:"transparent", border:"none", color:"#94a3b8", fontSize:24, cursor:"pointer", padding:0}}>×</button>
                </div>
                <div className="catalog-container">
                    <div className="catalog-left">
                        <div style={{fontSize:11, color:"#94a3b8", marginBottom:16}}>ボタンをタップして選択します</div>
                        {catalogUI}
                    </div>
                    <div className="catalog-right">
                        <div style={{padding:"12px 16px", borderBottom:"1px solid #1d3d5c", fontWeight:900, color:"#fbbf24", background:"#071624"}}>📋 選択中の品目 ({cart.length}件)</div>
                        <div style={{flex:1, overflowY:"auto", padding:16}}>
                            {cart.length===0 && <div style={{color:"#64748b", fontSize:12, textAlign:"center", marginTop:20}}>項目がありません</div>}
                            {cart.map(c => (
                                <div key={c.hinmei} style={{background:"#071624", border:"1px solid #1d3d5c", borderRadius:8, padding:12, marginBottom:8}}>
                                    <div style={{fontSize:12, fontWeight:700, color:"#dde8f2", marginBottom:8}}>{c.hinmei}</div>
                                    <div style={{display:"flex", gap:8, alignItems:"center"}}>
                                        <input type="text" inputMode="decimal" value={c.suryo} onFocus={e=>e.target.select()} onChange={e=>updateQty(c.hinmei, toHalfWidth(e.target.value))} style={{...I, width:60, padding:"6px", textAlign:"right"}} />
                                        <span style={{fontSize:11, color:"#94a3b8"}}>{c.tani}</span>
                                        <button onClick={()=>removeItem(c.hinmei)} style={{marginLeft:"auto", background:"#3f1010", border:"1px solid #fca5a5", borderRadius:6, padding:"6px 12px", color:"#f87171", cursor:"pointer", fontSize:11, fontWeight:"bold"}}>削除</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{padding:16, borderTop:"1px solid #1d3d5c", background:"#071624"}}>
                            <button onClick={()=>onApply(cart)} disabled={cart.length===0} style={{width:"100%", background: cart.length>0?"#0ea5e9":"#334155", color:"#fff", border:"none", padding:"14px", borderRadius:8, fontWeight:900, fontSize:15, cursor:cart.length>0?"pointer":"not-allowed", boxShadow: cart.length>0?"0 4px 12px rgba(14,165,233,0.4)":"none"}}>✓ 明細に追加する</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ⚡ 自動積算モーダル
export function AutoEstimateModal({ area, onApply, onClose }) {
    const areaNum = Number(area) || 0;
    const roof20EffectiveArea = 0.9 * 19.6; const roof20Qty = Math.ceil(areaNum / roof20EffectiveArea);
    const roof50EffectiveArea = 0.9 * 49.6; const roof50Qty = Math.ceil(areaNum / roof50EffectiveArea);
    const boardEffectiveArea = 1.77 * 0.87; const boardQty = Math.ceil(areaNum / boardEffectiveArea);
    const [selected, setSelected] = useState({ roof20: true, roof50: false, board: true });

    const handleApply = () => {
        const items = [];
        if(selected.roof20) items.push({ hinmei: "ルーフィング(1m×20m)", suryo: roof20Qty, tani: "巻", biko: "自動計算" });
        if(selected.roof50) items.push({ hinmei: "ルーフィング(1m×50m)", suryo: roof50Qty, tani: "巻", biko: "自動計算" });
        if(selected.board) items.push({ hinmei: "ベニヤ板(1820×920)", suryo: boardQty, tani: "枚", biko: "自動計算" });
        onApply(items);
    };

    const checkStyle = { width: 16, height: 16, cursor: "pointer" };
    const rowStyle = { display: "flex", alignItems: "center", gap: 12, padding: "12px", background: "#071624", border: "1px solid #1d3d5c", borderRadius: 8, marginBottom: 8 };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3 style={{marginTop:0, color:"#38bdf8", borderBottom:"1px solid #1d3d5c", paddingBottom:12}}>⚡ 自動積算（面積: {areaNum}㎡）</h3>
                <p style={{fontSize:12, color:"#94a3b8", marginBottom:20}}>重ね代を考慮した有効面積から必要数を算出します。</p>
                <label style={rowStyle}><input type="checkbox" style={checkStyle} checked={selected.roof20} onChange={e=>setSelected({...selected, roof20: e.target.checked})} /><div style={{flex:1}}><div style={{fontWeight:700, fontSize:14}}>ルーフィング（1m×20m巻）</div><div style={{fontSize:11, color:"#64748b"}}>有効 {roof20EffectiveArea.toFixed(2)}㎡/巻</div></div><div style={{fontSize:18, fontWeight:900, color:"#fbbf24"}}>{roof20Qty}<span style={{fontSize:12, color:"#dde8f2", marginLeft:4}}>巻</span></div></label>
                <label style={rowStyle}><input type="checkbox" style={checkStyle} checked={selected.roof50} onChange={e=>setSelected({...selected, roof50: e.target.checked})} /><div style={{flex:1}}><div style={{fontWeight:700, fontSize:14}}>ルーフィング（1m×50m巻）</div><div style={{fontSize:11, color:"#64748b"}}>有効 {roof50EffectiveArea.toFixed(2)}㎡/巻</div></div><div style={{fontSize:18, fontWeight:900, color:"#fbbf24"}}>{roof50Qty}<span style={{fontSize:12, color:"#dde8f2", marginLeft:4}}>巻</span></div></label>
                <label style={rowStyle}><input type="checkbox" style={checkStyle} checked={selected.board} onChange={e=>setSelected({...selected, board: e.target.checked})} /><div style={{flex:1}}><div style={{fontWeight:700, fontSize:14}}>ベニヤ板（1820×920）</div><div style={{fontSize:11, color:"#64748b"}}>有効 {boardEffectiveArea.toFixed(2)}㎡/枚</div></div><div style={{fontSize:18, fontWeight:900, color:"#fbbf24"}}>{boardQty}<span style={{fontSize:12, color:"#dde8f2", marginLeft:4}}>枚</span></div></label>
                <div style={{display:"flex", gap:12, marginTop:24}}><button onClick={onClose} style={{flex:1, background:"transparent", border:"1px solid #334155", color:"#94a3b8", padding:"10px", borderRadius:6, cursor:"pointer", fontWeight:700}}>キャンセル</button><button onClick={handleApply} style={{flex:2, background:"#0ea5e9", border:"none", color:"#fff", padding:"10px", borderRadius:6, cursor:"pointer", fontWeight:700, fontSize:15}}>✓ 追加する</button></div>
            </div>
        </div>
    );
}
