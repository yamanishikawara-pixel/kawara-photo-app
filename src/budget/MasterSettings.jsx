// src/MasterSettings.jsx
import { useState } from 'react';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { I } from './utils';
import { Card } from './ui';
import { useAppDialog } from './appDialogContext';
import { PRODUCT_DATA, MATERIAL_CATEGORIES } from './constants';
import { exportAllData, importAllData } from './dataBackup';

const toMasterNumber = (val, round = false) => {
    if (val === "") return "";
    const num = Number(val);
    if (!Number.isFinite(num)) return "";
    return round ? Math.ceil(num) : num;
};

// 新規追加用の小さな入力フォーム部品
function AddForm({ placeholderName, placeholderVal, onAdd }) {
    const [name, setName] = useState("");
    const [val, setVal] = useState("");
    return (
        <div style={{display:"flex", alignItems:"center", gap: 8, background:"#0f1d2e", padding:"10px", borderRadius:6, border:"1px dashed #334155", marginTop:12}}>
            <div style={{fontSize:11, color:"#94a3b8", fontWeight:700}}>新規追加:</div>
            <input placeholder={placeholderName} value={name} onChange={e=>setName(e.target.value)} style={{...I, flex:1, padding:"6px 10px"}} />
            <input type="text" inputMode="decimal" placeholder={placeholderVal} value={val} onChange={e=>setVal(e.target.value)} style={{...I, width:80, padding:"6px 10px", textAlign:"right"}} />
            <button onClick={()=>{ const trimmedName = name.trim(); if(trimmedName) { onAdd(trimmedName, val); setName(""); setVal(""); } }} style={{background:"#10b981", border:"none", borderRadius:4, color:"#fff", padding:"6px 14px", cursor:"pointer", fontWeight:700, fontSize:12}}>追加</button>
        </div>
    );
}

export function MasterSettings({ masterMats, setMasterMats, masterDiscounts, setMasterDiscounts, masterStdPrices, setMasterStdPrices, masterSuppliers = [], setMasterSuppliers, masterSupplierMap = {}, setMasterSupplierMap, masterCompanyInfo, setMasterCompanyInfo, masterHouseMakers = [], setMasterHouseMakers, masterMatCategories = {}, setMasterMatCategories, projectList = [], onClose, showToast, applySupplierRename, applySupplierDelete }) {
    const [activeTab, setActiveTab] = useState("materials");
    const [newMatName, setNewMatName] = useState("");
    const [newMatVal, setNewMatVal] = useState("");
    const [newMatCat, setNewMatCat] = useState("");
    const [bulkCat, setBulkCat] = useState("");
    const [bulkSup, setBulkSup] = useState("");
    const [supplierEditTarget, setSupplierEditTarget] = useState(null);
    const [supplierFilter, setSupplierFilter] = useState("");
    const [supplierCheckedItems, setSupplierCheckedItems] = useState([]);
    const { showConfirm, showPrompt } = useAppDialog();

    // ── クラウド ──
    const saveMasterToCloud = async () => {
        try {
            showToast("クラウドへ保存中...");
            const masterTs = new Date().toISOString();
            await setDoc(doc(db, "cost_master", "settings"), { masterMats, masterDiscounts, masterStdPrices, masterSuppliers, masterSupplierMap, masterCompanyInfo, masterHouseMakers, masterMatCategories, _updatedAt: masterTs });
            window.localStorage.setItem('global_master_localUpdatedAt', masterTs);
            showToast("☁️ クラウドにマスターデータを保存しました！");
        } catch(e) { showToast("保存エラー: " + e.message); }
    };

    const loadMasterFromCloud = async () => {
        const ok = await showConfirm("クラウドのデータで上書きしますか？");
        if (!ok) return;
        try {
            showToast("クラウドから読込中...");
            const docRef = await getDoc(doc(db, "cost_master", "settings"));
            if(docRef.exists()) {
                const data = docRef.data();
                if(data.masterMats) setMasterMats(data.masterMats);
                if(data.masterDiscounts) setMasterDiscounts(data.masterDiscounts);
                if(data.masterStdPrices) setMasterStdPrices(data.masterStdPrices);
                if(data.masterSuppliers) setMasterSuppliers(data.masterSuppliers);
                if(data.masterSupplierMap) setMasterSupplierMap(data.masterSupplierMap);
                if(data.masterCompanyInfo) setMasterCompanyInfo(data.masterCompanyInfo);
                if(data.masterHouseMakers) setMasterHouseMakers(data.masterHouseMakers);
                if(data.masterMatCategories) setMasterMatCategories(data.masterMatCategories);
                showToast("読込完了！");
            } else { showToast("データがありません"); }
        } catch(e) { showToast("読込エラー: " + e.message); }
    };

    // ── 副資材 ──
    const updateMaterial = (key, val) => setMasterMats(prev => ({...prev, [key]: toMasterNumber(val, true)}));
    const renameMaterial = async (oldKey) => {
        const newKey = (await showPrompt("新しい品名を入力してください", oldKey))?.trim();
        if (!newKey || newKey === oldKey) return;
        if (masterMats[newKey] !== undefined) { showToast("既に存在する品名です"); return; }
        setMasterMats(prev => { const c = {...prev}; c[newKey] = c[oldKey]; delete c[oldKey]; return c; });
    };
    const deleteMaterial = async (key) => {
        const ok = await showConfirm(`「${key}」を削除しますか？`);
        if (!ok) return;
        setMasterMats(prev => { const c = {...prev}; delete c[key]; return c; });
    };
    const addMaterial = (name, val, cat) => {
        if (masterMats[name] !== undefined) { showToast("既に存在する品名です"); return; }
        setMasterMats(prev => ({...prev, [name]: toMasterNumber(val || "0", true)}));
        if (cat && cat !== "その他") {
            setMasterMatCategories(prev => ({...prev, [cat]: [...(prev[cat] || []), name]}));
        }
        showToast("追加しました");
    };

    // ── 瓦 掛率 ──
    const updateDiscount = (group, color, val) => setMasterDiscounts(prev => ({...prev, [group]: {...prev[group], [color]: toMasterNumber(val)}}));
    const renameDiscount = async (group, oldColor) => {
        const newColor = (await showPrompt("新しい名称を入力してください", oldColor))?.trim();
        if (!newColor || newColor === oldColor) return;
        if (masterDiscounts[group][newColor] !== undefined) { showToast("既に存在する名称です"); return; }
        setMasterDiscounts(prev => { const c = {...prev}; c[group] = {...c[group]}; c[group][newColor] = c[group][oldColor]; delete c[group][oldColor]; return c; });
    };
    const deleteDiscount = async (group, color) => {
        const ok = await showConfirm(`「${color}」を削除しますか？`);
        if (!ok) return;
        setMasterDiscounts(prev => { const c = {...prev}; c[group] = {...c[group]}; delete c[group][color]; return c; });
    };
    const addDiscount = (group, name, val) => {
        if (masterDiscounts[group][name] !== undefined) { showToast("既に存在する名称です"); return; }
        setMasterDiscounts(prev => ({...prev, [group]: {...prev[group], [name]: toMasterNumber(val || "0")}}));
        showToast("追加しました");
    };

    // ── 瓦 標準単価 ──
    const updateStdPrice = (group, item, val) => setMasterStdPrices(prev => ({...prev, [group]: {...prev[group], [item]: toMasterNumber(val, true)}}));
    const renameStdPrice = async (group, oldItem) => {
        const newItem = (await showPrompt("新しい品名を入力してください", oldItem))?.trim();
        if (!newItem || newItem === oldItem) return;
        if (masterStdPrices[group][newItem] !== undefined) { showToast("既に存在する品名です"); return; }
        setMasterStdPrices(prev => { const c = {...prev}; c[group] = {...c[group]}; c[group][newItem] = c[group][oldItem]; delete c[group][oldItem]; return c; });
    };
    const deleteStdPrice = async (group, item) => {
        const ok = await showConfirm(`「${item}」を削除しますか？`);
        if (!ok) return;
        setMasterStdPrices(prev => { const c = {...prev}; c[group] = {...c[group]}; delete c[group][item]; return c; });
    };
    const addStdPrice = (group, name, val) => {
        if (masterStdPrices[group][name] !== undefined) { showToast("既に存在する品名です"); return; }
        setMasterStdPrices(prev => ({...prev, [group]: {...prev[group], [name]: toMasterNumber(val || "0", true)}}));
        showToast("追加しました");
    };

    // ── ハウスメーカー ──
    const addHouseMaker = (name, val) => {
        if (masterHouseMakers.some(h => h.name === name)) { showToast("既に存在します"); return; }
        setMasterHouseMakers(prev => [...prev, { name, kakuRate: Number(val) || 0 }]);
        showToast("追加しました");
    };
    const updateHouseMakerRate = (i, val) => {
        setMasterHouseMakers(prev => prev.map((h, idx) => idx === i ? { ...h, kakuRate: Number(val) } : h));
    };
    const renameHouseMaker = async (i) => {
        const newName = (await showPrompt("新しい名称を入力してください", masterHouseMakers[i].name))?.trim();
        if (!newName || newName === masterHouseMakers[i].name) return;
        if (masterHouseMakers.some(h => h.name === newName)) { showToast("既に存在します"); return; }
        setMasterHouseMakers(prev => prev.map((h, idx) => idx === i ? { ...h, name: newName } : h));
    };
    const deleteHouseMaker = async (i) => {
        const ok = await showConfirm(`「${masterHouseMakers[i].name}」を削除しますか？`);
        if (!ok) return;
        setMasterHouseMakers(prev => prev.filter((_, idx) => idx !== i));
    };

    const supplierItemNames = Object.keys(masterMats).sort((a, b) => a.localeCompare(b, 'ja'));
    const filteredSupplierItems = supplierItemNames.filter(name => name.toLowerCase().includes(supplierFilter.toLowerCase()));

    return (
        <div style={{maxWidth:1000, margin:"0 auto", padding:"20px 16px"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12}}>
                <h2 style={{color:"#38bdf8", margin:0}}>⚙️ マスターデータ設定</h2>
                <div style={{display:"flex", gap:8}}>
                    <button onClick={loadMasterFromCloud} style={{background:"#475569",border:"none",color:"#fff",padding:"8px 16px",borderRadius:7,fontSize:13,cursor:"pointer",fontWeight:700}}>☁️ 読込</button>
                    <button onClick={saveMasterToCloud} style={{background:"#0ea5e9",border:"none",color:"#fff",padding:"8px 16px",borderRadius:7,fontSize:13,cursor:"pointer",fontWeight:700}}>☁️ 保存</button>
                    <button onClick={async () => {
                        const ok = await showConfirm("全案件・マスターデータを JSON で書き出します。よろしいですか？");
                        if (!ok) return;
                        showToast("バックアップ作成中...");
                        try {
                            const json = await exportAllData({ masterMats, masterDiscounts, masterStdPrices, masterSuppliers, masterSupplierMap, masterCompanyInfo, masterHouseMakers }, projectList);
                            const blob = new Blob([json], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            const d = new Date();
                            a.download = `genka_backup_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}.json`;
                            a.href = url;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            showToast("💾 バックアップを書き出しました");
                        } catch (e) { showToast("バックアップ失敗: " + e.message); }
                    }} style={{background:"#1e3a5a",border:"1px solid #2a5a8a",color:"#93c5fd",padding:"8px 14px",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer"}}>💾 バックアップ</button>
                    <button onClick={async () => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = ".json";
                        input.onchange = async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const text = await file.text();
                            const mode = await (async () => {
                                const ok1 = await showConfirm("復元モードを選択してください。\n\n「OK」→ 上書き復元（既存データをすべて置き換え）\n「キャンセル」→ マージ復元（同名案件には suffix を付けて追加）");
                                if (ok1) {
                                    const ok2 = await showConfirm("【上書き復元】\n全データを消去してから復元します。\n本当によろしいですか？");
                                    return ok2 ? "overwrite" : null;
                                }
                                return "merge";
                            })();
                            if (!mode) return;
                            showToast("復元中...");
                            try {
                                await importAllData(text, mode, (msg) => showToast(msg));
                                showToast("復元完了。ページをリロードしてください");
                            } catch (e) { showToast("復元失敗: " + e.message); }
                        };
                        input.click();
                    }} style={{background:"#1e3a5a",border:"1px solid #2a5a8a",color:"#93c5fd",padding:"8px 14px",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer"}}>📂 復元</button>
                    <button onClick={onClose} style={{background:"#1e3a5a",border:"1px solid #2a5a8a",color:"#93c5fd",padding:"8px 24px",borderRadius:7,fontSize:14,cursor:"pointer",fontWeight:700,marginLeft:12}}>← 戻る</button>
                </div>
            </div>
            <div style={{display:"flex", gap:8, borderBottom:"1px solid #1d3d5c", marginBottom:20}}>
                <div className={`master-tab ${activeTab==="materials"?"active":""}`} onClick={()=>setActiveTab("materials")}>副資材 単価</div>
                <div className={`master-tab ${activeTab==="discounts"?"active":""}`} onClick={()=>setActiveTab("discounts")}>瓦 掛率</div>
                <div className={`master-tab ${activeTab==="tiles"?"active":""}`} onClick={()=>setActiveTab("tiles")}>瓦 標準単価</div>
                <div className={`master-tab ${activeTab==="suppliers"?"active":""}`} onClick={()=>setActiveTab("suppliers")}>📦 仕入先</div>
                <div className={`master-tab ${activeTab==="housemakers"?"active":""}`} onClick={()=>setActiveTab("housemakers")}>🏠 ハウスメーカー</div>
                <div className={`master-tab ${activeTab==="company"?"active":""}`} onClick={()=>setActiveTab("company")}>🏢 会社情報</div>
            </div>
            {activeTab === "materials" && (() => {
                const allCatItems = new Set([
                    ...Object.values(MATERIAL_CATEGORIES).flat(),
                    ...Object.values(masterMatCategories).flat()
                ]);
                const allCats = { ...MATERIAL_CATEGORIES };
                Object.entries(masterMatCategories).forEach(([cat, names]) => {
                    allCats[cat] = [...(allCats[cat] || []), ...names];
                });
                const categorized = Object.entries(allCats).map(([cat, names]) => ({
                    cat,
                    entries: names.filter(n => masterMats[n] !== undefined).map(n => [n, masterMats[n]])
                })).filter(c => c.entries.length > 0);
                const uncategorized = Object.entries(masterMats).filter(([n]) => !allCatItems.has(n));
                const MatRow = ([key, val]) => (
                    <div key={key} style={{display:"flex", alignItems:"center", gap:6, background:"#071624", padding:"6px 10px", borderRadius:6, border:"1px solid #1d3d5c"}}>
                        <button className="icon-btn" style={{color:"#94a3b8"}} onClick={()=>renameMaterial(key)} title="名称変更">✏️</button>
                        <span style={{fontSize:12, color:"#dde8f2", flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}} title={key}>{key}</span>
                        <input type="text" inputMode="decimal" value={val} onChange={e=>updateMaterial(key, e.target.value)} style={{...I, width:80, textAlign:"right", padding:"4px 8px"}} />
                        <select value={masterSupplierMap[key] || ""} onChange={e => { const m = {...masterSupplierMap}; if(e.target.value) m[key]=e.target.value; else delete m[key]; setMasterSupplierMap(m); }} style={{background:"#08192b",border:"1px solid #1d3d5c",borderRadius:6,padding:"4px 6px",color:"#dde8f2",fontSize:11,minWidth:120}}>
                            <option value="">未設定</option>
                            {masterSuppliers.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                        <button className="icon-btn" style={{color:"#f87171"}} onClick={()=>deleteMaterial(key)} title="削除">🗑️</button>
                    </div>
                );
                return (
                    <div>
                        {masterSuppliers.length > 0 && (
                            <div style={{background:"#0a1f2e",border:"1px solid #1d3d5c",borderRadius:8,padding:12,marginBottom:16}}>
                                <div style={{fontSize:12,fontWeight:700,color:"#fbbf24",marginBottom:10}}>⚡ カテゴリ一括設定</div>
                                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                                    <select value={bulkCat} onChange={e=>setBulkCat(e.target.value)} style={{background:"#08192b",border:"1px solid #1d3d5c",borderRadius:6,padding:"6px 10px",color:"#dde8f2",fontSize:12,minWidth:150}}>
                                        <option value="">カテゴリを選択...</option>
                                        {Object.keys(MATERIAL_CATEGORIES).map(cat=><option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                    <span style={{color:"#94a3b8",fontSize:12}}>を全て</span>
                                    <select value={bulkSup} onChange={e=>setBulkSup(e.target.value)} style={{background:"#08192b",border:"1px solid #1d3d5c",borderRadius:6,padding:"6px 10px",color:"#dde8f2",fontSize:12,minWidth:150}}>
                                        <option value="">仕入先を選択...</option>
                                        {masterSuppliers.map(s=><option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <span style={{color:"#94a3b8",fontSize:12}}>に設定</span>
                                    <button onClick={async()=>{
                                        if(!bulkCat||!bulkSup){showToast("カテゴリと仕入先を両方選択してください");return;}
                                        const items=MATERIAL_CATEGORIES[bulkCat]||[];
                                        const ok=await showConfirm(`「${bulkCat}」カテゴリを全て「${bulkSup}」に設定しますか？`);
                                        if(!ok)return;
                                        const m={...masterSupplierMap};let cnt=0;
                                        items.forEach(item=>{if(masterMats[item]!==undefined){m[item]=bulkSup;cnt++;}});
                                        setMasterSupplierMap(m);showToast(`${cnt}件を「${bulkSup}」に設定しました`);
                                    }} style={{background:"#92400e",border:"none",color:"#fde68a",padding:"6px 14px",borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:12}}>適用</button>
                                </div>
                            </div>
                        )}
                        {categorized.map(({ cat, entries }) => (
                            <Card key={cat} title={`副資材 - ${cat} (円)`} color="#fbbf24">
                                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))", gap:8}}>
                                    {entries.map(MatRow)}
                                </div>
                            </Card>
                        ))}
                        {uncategorized.length > 0 && (
                            <Card title="副資材 - その他 (円)" color="#fbbf24">
                                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))", gap:8}}>
                                    {uncategorized.map(MatRow)}
                                </div>
                            </Card>
                        )}
                        <Card title="副資材 - 新規追加" color="#fbbf24">
                            <div style={{display:"flex", alignItems:"center", gap: 8, background:"#0f1d2e", padding:"10px", borderRadius:6, border:"1px dashed #334155", marginTop:12, flexWrap:"wrap"}}>
                                <div style={{fontSize:11, color:"#94a3b8", fontWeight:700}}>新規追加:</div>
                                <select value={newMatCat} onChange={e=>setNewMatCat(e.target.value)} style={{background:"#08192b",border:"1px solid #1d3d5c",borderRadius:6,padding:"6px 10px",color:"#dde8f2",fontSize:12,minWidth:150}}>
                                    <option value="">カテゴリ選択...</option>
                                    <option value="その他">その他</option>
                                    {Object.keys(MATERIAL_CATEGORIES).map(cat=><option key={cat} value={cat}>{cat}</option>)}
                                </select>
                                <input placeholder="品名" value={newMatName} onChange={e=>setNewMatName(e.target.value)} style={{...I, flex:1, minWidth:120, padding:"6px 10px"}} />
                                <input type="text" inputMode="decimal" placeholder="単価" value={newMatVal} onChange={e=>setNewMatVal(e.target.value)} style={{...I, width:80, padding:"6px 10px", textAlign:"right"}} />
                                <button onClick={()=>{ const trimmed = newMatName.trim(); if(!trimmed) { showToast("品名を入力してください"); return; } addMaterial(trimmed, newMatVal, newMatCat || "その他"); setNewMatName(""); setNewMatVal(""); }} style={{background:"#10b981", border:"none", borderRadius:4, color:"#fff", padding:"6px 14px", cursor:"pointer", fontWeight:700, fontSize:12}}>追加</button>
                            </div>
                        </Card>
                    </div>
                );
            })()}
            {activeTab === "discounts" && (
                <div>
                    {Object.entries(masterDiscounts).map(([group, colors]) => (
                        <Card key={group} title={`掛率: ${group} (%)`} color="#34d399">
                            <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:12}}>
                                {Object.entries(colors).map(([color, rate]) => (
                                    <div key={color} style={{display:"flex", alignItems:"center", gap:6, background:"#071624", padding:"6px 10px", borderRadius:6, border:"1px solid #1d3d5c"}}>
                                        <button className="icon-btn" style={{color:"#94a3b8"}} onClick={()=>renameDiscount(group, color)} title="名称変更">✏️</button>
                                        <span style={{fontSize:12, color:"#dde8f2", flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}} title={color}>{color}</span>
                                        <input type="text" inputMode="decimal" value={rate} onChange={e=>updateDiscount(group, color, e.target.value)} style={{...I, width:70, textAlign:"right", padding:"4px 8px"}} />
                                        <button className="icon-btn" style={{color:"#f87171"}} onClick={()=>deleteDiscount(group, color)} title="削除">🗑️</button>
                                    </div>
                                ))}
                            </div>
                            <AddForm placeholderName="新規色・名称" placeholderVal="掛率(%)" onAdd={(n, v) => addDiscount(group, n, v)} />
                        </Card>
                    ))}
                </div>
            )}
            {activeTab === "tiles" && (
                <div>
                    {Object.entries(masterStdPrices).map(([group, items]) => {
                        // PRODUCT_DATA のカテゴリ順に並べる
                        const categoryMap = PRODUCT_DATA[group] || {};
                        const categories = Object.keys(categoryMap);
                        // カテゴリに属するアイテム
                        const categorized = categories.map(cat => ({
                            cat,
                            entries: (categoryMap[cat] || [])
                                .filter(name => items[name] !== undefined)
                                .map(name => [name, items[name]])
                        })).filter(c => c.entries.length > 0);
                        // どのカテゴリにも属さないアイテム
                        const allCatItems = new Set(categories.flatMap(c => categoryMap[c] || []));
                        const uncategorized = Object.entries(items).filter(([name]) => !allCatItems.has(name));

                        return (
                            <Card key={group} title={`標準単価: ${group} (円)`} color="#60a5fa">
                                {categorized.map(({ cat, entries }) => (
                                    <div key={cat} style={{marginBottom:16}}>
                                        <div style={{fontSize:11, fontWeight:700, color:"#7aadcf", letterSpacing:1, borderBottom:"1px solid #1d3d5c", paddingBottom:4, marginBottom:8}}>
                                            {cat}
                                        </div>
                                        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))", gap:8}}>
                                            {entries.map(([item, price]) => (
                                                <div key={item} style={{display:"flex", alignItems:"center", gap:6, background:"#071624", padding:"6px 10px", borderRadius:6, border:"1px solid #1d3d5c"}}>
                                                    <button className="icon-btn" style={{color:"#94a3b8"}} onClick={()=>renameStdPrice(group, item)} title="品名変更">✏️</button>
                                                    <span style={{fontSize:12, color:"#dde8f2", flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}} title={item}>{item}</span>
                                                    <input type="text" inputMode="decimal" value={price} onChange={e=>updateStdPrice(group, item, e.target.value)} style={{...I, width:80, textAlign:"right", padding:"4px 8px"}} />
                                                    <button className="icon-btn" style={{color:"#f87171"}} onClick={()=>deleteStdPrice(group, item)} title="削除">🗑️</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {uncategorized.length > 0 && (
                                    <div style={{marginBottom:16}}>
                                        <div style={{fontSize:11, fontWeight:700, color:"#7aadcf", letterSpacing:1, borderBottom:"1px solid #1d3d5c", paddingBottom:4, marginBottom:8}}>その他</div>
                                        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))", gap:8}}>
                                            {uncategorized.map(([item, price]) => (
                                                <div key={item} style={{display:"flex", alignItems:"center", gap:6, background:"#071624", padding:"6px 10px", borderRadius:6, border:"1px solid #1d3d5c"}}>
                                                    <button className="icon-btn" style={{color:"#94a3b8"}} onClick={()=>renameStdPrice(group, item)} title="品名変更">✏️</button>
                                                    <span style={{fontSize:12, color:"#dde8f2", flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}} title={item}>{item}</span>
                                                    <input type="text" inputMode="decimal" value={price} onChange={e=>updateStdPrice(group, item, e.target.value)} style={{...I, width:80, textAlign:"right", padding:"4px 8px"}} />
                                                    <button className="icon-btn" style={{color:"#f87171"}} onClick={()=>deleteStdPrice(group, item)} title="削除">🗑️</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <AddForm placeholderName="新規品名" placeholderVal="標準単価" onAdd={(n, v) => addStdPrice(group, n, v)} />
                            </Card>
                        );
                    })}
                </div>
            )}
            {activeTab === "suppliers" && (
                <div style={{padding:4}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                        <h3 style={{margin:0,color:"#38bdf8"}}>仕入先マスタ</h3>
                        <button onClick={async()=>{
                            const name=(await showPrompt("仕入先名を入力してください",""))?.trim();
                            if(!name)return;
                            if(masterSuppliers.includes(name)){showToast("既に登録されています");return;}
                            setMasterSuppliers([...masterSuppliers,name]);showToast(`「${name}」を追加しました`);
                        }} style={{background:"#0ea5e9",border:"none",color:"#fff",padding:"8px 16px",borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:13}}>＋ 仕入先を追加</button>
                    </div>
                    {masterSuppliers.length===0 ? (
                        <div style={{textAlign:"center",color:"#64748b",padding:"60px 0",fontSize:13,background:"#071624",borderRadius:8,border:"1px dashed #1d3d5c"}}>
                            仕入先がまだ登録されていません。<br/>「＋ 仕入先を追加」から登録してください。
                        </div>
                    ) : (
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",gap:10}}>
                            {masterSuppliers.map((name,idx)=>{
                                const usageCount=Object.values(masterSupplierMap).filter(s=>s===name).length;
                                return (
                                    <div key={name} style={{background:"#0b1e30",border:"1px solid #1d3d5c",borderRadius:8,padding:12,display:"flex",flexDirection:"column",gap:6}}>
                                        <div style={{fontSize:13,fontWeight:700,color:"#dde8f2"}}>{name}</div>
                                        <div style={{fontSize:11,color:"#7aadcf"}}>使用中の品目: {usageCount}件</div>
                                        <div style={{display:"flex",gap:4,marginTop:4}}>
                                            <button onClick={()=>{
                                                setSupplierEditTarget(name);
                                                setSupplierFilter("");
                                                setSupplierCheckedItems(supplierItemNames.filter(item => masterSupplierMap[item] === name));
                                            }} style={{flex:1,background:"transparent",border:"1px solid #1d3d5c",color:"#93c5fd",padding:"5px 8px",borderRadius:4,cursor:"pointer",fontSize:11}}>📦 取扱品目を編集</button>
                                        </div>
                                        <div style={{display:"flex",gap:4}}>
                                            <button onClick={async()=>{
                                                const newName=(await showPrompt("新しい仕入先名を入力してください",name))?.trim();
                                                if(!newName||newName===name)return;
                                                if(masterSuppliers.includes(newName)){showToast("既に登録されています");return;}
                                                setMasterSuppliers(masterSuppliers.map((s,i)=>i===idx?newName:s));
                                                const m={};Object.entries(masterSupplierMap).forEach(([item,sup])=>{m[item]=sup===name?newName:sup;});
                                                setMasterSupplierMap(m);applySupplierRename?.(name, newName);showToast(`「${name}」→「${newName}」に変更しました`);
                                            }} style={{flex:1,background:"transparent",border:"1px solid #334155",color:"#94a3b8",padding:"5px 8px",borderRadius:4,cursor:"pointer",fontSize:11}}>✏️ 名称変更</button>
                                            <button onClick={async()=>{
                                                const ok=await showConfirm(`「${name}」を削除しますか？\n（${usageCount}件の品目から仕入先設定も解除されます）`);
                                                if(!ok)return;
                                                setMasterSuppliers(masterSuppliers.filter(s=>s!==name));
                                                const m={};Object.entries(masterSupplierMap).forEach(([item,sup])=>{if(sup!==name)m[item]=sup;});
                                                setMasterSupplierMap(m);applySupplierDelete?.(name);showToast(`「${name}」を削除しました`);
                                            }} style={{background:"transparent",border:"1px solid #7f1d1d",color:"#f87171",padding:"5px 10px",borderRadius:4,cursor:"pointer",fontSize:11}}>🗑</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
            {supplierEditTarget && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSupplierEditTarget(null); }}>
                    <div className="modal-content" style={{maxWidth:720}} onClick={e => e.stopPropagation()}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:16}}>
                            <div>
                                <div style={{fontSize:18,fontWeight:700,color:"#dde8f2"}}>{supplierEditTarget} の取扱品目</div>
                                <div style={{fontSize:12,color:"#7aadcf"}}>チェックした品目をこの仕入先へ一括割当します</div>
                            </div>
                            <button onClick={()=>setSupplierEditTarget(null)} style={{background:"transparent",border:"1px solid #334155",color:"#94a3b8",padding:"6px 10px",borderRadius:6,cursor:"pointer"}}>閉じる</button>
                        </div>
                        <input
                            type="text"
                            value={supplierFilter}
                            onChange={e=>setSupplierFilter(e.target.value)}
                            placeholder="品名で検索"
                            style={{...I, marginBottom:12}}
                        />
                        <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:"50vh",overflowY:"auto",paddingRight:4}}>
                            {filteredSupplierItems.map(item => {
                                const assignedSupplier = masterSupplierMap[item];
                                const checked = supplierCheckedItems.includes(item);
                                return (
                                    <label key={item} style={{display:"flex",alignItems:"center",gap:10,background:"#071624",border:"1px solid #1d3d5c",borderRadius:8,padding:"10px 12px",cursor:"pointer"}}>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={e=>setSupplierCheckedItems(prev => e.target.checked ? [...prev, item] : prev.filter(v => v !== item))}
                                        />
                                        <div style={{display:"flex",flexDirection:"column",gap:2,flex:1}}>
                                            <span style={{fontSize:13,color:"#dde8f2",fontWeight:600}}>{item}</span>
                                            <span style={{fontSize:11,color:"#64748b"}}>
                                                {assignedSupplier ? `現在の割当: ${assignedSupplier}` : "現在の割当: 未設定"}
                                            </span>
                                        </div>
                                    </label>
                                );
                            })}
                            {filteredSupplierItems.length === 0 && (
                                <div style={{textAlign:"center",color:"#64748b",padding:"24px 0"}}>該当する品目がありません</div>
                            )}
                        </div>
                        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
                            <button onClick={()=>setSupplierEditTarget(null)} style={{background:"transparent",border:"1px solid #334155",color:"#94a3b8",padding:"8px 14px",borderRadius:6,cursor:"pointer",fontWeight:700}}>キャンセル</button>
                            <button onClick={()=>{
                                const checkedSet = new Set(supplierCheckedItems);
                                const newMap = { ...masterSupplierMap };
                                supplierItemNames.forEach(item => {
                                    if (checkedSet.has(item)) newMap[item] = supplierEditTarget;
                                    else if (newMap[item] === supplierEditTarget) delete newMap[item];
                                });
                                setMasterSupplierMap(newMap);
                                setSupplierEditTarget(null);
                                showToast(`「${supplierEditTarget}」の取扱品目を更新しました`);
                            }} style={{background:"#0ea5e9",border:"none",color:"#fff",padding:"8px 14px",borderRadius:6,cursor:"pointer",fontWeight:700}}>保存</button>
                        </div>
                    </div>
                </div>
            )}
            {activeTab === "housemakers" && (
                <Card title="ハウスメーカー別 瓦販売掛率" color="#f59e0b">
                    <div style={{fontSize:12, color:"#94a3b8", marginBottom:12}}>
                        案件でハウスメーカーを選択すると、設定した掛率が自動的に使われます（販売掛率を手動入力した場合はそちらが優先）。
                    </div>
                    <table style={{width:"100%", borderCollapse:"collapse", fontSize:13}}>
                        <thead>
                            <tr style={{borderBottom:"1px solid #334155"}}>
                                <th style={{textAlign:"left", padding:"6px 8px", color:"#94a3b8", fontWeight:600}}>ハウスメーカー名</th>
                                <th style={{textAlign:"right", padding:"6px 8px", color:"#94a3b8", fontWeight:600, width:120}}>販売掛率 (%)</th>
                                <th style={{width:120}}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {masterHouseMakers.length === 0 && (
                                <tr><td colSpan={3} style={{textAlign:"center", color:"#475569", padding:"16px 0", fontSize:12}}>まだ登録されていません</td></tr>
                            )}
                            {masterHouseMakers.map((hm, i) => (
                                <tr key={hm.name} style={{borderBottom:"1px solid #1e293b"}}>
                                    <td style={{padding:"6px 8px", color:"#dde8f2"}}>{hm.name}</td>
                                    <td style={{padding:"6px 4px"}}>
                                        <input
                                            type="number" step="0.5" min="0" max="100"
                                            value={hm.kakuRate}
                                            onChange={e => updateHouseMakerRate(i, e.target.value)}
                                            style={{...I, textAlign:"right", color:"#fbbf24", fontWeight:700, width:90}}
                                        />
                                    </td>
                                    <td style={{padding:"6px 4px", textAlign:"right", display:"flex", gap:4}}>
                                        <button onClick={() => renameHouseMaker(i)}
                                            style={{background:"#1e3a5a", border:"1px solid #2a5a8a", color:"#93c5fd", borderRadius:4, padding:"4px 10px", cursor:"pointer", fontSize:11}}>名称変更</button>
                                        <button onClick={() => deleteHouseMaker(i)}
                                            style={{background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", color:"#fca5a5", borderRadius:4, padding:"4px 8px", cursor:"pointer", fontSize:11}}>削除</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <AddForm placeholderName="ハウスメーカー名（例：ナチュラル）" placeholderVal="掛率%" onAdd={addHouseMaker} />
                </Card>
            )}
            {activeTab === "company" && (
                <div style={{padding:4, maxWidth:600}}>
                    <h3 style={{margin:"0 0 16px 0", color:"#38bdf8"}}>会社情報マスタ（発注書に表示されます）</h3>
                    <div style={{display:"flex", flexDirection:"column", gap:12}}>
                        {[
                            ["companyName","会社名"],
                            ["postalCode","郵便番号"],
                            ["address","住所"],
                            ["tel","電話番号"],
                            ["fax","FAX番号"],
                            ["contactPerson","担当者名"],
                            ["taxRate","消費税率 (%)"],
                            ["grossRateGood","粗利率 良好ライン (%) ※ダッシュボード表示色"],
                            ["grossRateWarn","粗利率 警告ライン (%) ※ダッシュボード表示色"],
                            ["fiscalYearStartMonth","会計年度 開始月（4=4月始まり）"],
                        ].map(([key, lbl]) => {
                            const numericKeys = ["taxRate", "grossRateGood", "grossRateWarn", "fiscalYearStartMonth"];
                            return (
                            <div key={key} style={{display:"flex", flexDirection:"column", gap:4}}>
                                <label style={{fontSize:11, color:"#7aadcf", fontWeight:600}}>{lbl}</label>
                                <input type={numericKeys.includes(key) ? "number" : "text"} value={key === "taxRate" ? (masterCompanyInfo?.taxRate ?? 10) : (masterCompanyInfo?.[key] || "")} onChange={e => {
                                    setMasterCompanyInfo({...masterCompanyInfo, [key]: numericKeys.includes(key) ? Number(e.target.value) : e.target.value});
                                }} style={{background:"#08192b", border:"1px solid #1d3d5c", borderRadius:6, padding:"8px 10px", color:"#dde8f2", fontSize:13, fontFamily:"inherit"}} />
                            </div>
                            );
                        })}
                    </div>
                    <div style={{marginTop:16, padding:12, background:"#0a1f2e", borderRadius:8, fontSize:11, color:"#7aadcf"}}>
                        💡 ここで設定した情報は発注書PDFや印刷物の「発注者欄」に表示されます。
                    </div>
                </div>
            )}
        </div>
    );
}
