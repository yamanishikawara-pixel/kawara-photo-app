// src/App.jsx
import { useState, useMemo, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { PRODUCT_NAMES, PRODUCT_DATA, INITIAL_STANDARD_PRICES, INITIAL_DISCOUNT_RATES, INITIAL_MATERIAL_PRICES, EXPENSE_ITEMS } from './constants';
import { useLocalStorage, I, today, toHalfWidth, TILES_PER_SQM } from './utils';
import { useHistory } from './useHistory';
import { calcTileRowCost, TSUBO_RATE } from './calcUtils';
import { Field, Card, Toast, FilterInput } from './ui';
import { useAppDialog } from './appDialogContext';
import { CatalogModal, AutoEstimateModal } from './Modals';
import { MasterSettings } from './MasterSettings';
import { PrintSheet } from './PrintSheet';
import { ProjectsScreen } from './ProjectsScreen';
import { DashboardScreen } from './DashboardScreen';
import logoImg from './logo-clear.png';
import { projectStorageKey, validateProjectSlug, PROJECT_FIELDS } from './projectStorage';
import { calculateBudget, calcTaxBreakdown } from './budgetCalculations';
import { TilePurchaseOrderSheet } from './TilePurchaseOrderSheet';
import { SectionNav } from './SectionNav';
import html2pdf from 'html2pdf.js';

const newTileRow = () => ({ id: nanoid(), category: "", hinmei: "", suryo: "", tani: "枚", unitPrice: "", unitRate: "", biko: "" });
const cloneRows = (rows) => rows.map(r => ({ ...r }));
const newMaterialRow = () => ({ id: nanoid(), hinmei: "", suryo: "", tani: "", costPrice: "", biko: "" });
const newExpenseRow = () => ({ id: nanoid(), hinmei: "", suryo: "", tani: "式", costPrice: "", biko: "", isLabor: false });

export default function App({ onNavigateToPhoto, projectAddress }) {
  // 写真台帳への戻り関数（未指定時はブラウザ履歴で戻る）
  const goToPhoto = (search) => {
    if (onNavigateToPhoto) {
      onNavigateToPhoto(search);
    } else {
      window.history.back();
    }
  };
  const [masterMats, setMasterMats] = useLocalStorage("global_master_materials", INITIAL_MATERIAL_PRICES);
  const [masterDiscounts, setMasterDiscounts] = useLocalStorage("global_master_discounts", INITIAL_DISCOUNT_RATES);
  const [masterStdPrices, setMasterStdPrices] = useLocalStorage("global_master_std_prices_v2", INITIAL_STANDARD_PRICES);
  const [masterSuppliers, setMasterSuppliers] = useLocalStorage("global_master_suppliers", []);
  const [masterSupplierMap, setMasterSupplierMap] = useLocalStorage("global_master_supplier_map", {});
  const [masterHouseMakers, setMasterHouseMakers] = useLocalStorage("global_master_housemakers", []);
  const [masterMatCategories, setMasterMatCategories] = useLocalStorage("global_master_mat_categories", {});
  const [masterCompanyInfo, setMasterCompanyInfo] = useLocalStorage("global_master_company_info", { companyName: "有限会社 山西瓦店", postalCode: "", address: "", tel: "", fax: "", contactPerson: "", taxRate: 10, grossRateGood: 30, grossRateWarn: 20, fiscalYearStartMonth: 4 });

  const [projectList, setProjectList] = useLocalStorage("cost_projectList", ["default"]);
  const [activeProject, setActiveProject] = useLocalStorage("cost_activeProject", "default");
  const [toast, setToast] = useState(null);
  const toastIdRef = useRef(0);
  const showToast = (msg) => { toastIdRef.current += 1; setToast({ id: toastIdRef.current, msg }); };
  const [autoSaveStatus, setAutoSaveStatus] = useState(null);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const autoSaveTimerRef = useRef(null);
  const history = useHistory(20);
  const { showConfirm } = useAppDialog();
  const pk = (key) => projectStorageKey(activeProject, key);

  const [date, setDate]                 = useLocalStorage(pk("date"), today());
  const [koujiName, setKoujiName]       = useLocalStorage(pk("koujiName"), "");
  const [koujiAddress, setKoujiAddress] = useLocalStorage(pk("koujiAddress"), "");
  const [clientName, setClientName]     = useLocalStorage(pk("clientName"), "");   
  const [dateJoto, setDateJoto]         = useLocalStorage(pk("dateJoto"), "");     
  const [dateChakko, setDateChakko]     = useLocalStorage(pk("dateChakko"), "");   
  const [spec, setSpec]                 = useLocalStorage(pk("spec"), "引掛桟葺工法"); 

  const [kawaraShu, setKawaraShu]       = useLocalStorage(pk("kawaraShu"), "三州53版和型");
  const [kawaraColor, setKawaraColor]   = useLocalStorage(pk("kawaraColor"), "銀鱗");
  const [tileSupplier, setTileSupplier] = useLocalStorage(pk("tileSupplier"), "");
  const [houseMakerName, setHouseMakerName] = useLocalStorage(pk("houseMakerName"), "");
  const [hanbaKakuRate, setHanbaKakuRate] = useLocalStorage(pk("hanbaKakuRate"), "");
  const [insuranceRate, setInsuranceRate] = useLocalStorage(pk("insuranceRate"), 21.4);
  const [unchinTanka, setUnchinTanka]   = useLocalStorage(pk("unchinTanka"), 13);
  const [yochiArea, setYochiArea]       = useLocalStorage(pk("yochiArea"), "");
  const [targetGrossRate, setTargetGrossRate] = useLocalStorage(pk("targetGrossRate"), 30);
  const [estimatePrice, setEstimatePrice]   = useLocalStorage(pk("estimatePrice"), "");
  const [grossMode, setGrossMode]           = useLocalStorage(pk("grossMode"), "rate");
  const [taxMode, setTaxMode]               = useLocalStorage(pk("taxMode"), "exclusive");
  const [archived, setArchived]             = useLocalStorage(pk("archived"), false);
  const [status, setStatus]                 = useLocalStorage(pk("status"), "draft");

  const [tileRows, setTileRows]         = useLocalStorage(pk("tileRows"), [newTileRow(),newTileRow(),newTileRow()]);
  const [materialRows, setMaterialRows] = useLocalStorage(pk("materialRows"), [newMaterialRow(),newMaterialRow()]);
  const [expenseRows, setExpenseRows]   = useLocalStorage(pk("expenseRows"), [newExpenseRow(),newExpenseRow()]);
  const [biko, setBiko]                 = useLocalStorage(pk("biko"), "");
  const [tileOrderSupplier, setTileOrderSupplier] = useLocalStorage(pk("tileOrderSupplier"), "");
  const [tileOrderDeliveryAddress, setTileOrderDeliveryAddress] = useLocalStorage(pk("tileOrderDeliveryAddress"), "");
  const [tileOrderDeliveryDate, setTileOrderDeliveryDate] = useLocalStorage(pk("tileOrderDeliveryDate"), "");
  const [tileOrderDeliveryTime, setTileOrderDeliveryTime] = useLocalStorage(pk("tileOrderDeliveryTime"), "");
  const [tileOrderNote, setTileOrderNote] = useLocalStorage(pk("tileOrderNote"), "");
  const [tileOrderMaterialRows, setTileOrderMaterialRows] = useLocalStorage(pk("tileOrderMaterialRows"), []);
  const [tileOrderTileRows, setTileOrderTileRows] = useLocalStorage(pk("tileOrderTileRows"), []);
  
  const [mode, setMode]                 = useState("projects");
  const [urlProjectLoading, setUrlProjectLoading] = useState(false);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [showAutoEstimate, setShowAutoEstimate] = useState(false);
  const [catalogType, setCatalogType]   = useState(null);

  const applySupplierRename = (oldName, newName) => {
    if (tileSupplier === oldName) setTileSupplier(newName);
    if (tileOrderSupplier === oldName) setTileOrderSupplier(newName);
    projectList.forEach(slug => {
      if (slug === activeProject) return;
      ["tileSupplier", "tileOrderSupplier"].forEach(field => {
        const key = projectStorageKey(slug, field);
        const raw = window.localStorage.getItem(key);
        if (raw == null) return;
        try {
          const v = JSON.parse(raw);
          if (v === oldName) window.localStorage.setItem(key, JSON.stringify(newName));
        } catch {}
      });
    });
  };

  const applySupplierDelete = (name) => {
    if (tileSupplier === name) setTileSupplier("");
    if (tileOrderSupplier === name) setTileOrderSupplier("");
    projectList.forEach(slug => {
      if (slug === activeProject) return;
      ["tileSupplier", "tileOrderSupplier"].forEach(field => {
        const key = projectStorageKey(slug, field);
        const raw = window.localStorage.getItem(key);
        if (raw == null) return;
        try {
          const v = JSON.parse(raw);
          if (v === name) window.localStorage.setItem(key, JSON.stringify(""));
        } catch {}
      });
    });
  };

  const saveProjectToCloud = async () => {
    try {
        showToast("クラウドへ保存中...");
        const raw = { koujiName, koujiAddress, clientName, date, dateJoto, dateChakko, spec, kawaraShu, kawaraColor, hanbaKakuRate, insuranceRate, unchinTanka, yochiArea, targetGrossRate, estimatePrice, grossMode, taxMode, archived, tileRows, materialRows, expenseRows, biko, tileSupplier, houseMakerName, tileOrderSupplier, tileOrderDeliveryAddress, tileOrderDeliveryDate, tileOrderDeliveryTime, tileOrderNote, tileOrderMaterialRows, tileOrderTileRows, status, _updatedAt: new Date().toISOString() };
        // Firestore は undefined 不可のため JSON往復でサニタイズ
        const projectData = JSON.parse(JSON.stringify(raw));
        await setDoc(doc(db, "cost_projects", activeProject), projectData);
        await setDoc(doc(db, "cost_system", "meta"), { projectList });
        window.localStorage.setItem(`cost_${activeProject}_localUpdatedAt`, new Date().toISOString());
        showToast("☁️ クラウドに案件を保存しました！");
    } catch(e) { showToast("保存エラー: " + e.message); }
  };

  const loadProjectFromCloud = async (silent = false) => {
    if (!silent) {
      const ok = await showConfirm("クラウドのデータで現在の入力を上書きしますか？");
      if (!ok) return;
    }
    const snap = { koujiName, koujiAddress, clientName, date, dateJoto, dateChakko, spec, kawaraShu, kawaraColor, hanbaKakuRate, insuranceRate, unchinTanka, yochiArea, targetGrossRate, estimatePrice, grossMode, taxMode, archived, tileRows, materialRows, expenseRows, biko, tileSupplier, houseMakerName, tileOrderSupplier, tileOrderDeliveryAddress, tileOrderDeliveryDate, tileOrderDeliveryTime, tileOrderNote, tileOrderMaterialRows, tileOrderTileRows, status };
    try {
        setIsLoadingCloud(true);
        if (!silent) showToast("クラウドから読込中...");
        const metaRef = await getDoc(doc(db, "cost_system", "meta"));
        if(metaRef.exists() && metaRef.data().projectList) setProjectList(metaRef.data().projectList);
        const docRef = await getDoc(doc(db, "cost_projects", activeProject));
        if(docRef.exists()) {
            if (!silent) history.push("クラウド読込前に戻す", () => {
              setKoujiName(snap.koujiName); setKoujiAddress(snap.koujiAddress); setClientName(snap.clientName); setDate(snap.date);
              setDateJoto(snap.dateJoto); setDateChakko(snap.dateChakko); setSpec(snap.spec); setKawaraShu(snap.kawaraShu); setKawaraColor(snap.kawaraColor);
              setHanbaKakuRate(snap.hanbaKakuRate); setInsuranceRate(snap.insuranceRate); setUnchinTanka(snap.unchinTanka); setYochiArea(snap.yochiArea);
              setTargetGrossRate(snap.targetGrossRate); setEstimatePrice(snap.estimatePrice); setGrossMode(snap.grossMode); setTaxMode(snap.taxMode); setArchived(snap.archived);
              setTileRows(snap.tileRows); setMaterialRows(snap.materialRows); setExpenseRows(snap.expenseRows); setBiko(snap.biko);
              setTileSupplier(snap.tileSupplier);
              setHouseMakerName(snap.houseMakerName);
              setTileOrderSupplier(snap.tileOrderSupplier);
              setTileOrderDeliveryAddress(snap.tileOrderDeliveryAddress);
              setTileOrderDeliveryDate(snap.tileOrderDeliveryDate);
              setTileOrderDeliveryTime(snap.tileOrderDeliveryTime);
              setTileOrderNote(snap.tileOrderNote);
              setTileOrderMaterialRows(snap.tileOrderMaterialRows);
              setTileOrderTileRows(snap.tileOrderTileRows);
              setStatus(snap.status);
            });
            const d = docRef.data();
            setKoujiName(d.koujiName ?? ""); setKoujiAddress(d.koujiAddress ?? ""); setClientName(d.clientName ?? "");
            setDateJoto(d.dateJoto ?? ""); setDateChakko(d.dateChakko ?? ""); setSpec(d.spec ?? "引掛桟葺工法");
            setDate(d.date ?? today()); setKawaraShu(d.kawaraShu ?? "三州53版和型"); setKawaraColor(d.kawaraColor ?? "銀鱗");
            setHanbaKakuRate(d.hanbaKakuRate ?? "");
            setInsuranceRate(d.insuranceRate ?? 21.4); setUnchinTanka(d.unchinTanka ?? 13); setYochiArea(d.yochiArea ?? "");
            setTargetGrossRate(d.targetGrossRate ?? 30); setEstimatePrice(d.estimatePrice ?? ""); setGrossMode(d.grossMode ?? "rate"); setTaxMode(d.taxMode ?? "exclusive"); setArchived(d.archived ?? false);
            setTileRows(d.tileRows ?? [newTileRow()]); setMaterialRows(d.materialRows ?? [newMaterialRow()]);
            setExpenseRows(d.expenseRows ?? [newExpenseRow()]); setBiko(d.biko ?? "");
            setTileSupplier(d.tileSupplier ?? "");
            setHouseMakerName(d.houseMakerName ?? "");
            setTileOrderSupplier(d.tileOrderSupplier ?? "");
            setTileOrderDeliveryAddress(d.tileOrderDeliveryAddress ?? "");
            setTileOrderDeliveryDate(d.tileOrderDeliveryDate ?? "");
            setTileOrderDeliveryTime(d.tileOrderDeliveryTime ?? "");
            setTileOrderNote(d.tileOrderNote ?? "");
            setTileOrderMaterialRows(d.tileOrderMaterialRows ?? []);
            setTileOrderTileRows(d.tileOrderTileRows ?? []);
            setStatus(d.status ?? "draft");
            if (d._updatedAt) {
              window.localStorage.setItem(`cost_${activeProject}_localUpdatedAt`, d._updatedAt);
            }
            if (!silent) showToast("☁️ クラウドから案件を読み込みました！");
        } else { if (!silent) showToast("クラウドにこの案件のデータがありません"); }
    } catch(e) { if (!silent) showToast("読込エラー: " + e.message); }
    finally { setTimeout(() => setIsLoadingCloud(false), 1000); }
  };

  // ダッシュボード表示時、Firestoreから未同期の全案件をlocalStorageへ一括同期
  useEffect(() => {
    if (mode !== "dashboard") return;
    (async () => {
      try {
        const toLoad = projectList.filter(slug =>
          !window.localStorage.getItem(`cost_${slug}_localUpdatedAt`)
        );
        if (toLoad.length === 0) return;
        await Promise.all(toLoad.map(async slug => {
          try {
            const snap = await getDoc(doc(db, "cost_projects", slug));
            if (!snap.exists()) return;
            const d = snap.data();
            PROJECT_FIELDS.forEach(field => {
              if (d[field] !== undefined) {
                window.localStorage.setItem(projectStorageKey(slug, field), JSON.stringify(d[field]));
              }
            });
            if (d._updatedAt) {
              window.localStorage.setItem(`cost_${slug}_localUpdatedAt`, d._updatedAt);
            }
          } catch {}
        }));
        setDashboardRefreshKey(k => k + 1);
      } catch {}
    })();
  }, [mode, projectList]); // eslint-disable-line react-hooks/exhaustive-deps

  // 起動時にマスター設定を Firestore から自動ロード（マルチデバイス対応）
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "cost_master", "settings"));
        if (!snap.exists()) return;
        const d = snap.data();
        if (d.masterMats)        setMasterMats(d.masterMats);
        if (d.masterDiscounts)   setMasterDiscounts(d.masterDiscounts);
        if (d.masterStdPrices)   setMasterStdPrices(d.masterStdPrices);
        if (d.masterSuppliers)   setMasterSuppliers(d.masterSuppliers);
        if (d.masterSupplierMap) setMasterSupplierMap(d.masterSupplierMap);
        if (d.masterCompanyInfo) setMasterCompanyInfo(d.masterCompanyInfo);
        if (d.masterHouseMakers) setMasterHouseMakers(d.masterHouseMakers);
      } catch { /* 失敗時はローカルのまま継続 */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 起動時・タブが表示されたタイミングで自動的に最新データを読み込む
  useEffect(() => {
    loadProjectFromCloud(true);
    const onVisibility = () => { if (!document.hidden) loadProjectFromCloud(true); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [activeProject]); // 案件切替時も自動再読み込み

  // 写真帳からの起動: ?project={工事名} を検知して該当案件を開く
  // ※ BudgetPage が key={projectParam} で再マウントするため毎回実行される
  useEffect(() => {
    // params.get() はすでにデコード済みの値を返すため二重デコード不要
    const params = new URLSearchParams(window.location.search);
    const decoded = (params.get('project') ?? '').trim();

    // URL から project・address パラメータを削除（履歴を汚さない）
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('project');
      url.searchParams.delete('address');
      window.history.replaceState({}, '', url.toString());
    } catch { /* noop */ }

    if (!decoded) return;
    if (validateProjectSlug(decoded) !== null) {
      showToast(`工事名「${decoded}」に使用できない文字が含まれています`);
      return;
    }

    setUrlProjectLoading(true);

    // Firestore を直接確認（localStorage のリストに頼らない）
    (async () => {
      try {
        const cloudDoc = await getDoc(doc(db, "cost_projects", decoded));

        if (cloudDoc.exists()) {
          // Firestoreに存在 → リストに追加してから開く
          setProjectList(prev =>
            prev.includes(decoded) ? prev : [...prev, decoded]
          );
          setActiveProject(decoded);
          setMode("input");
          showToast(`📷 「${decoded}」を開きました`);
        } else {
          // Firestoreにも存在しない → 新規作成を提案
          const ok = await showConfirm(
            `写真帳の「${decoded}」の予算書はまだありません。\n新規作成しますか？`
          );
          if (!ok) {
            setUrlProjectLoading(false);
            return;
          }
          // 工事名を初期値としてセット
          window.localStorage.setItem(
            `cost_${decoded}_koujiName`,
            JSON.stringify(decoded)
          );
          // 写真アプリの施工場所を koujiAddress に引き継ぐ（既存データは上書きしない）
          if (projectAddress) {
            const existingAddr = window.localStorage.getItem(`cost_${decoded}_koujiAddress`);
            if (!existingAddr || existingAddr === '""' || existingAddr === 'null') {
              window.localStorage.setItem(
                `cost_${decoded}_koujiAddress`,
                JSON.stringify(projectAddress)
              );
            }
          }
          setProjectList(prev =>
            prev.includes(decoded) ? prev : [...prev, decoded]
          );
          setActiveProject(decoded);
          setMode("input");
          showToast(`📷 「${decoded}」を作成しました`);
        }
      } catch (e) {
        showToast(`現場の読み込みに失敗しました: ${e.message}`);
      } finally {
        setUrlProjectLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 案件切替時に履歴クリア
  useEffect(() => { history.clear(); }, [activeProject]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── オートセーブ（入力画面・内容あり・ロード中以外・3秒デバウンス）──
  useEffect(() => {
    if (mode !== "input" || isLoadingCloud || archived) return;
    const hasContent = koujiName || tileRows.some(r => r.hinmei) || materialRows.some(r => r.hinmei) || expenseRows.some(r => r.hinmei);
    if (!hasContent) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        const raw = { koujiName, koujiAddress, clientName, date, dateJoto, dateChakko, spec, kawaraShu, kawaraColor, hanbaKakuRate, insuranceRate, unchinTanka, yochiArea, targetGrossRate, estimatePrice, grossMode, taxMode, archived, tileRows, materialRows, expenseRows, biko, tileSupplier, houseMakerName, tileOrderSupplier, tileOrderDeliveryAddress, tileOrderDeliveryDate, tileOrderDeliveryTime, tileOrderNote, tileOrderMaterialRows, tileOrderTileRows, status, _updatedAt: new Date().toISOString() };
        await setDoc(doc(db, "cost_projects", activeProject), JSON.parse(JSON.stringify(raw)));
        // プロジェクト一覧もFirestoreに保存（削除・新規作成が正しく反映されるように）
        await setDoc(doc(db, "cost_system", "meta"), { projectList });
        window.localStorage.setItem(`cost_${activeProject}_localUpdatedAt`, new Date().toISOString());
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus(s => s === "saved" ? null : s), 3000);
      } catch { setAutoSaveStatus("error"); }
    }, 3000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [mode, isLoadingCloud, archived, activeProject, koujiName, koujiAddress, clientName, date, dateJoto, dateChakko, spec, kawaraShu, kawaraColor, hanbaKakuRate, insuranceRate, unchinTanka, yochiArea, targetGrossRate, estimatePrice, grossMode, taxMode, tileRows, materialRows, expenseRows, biko, tileSupplier, houseMakerName, tileOrderSupplier, tileOrderDeliveryAddress, tileOrderDeliveryDate, tileOrderDeliveryTime, tileOrderNote, tileOrderMaterialRows, tileOrderTileRows, status]);

  useEffect(() => {
    if (mode !== "input") return;
    let cancelled = false;
    (async () => {
      try {
        const ref = doc(db, "cost_projects", activeProject);
        const snap = await getDoc(ref);
        if (cancelled || !snap.exists()) return;
        const cloud = snap.data()._updatedAt;
        const local = window.localStorage.getItem(`cost_${activeProject}_localUpdatedAt`);
        if (!cloud) return;
        if (!local || new Date(cloud) > new Date(local)) {
          showToast("☁️ クラウドに新しいデータがあります。「☁️ 読込」で取得できます");
        }
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [mode, activeProject]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusNextInput = (e) => {
    if (e.key !== 'Enter') return;
    if (e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    const table = e.target.closest('table');
    if (!table) return;
    const inputs = Array.from(table.querySelectorAll('input:not([type="checkbox"])'));
    const i = inputs.indexOf(e.target);
    if (i >= 0 && i < inputs.length - 1) {
      inputs[i + 1].focus();
      inputs[i + 1].select?.();
    }
  };

  const findCategoryForHinmei = (shu, hinmei) => {
    const data = PRODUCT_DATA[shu] || {};
    for (const [cat, items] of Object.entries(data)) { if (items.includes(hinmei)) return cat; }
    return "";
  };

  const addTileRow = () => setTileRows(r=>[...r,newTileRow()]);
  const removeTileRow = id => { const snap = cloneRows(tileRows); history.push("瓦の行削除", () => setTileRows(snap)); setTileRows(r=>r.filter(x=>x.id!==id)); };
  const moveTileRow = (idx, dir) => { const ni=idx+dir; if(ni<0||ni>=tileRows.length) return; const snap=cloneRows(tileRows); history.push("瓦の行入替",()=>setTileRows(snap)); const a=cloneRows(tileRows); [a[idx],a[ni]]=[a[ni],a[idx]]; setTileRows(a); };
  const updTileRow = (id, f, v) => setTileRows(r => r.map(x => {
    if (x.id !== id) return x;
    const newX = { ...x, [f]: v };
    if (f === "hinmei") {
      const cat = findCategoryForHinmei(kawaraShu, v);
      if (cat) newX.category = cat;
      const newSp = masterStdPrices[kawaraShu]?.[v];
      const oldSp = masterStdPrices[kawaraShu]?.[x.hinmei];
      if (newSp !== undefined && (
        x.unitPrice === "" || x.unitPrice === undefined ||
        (oldSp !== undefined && Number(x.unitPrice) === oldSp)
      )) {
        newX.unitPrice = newSp;
      }
    }
    return newX;
  }));
  const applyHanbaKakuToAllRows = () => {
    if (effectiveHanbaKakuRate === "") return;
    const snap = cloneRows(tileRows);
    history.push("掛率の全行適用", () => setTileRows(snap));
    setTileRows(r => r.map(x => ({ ...x, unitRate: String(effectiveHanbaKakuRate) })));
  };

  const updateStatus = (newStatus) => {
    if (newStatus === status) return;
    const old = status;
    history.push("ステータス変更", () => setStatus(old));
    setStatus(newStatus);
  };

  const addMaterialRow = () => setMaterialRows(r=>[...r,newMaterialRow()]);
  const addTileOrderTileRow = () => {
    const snap = cloneRows(tileOrderTileRows);
    history.push("瓦発注 行追加", () => setTileOrderTileRows(snap));
    setTileOrderTileRows(r => [...r, {id: nanoid(), hinmei: "", suryo: "", tani: "枚", biko: ""}]);
  };
  const removeTileOrderTileRow = id => {
    const snap = cloneRows(tileOrderTileRows);
    history.push("瓦発注 行削除", () => setTileOrderTileRows(snap));
    setTileOrderTileRows(r => r.filter(x => x.id !== id));
  };
  const updTileOrderTileRow = (id, f, v) => setTileOrderTileRows(r => r.map(x => x.id !== id ? x : {...x, [f]: v}));
  const addTileOrderMaterialRow = () => {
    const snap = cloneRows(tileOrderMaterialRows);
    history.push("瓦発注 副資材行追加", () => setTileOrderMaterialRows(snap));
    setTileOrderMaterialRows(r => [...r, {id: nanoid(), hinmei: "", suryo: "", tani: "", biko: ""}]);
  };
  const removeTileOrderMaterialRow = id => {
    const snap = cloneRows(tileOrderMaterialRows);
    history.push("瓦発注 副資材行削除", () => setTileOrderMaterialRows(snap));
    setTileOrderMaterialRows(r => r.filter(x => x.id !== id));
  };
  const updTileOrderMaterialRow = (id, f, v) => setTileOrderMaterialRows(r => r.map(x => x.id !== id ? x : {...x, [f]: v}));
  const syncOrderFromBudget = () => {
    const snapTile = cloneRows(tileOrderTileRows);
    const snapMat  = cloneRows(tileOrderMaterialRows);
    history.push("予算から再反映", () => {
      setTileOrderTileRows(snapTile);
      setTileOrderMaterialRows(snapMat);
    });
    setTileOrderTileRows(tileRows.filter(r => r.hinmei && Number(r.suryo) > 0).map(r => ({...r})));
    setTileOrderMaterialRows(materialRows.filter(r => r.hinmei).map(r => ({...r})));
  };
  const removeMaterialRow = id => {
    const snapRows = cloneRows(materialRows);
    const snapMap = { ...masterSupplierMap };
    const targetRow = materialRows.find(x => x.id === id);
    history.push("副資材の行削除", () => {
      setMaterialRows(snapRows);
      setMasterSupplierMap(snapMap);
    });
    setMaterialRows(r => r.filter(x => x.id !== id));
    setMasterSupplierMap(m => {
      const next = { ...m };
      delete next[id];
      if (targetRow?.hinmei) {
        const stillUsed = materialRows.some(r => r.id !== id && r.hinmei === targetRow.hinmei);
        if (!stillUsed) delete next[targetRow.hinmei];
      }
      return next;
    });
  };
  const updMaterialRow = (id, f, v) => setMaterialRows(r => r.map(x => {
    if (x.id !== id) return x;
    const newX = { ...x, [f]: v };
    if (f === "hinmei") {
      const newCp = masterMats[v];
      const oldCp = masterMats[x.hinmei];
      if (newCp !== undefined && (
        x.costPrice === "" || x.costPrice === undefined ||
        (oldCp !== undefined && Number(x.costPrice) === oldCp)
      )) {
        newX.costPrice = newCp;
      }
    }
    return newX;
  }));
  
  const addExpenseRow = () => setExpenseRows(r=>[...r,newExpenseRow()]);
  const removeExpenseRow = id => { const snap = cloneRows(expenseRows); history.push("経費の行削除", () => setExpenseRows(snap)); setExpenseRows(r=>r.filter(x=>x.id!==id)); };
  const updExpenseRow = (id, f, v) => setExpenseRows(r => r.map(x => {
    if (x.id !== id) return x;
    const newX = { ...x, [f]: v };
    if (f === "hinmei" && (!x.hinmei || x.hinmei === "")) {
      newX.isLabor = v.includes("人工") && !v.includes("応援");
    }
    return newX;
  }));

  // ★カタログ適用ロジック
  const handleApplyCatalog = (cartItems) => {
    if(catalogType === 'tile') { const snap = cloneRows(tileRows); history.push("カタログ適用（瓦）", () => setTileRows(snap)); const newRows = cartItems.map(it => ({ id: nanoid(), category: it.category||"", hinmei: it.hinmei, suryo: it.suryo, tani: it.tani||"枚", unitPrice: it.unitPrice, biko: "" })); setTileRows(r => [...r, ...newRows]); }
    else if(catalogType === 'material') { const snap = cloneRows(materialRows); history.push("カタログ適用（副資材）", () => setMaterialRows(snap)); const newRows = cartItems.map(it => ({ id: nanoid(), hinmei: it.hinmei, suryo: it.suryo, tani: it.tani||"巻", costPrice: it.costPrice, biko: "" })); setMaterialRows(r => [...r, ...newRows]); }
    else if(catalogType === 'expense') { const snap = cloneRows(expenseRows); history.push("カタログ適用（経費）", () => setExpenseRows(snap)); const newRows = cartItems.map(it => ({ id: nanoid(), hinmei: it.hinmei, suryo: it.suryo, tani: it.tani||"式", costPrice: it.costPrice ?? 0, biko: "", isLabor: it.isLabor })); setExpenseRows(r => [...r, ...newRows]); }
    setCatalogType(null); showToast("リストの項目を追加しました！");
  };

  // ★自動積算適用ロジック
  const handleApplyAutoEstimate = (items) => {
      const snap = cloneRows(materialRows); history.push("自動積算", () => setMaterialRows(snap));
      const newRows = items.map(it => ({ id: nanoid(), category: "", hinmei: it.hinmei, suryo: it.suryo, tani: it.tani, costPrice: masterMats[it.hinmei] || "", biko: it.biko }));
      setMaterialRows(prev => [...prev, ...newRows]); setShowAutoEstimate(false); showToast("自動積算で副資材を追加しました");
  };

  const effectiveHanbaKakuRate = useMemo(() => {
    if (hanbaKakuRate !== "") return hanbaKakuRate;
    const hm = masterHouseMakers.find(h => h.name === houseMakerName);
    return hm !== undefined ? hm.kakuRate : "";
  }, [hanbaKakuRate, masterHouseMakers, houseMakerName]);

  const tileHinmeiOptions = useMemo(() => {
    const data = PRODUCT_DATA[kawaraShu] || {};
    const categorized = Object.values(data).flat();
    const allItems = new Set(categorized);
    const uncategorized = Object.keys(masterStdPrices[kawaraShu] || {}).filter(h => !allItems.has(h));
    return [...categorized, ...uncategorized];
  }, [kawaraShu, masterStdPrices]);

  const { totalCost, tileSub, matSub, expSub, welfareCost, unchinTotal } = useMemo(() => calculateBudget({
      tileRows, materialRows, expenseRows, masterStdPrices, masterDiscounts,
      kawaraShu, kawaraColor, hanbaKakuRate: effectiveHanbaKakuRate, insuranceRate, unchinTanka,
  }), [tileRows, materialRows, expenseRows, masterStdPrices, masterDiscounts, kawaraShu, kawaraColor, effectiveHanbaKakuRate, insuranceRate, unchinTanka]);

  if (urlProjectLoading) return (
    <div style={{minHeight:"100vh",background:"#05111f",display:"flex",justifyContent:"center",alignItems:"center",flexDirection:"column",gap:16}}>
      <div style={{color:"#6ee7b7",fontSize:16,fontWeight:700}}>現場を確認中...</div>
      <div style={{color:"#94a3b8",fontSize:13}}>しばらくお待ちください</div>
      {toast && <Toast key={toast.id} message={toast.msg} onClose={() => setToast(null)} />}
    </div>
  );

  if (mode === "projects") return (
    <>
      <ProjectsScreen
        projectList={projectList}
        setProjectList={setProjectList}
        activeProject={activeProject}
        setActiveProject={setActiveProject}
        setMode={setMode}
        showToast={showToast}
        onNavigateToPhoto={onNavigateToPhoto}
      />
      {toast && <Toast key={toast.id} message={toast.msg} onClose={() => setToast(null)} />}
    </>
  );

  if (mode === "preview") {
    const handlePdfDownload = async () => {
      const el = document.getElementById("print-area");
      if (!el) { showToast("PDF生成エラー：出力領域が見つかりません"); return; }
      showToast("PDF を生成中...");
      try {
        await html2pdf().set({
          margin: [8, 8, 8, 8],
          filename: `実行予算書_${koujiName || "無題"}.pdf`,
          image: { type: "jpeg", quality: 0.97 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        }).from(el).save();
        showToast("📄 PDF を保存しました");
      } catch (e) {
        showToast("PDF生成エラー: " + e.message);
      }
    };

    return (
      <div style={{background:"#1a1a2e",minHeight:"100vh",fontFamily:"'Noto Sans JP', sans-serif"}}>
        <div className="no-print" style={{background:"#0d1b2a",padding:"12px 20px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid #2a4a6a",position:"sticky",top:0,zIndex:10}}>
          <button onClick={() => goToPhoto(koujiName?.trim())}
            style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,
                    color:"#ecfdf5",fontSize:12,fontWeight:700,padding:"5px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            ← 写真台帳
          </button>
          <button onClick={()=>setMode("input")} style={{background:"#1e3a5a",border:"1px solid #2a5a8a",color:"#93c5fd",padding:"7px 16px",borderRadius:7,fontSize:13,cursor:"pointer",fontWeight:600}}>← 戻る</button>
          <div style={{marginLeft:"auto",display:"flex",gap:8}}>
            <button onClick={()=>window.print()} style={{background:"#1e3a5a",border:"1px solid #2a5a8a",color:"#93c5fd",padding:"7px 16px",borderRadius:7,fontSize:13,cursor:"pointer",fontWeight:600}}>🖨️ 印刷</button>
            <button onClick={handlePdfDownload} style={{background:"#0284c7",border:"none",color:"white",padding:"7px 16px",borderRadius:7,fontSize:13,cursor:"pointer",fontWeight:600}}>📥 PDF保存</button>
          </div>
        </div>
        <div style={{padding:"24px 0", display:"flex", justifyContent:"center"}}>
          <div style={{background:"white", boxShadow:"0 4px 20px rgba(0,0,0,0.3)", padding:"10mm 12mm"}}>
            <PrintSheet koujiName={koujiName} koujiAddress={koujiAddress} clientName={clientName} date={date} dateJoto={dateJoto} dateChakko={dateChakko} spec={spec} kawaraShu={kawaraShu} kawaraColor={kawaraColor} hanbaKakuRate={effectiveHanbaKakuRate} tileRows={tileRows} materialRows={materialRows} expenseRows={expenseRows} biko={biko} totalCost={totalCost} tileSub={tileSub} matSub={matSub} expSub={expSub} welfareCost={welfareCost} unchinTotal={unchinTotal} masterStdPrices={masterStdPrices} masterDiscounts={masterDiscounts} estimatePrice={estimatePrice} taxMode={taxMode} taxRate={masterCompanyInfo?.taxRate ?? 10} />
          </div>
        </div>
        {toast && <Toast key={toast.id} message={toast.msg} onClose={() => setToast(null)} />}
      </div>
    );
  }

  if (mode === "tile-purchase") {
    const printTileRows = tileOrderTileRows.filter(r => r.hinmei && Number(r.suryo) > 0);
    const handleTilePurchasePdfDownload = async () => {
      const el = document.getElementById("tile-purchase-print-area");
      if (!el) { showToast("PDF生成エラー：出力領域が見つかりません"); return; }
      showToast("PDF を生成中...");
      try {
        await html2pdf().set({
          margin: [8, 8, 8, 8],
          filename: `瓦発注書_${koujiName || "無題"}.pdf`,
          image: { type: "jpeg", quality: 0.97 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        }).from(el).save();
        showToast("📄 PDF を保存しました");
      } catch (e) {
        showToast("PDF生成エラー: " + e.message);
      }
    };

    return (
      <div style={{background:"#1a1a2e",minHeight:"100vh",fontFamily:"'Noto Sans JP', sans-serif"}}>
        <div className="no-print" style={{background:"#0d1b2a",padding:"12px 20px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid #2a4a6a",position:"sticky",top:0,zIndex:10}}>
          <button onClick={() => goToPhoto(koujiName?.trim())}
            style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,
                    color:"#ecfdf5",fontSize:12,fontWeight:700,padding:"5px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            ← 写真台帳
          </button>
          <button onClick={()=>setMode("input")} style={{background:"#1e3a5a",border:"1px solid #2a5a8a",color:"#93c5fd",padding:"7px 16px",borderRadius:7,fontSize:13,cursor:"pointer",fontWeight:600}}>← 戻る</button>
          <div style={{fontSize:14,fontWeight:700,color:"#fbbf24",marginLeft:4}}>🏠 瓦発注書</div>
          <div style={{marginLeft:"auto",display:"flex",gap:8}}>
            <button onClick={syncOrderFromBudget} style={{background:"#065f46",border:"1px solid #10b981",color:"#a7f3d0",padding:"7px 16px",borderRadius:7,fontSize:13,cursor:"pointer",fontWeight:600}}>↩ 予算から再反映</button>
            <button onClick={()=>window.print()} style={{background:"#1e3a5a",border:"1px solid #2a5a8a",color:"#93c5fd",padding:"7px 16px",borderRadius:7,fontSize:13,cursor:"pointer",fontWeight:600}}>🖨️ 印刷</button>
            <button onClick={handleTilePurchasePdfDownload} style={{background:"#0284c7",border:"none",color:"white",padding:"7px 16px",borderRadius:7,fontSize:13,cursor:"pointer",fontWeight:600}}>📥 PDF保存</button>
          </div>
        </div>

        <div className="no-print" style={{maxWidth:700,margin:"0 auto",padding:"20px 16px",display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:"#0b1e30",border:"1px solid #1d3d5c",borderRadius:10,padding:"16px"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#93c5fd",marginBottom:12}}>配達情報</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"1/-1"}}>
                <label style={{fontSize:11,color:"#7aadcf",fontWeight:600}}>仕入れ先名</label>
                <input style={I} value={tileOrderSupplier} onChange={e=>setTileOrderSupplier(e.target.value)} placeholder="例：鶴弥株式会社" />
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"1/-1"}}>
                <label style={{fontSize:11,color:"#7aadcf",fontWeight:600}}>現場住所（配達先）</label>
                <input
                  style={I}
                  value={tileOrderDeliveryAddress}
                  onChange={e => setTileOrderDeliveryAddress(e.target.value)}
                  placeholder={koujiAddress || "配達先住所（例：富山県魚津市○○）"}
                  onFocus={() => {
                    if (!tileOrderDeliveryAddress && koujiAddress) {
                      setTileOrderDeliveryAddress(koujiAddress);
                    }
                  }}
                />
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <label style={{fontSize:11,color:"#7aadcf",fontWeight:600}}>配達日</label>
                <input type="date" style={I} value={tileOrderDeliveryDate} onChange={e=>setTileOrderDeliveryDate(e.target.value)} />
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <label style={{fontSize:11,color:"#7aadcf",fontWeight:600}}>配達時間</label>
                <input style={I} value={tileOrderDeliveryTime} onChange={e=>setTileOrderDeliveryTime(e.target.value)} placeholder="例：午前中、10時以降" />
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:"1/-1"}}>
                <label style={{fontSize:11,color:"#7aadcf",fontWeight:600}}>備考</label>
                <textarea rows={3} style={{...I,resize:"vertical"}} value={tileOrderNote} onChange={e=>setTileOrderNote(e.target.value)} placeholder="特記事項など" />
              </div>
            </div>
          </div>
          <div style={{background:"#0b1e30",border:"1px solid #1d3d5c",borderRadius:10,padding:"16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:"#93c5fd"}}>瓦品目</div>
              <button
                onClick={addTileOrderTileRow}
                style={{background:"#92400e",border:"none",color:"#fff",padding:"7px 14px",borderRadius:7,fontSize:12,cursor:"pointer",fontWeight:700}}
              >＋ 行追加</button>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{borderBottom:"1px solid #334155"}}>
                  <th style={{padding:"6px 8px",textAlign:"left",color:"#94a3b8",fontWeight:600,fontSize:11}}>品名</th>
                  <th style={{padding:"6px 8px",textAlign:"right",color:"#94a3b8",fontWeight:600,fontSize:11,width:90}}>数量</th>
                  <th style={{padding:"6px 8px",textAlign:"center",color:"#94a3b8",fontWeight:600,fontSize:11,width:72}}>単位</th>
                  <th style={{width:44}}></th>
                </tr>
              </thead>
              <tbody>
                {tileOrderTileRows.map((row) => (
                  <tr key={row.id} style={{borderBottom:"1px solid #1e293b"}}>
                    <td style={{padding:"4px 4px"}}>
                      <input
                        value={row.hinmei}
                        onChange={e => updTileOrderTileRow(row.id, "hinmei", e.target.value)}
                        onFocus={e => e.target.select()}
                        onKeyDown={focusNextInput}
                        style={I}
                        placeholder="品名"
                      />
                    </td>
                    <td style={{padding:"4px 4px"}}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.suryo}
                        onChange={e => updTileOrderTileRow(row.id, "suryo", toHalfWidth(e.target.value))}
                        onFocus={e => e.target.select()}
                        onKeyDown={focusNextInput}
                        style={{...I, textAlign:"right"}}
                      />
                    </td>
                    <td style={{padding:"4px 4px"}}>
                      <input
                        value={row.tani}
                        onChange={e => updTileOrderTileRow(row.id, "tani", e.target.value)}
                        onFocus={e => e.target.select()}
                        style={{...I, width:64, textAlign:"center"}}
                      />
                    </td>
                    <td style={{padding:"4px 4px",textAlign:"center"}}>
                      <button
                        onClick={() => removeTileOrderTileRow(row.id)}
                        style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",color:"#fca5a5",borderRadius:4,padding:"4px 8px",cursor:"pointer",fontSize:12}}
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{background:"#0b1e30",border:"1px solid #1d3d5c",borderRadius:10,padding:"16px",marginTop:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:"#fbbf24"}}>副資材品目</div>
              <button
                onClick={addTileOrderMaterialRow}
                style={{background:"#78350f",border:"none",color:"#fff",padding:"7px 14px",borderRadius:7,fontSize:12,cursor:"pointer",fontWeight:700}}
              >＋ 行追加</button>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{borderBottom:"1px solid #334155"}}>
                  <th style={{padding:"6px 8px",textAlign:"left",color:"#94a3b8",fontWeight:600,fontSize:11}}>品名</th>
                  <th style={{padding:"6px 8px",textAlign:"right",color:"#94a3b8",fontWeight:600,fontSize:11,width:90}}>数量</th>
                  <th style={{padding:"6px 8px",textAlign:"center",color:"#94a3b8",fontWeight:600,fontSize:11,width:72}}>単位</th>
                  <th style={{padding:"6px 8px",textAlign:"left",color:"#94a3b8",fontWeight:600,fontSize:11}}>備考</th>
                  <th style={{width:44}}></th>
                </tr>
              </thead>
              <tbody>
                {tileOrderMaterialRows.map(row => (
                  <tr key={row.id} style={{borderBottom:"1px solid #1e293b"}}>
                    <td style={{padding:"4px 4px"}}>
                      <input
                        value={row.hinmei}
                        onChange={e => updTileOrderMaterialRow(row.id, "hinmei", e.target.value)}
                        onFocus={e => e.target.select()}
                        onKeyDown={focusNextInput}
                        style={I}
                      />
                    </td>
                    <td style={{padding:"4px 4px"}}>
                      <input
                        type="text" inputMode="decimal"
                        value={row.suryo}
                        onChange={e => updTileOrderMaterialRow(row.id, "suryo", toHalfWidth(e.target.value))}
                        onFocus={e => e.target.select()}
                        onKeyDown={focusNextInput}
                        style={{...I, textAlign:"right"}}
                      />
                    </td>
                    <td style={{padding:"4px 4px"}}>
                      <input
                        value={row.tani}
                        onChange={e => updTileOrderMaterialRow(row.id, "tani", e.target.value)}
                        onFocus={e => e.target.select()}
                        style={{...I, width:64, textAlign:"center"}}
                      />
                    </td>
                    <td style={{padding:"4px 4px"}}>
                      <input
                        value={row.biko || ""}
                        onChange={e => updTileOrderMaterialRow(row.id, "biko", e.target.value)}
                        onFocus={e => e.target.select()}
                        style={I}
                      />
                    </td>
                    <td style={{padding:"4px 4px",textAlign:"center"}}>
                      <button
                        onClick={() => removeTileOrderMaterialRow(row.id)}
                        style={{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",color:"#fca5a5",borderRadius:4,padding:"4px 8px",cursor:"pointer",fontSize:12}}
                      >×</button>
                    </td>
                  </tr>
                ))}
                {tileOrderMaterialRows.length === 0 && (
                  <tr><td colSpan={5} style={{textAlign:"center",color:"#475569",padding:"16px 0",fontSize:12}}>
                    「＋ 行追加」で副資材を追加できます
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {printTileRows.length === 0 && (
            <div style={{background:"#1c1107",border:"1px solid #d97706",borderRadius:8,padding:"12px 16px",color:"#fbbf24",fontSize:13}}>
              ⚠ 瓦明細に品目がありません。入力画面で瓦品目を追加してください。
            </div>
          )}
          <div style={{fontSize:12,color:"#475569",textAlign:"center"}}>↓ 印刷プレビュー（印刷時はフォームは非表示になります）</div>
        </div>

        <div style={{padding:"0 0 40px", display:"flex", justifyContent:"center"}}>
          <div style={{background:"white", boxShadow:"0 4px 20px rgba(0,0,0,0.3)", padding:"10mm 12mm"}}>
            <TilePurchaseOrderSheet
              supplierName={tileOrderSupplier}
              tileRows={tileOrderTileRows}
              materialRows={tileOrderMaterialRows}
              koujiName={koujiName}
              kawaraShu={kawaraShu}
              kawaraColor={kawaraColor}
              deliveryAddress={tileOrderDeliveryAddress || koujiAddress}
              deliveryDate={tileOrderDeliveryDate}
              deliveryTime={tileOrderDeliveryTime}
              note={tileOrderNote}
              companyInfo={masterCompanyInfo}
            />
          </div>
        </div>
        {toast && <Toast key={toast.id} message={toast.msg} onClose={() => setToast(null)} />}
      </div>
    );
  }

  if (mode === "dashboard") return (
    <>
      <DashboardScreen
        projectList={projectList}
        masterStdPrices={masterStdPrices}
        masterDiscounts={masterDiscounts}
        masterCompanyInfo={masterCompanyInfo}
        masterHouseMakers={masterHouseMakers}
        setMode={setMode}
        showToast={showToast}
        refreshKey={dashboardRefreshKey}
      />
      {toast && <Toast key={toast.id} message={toast.msg} onClose={() => setToast(null)} />}
    </>
  );

  // ★マスター設定画面の呼び出し（ここも残っています）
  if (mode === "master") return (
      <div style={{background:"#05111f", minHeight:"100vh", fontFamily:"'Noto Sans JP', sans-serif", color:"#dde8f2"}}>
         <MasterSettings masterMats={masterMats} setMasterMats={setMasterMats} masterDiscounts={masterDiscounts} setMasterDiscounts={setMasterDiscounts} masterStdPrices={masterStdPrices} setMasterStdPrices={setMasterStdPrices} masterSuppliers={masterSuppliers} setMasterSuppliers={setMasterSuppliers} masterSupplierMap={masterSupplierMap} setMasterSupplierMap={setMasterSupplierMap} masterCompanyInfo={masterCompanyInfo} setMasterCompanyInfo={setMasterCompanyInfo} masterHouseMakers={masterHouseMakers} setMasterHouseMakers={setMasterHouseMakers} masterMatCategories={masterMatCategories} setMasterMatCategories={setMasterMatCategories} projectList={projectList} onClose={() => setMode("input")} showToast={showToast} applySupplierRename={applySupplierRename} applySupplierDelete={applySupplierDelete} />
         {toast && <Toast key={toast.id} message={toast.msg} onClose={() => setToast(null)} />}
      </div>
  );

  return (
    <div className="no-print" style={{minHeight:"100vh",background:"#05111f",fontFamily:"'Noto Sans JP', sans-serif",color:"#dde8f2",paddingBottom:40}}>
      {/* ★自動積算モーダルとカタログモーダルの呼び出し */}
      {showAutoEstimate && <AutoEstimateModal area={yochiArea} onApply={handleApplyAutoEstimate} onClose={()=>setShowAutoEstimate(false)} />}
      {catalogType && <CatalogModal type={catalogType} kawaraShu={kawaraShu} masterMats={masterMats} masterStdPrices={masterStdPrices} onApply={handleApplyCatalog} onClose={()=>setCatalogType(null)} />}
      <SectionNav />

      <div style={{background:"linear-gradient(90deg,#064e3b,#022c22)",borderBottom:"1px solid #065f46",padding:"14px 24px",display:"flex",alignItems:"center",flexWrap:"wrap",gap:14, position:"sticky", top:0, zIndex:100}}>
        {/* 写真台帳に戻るボタン */}
        <button onClick={() => goToPhoto()}
          style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,
                  color:"#ecfdf5",fontSize:12,fontWeight:700,padding:"5px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
          ← 写真台帳
        </button>
        <img src={logoImg} alt="logo" style={{width:38,height:38,objectFit:"contain"}} />
        <div style={{fontSize:17,fontWeight:700,letterSpacing:3,color:"#ecfdf5"}}>実行予算</div>
        <div style={{fontSize:12,color:"#6ee7b7",fontWeight:700,marginLeft:4,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{koujiName || "—"}</div>
        <select value={status} onChange={e => updateStatus(e.target.value)}
          style={{background:"#0b1e30",border:"1px solid #1d3d5c",borderRadius:6,
                  color:"#dde8f2",fontSize:11,padding:"4px 8px",cursor:"pointer",marginLeft:8}}>
          <option value="draft">📝 見積中</option>
          <option value="in_progress">🔨 施工中</option>
          <option value="completed">✅ 完了</option>
        </select>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {autoSaveStatus === "saving" && <span style={{fontSize:11,color:"#94a3b8"}}>保存中...</span>}
          {autoSaveStatus === "saved"  && <span style={{fontSize:11,color:"#6ee7b7"}}>✓ 自動保存済み</span>}
          {autoSaveStatus === "error"  && <span style={{fontSize:11,color:"#f87171"}}>⚠ 保存失敗</span>}
          <button onClick={()=>setMode("projects")} style={{background:"transparent",border:"1px solid #065f46",color:"#6ee7b7",padding:"8px 14px",borderRadius:8,fontSize:12,cursor:"pointer",fontWeight:700}}>← 現場一覧</button>
          <div style={{width:1, background:"#065f46", margin:"0 2px"}}></div>
          <button onClick={loadProjectFromCloud} style={{background:"#475569",border:"none",color:"#fff",padding:"8px 14px",borderRadius:8,fontSize:12,fontWeight:700}}>☁️ 読込</button>
          <button onClick={saveProjectToCloud} style={{background:"#0ea5e9",border:"none",color:"#fff",padding:"8px 14px",borderRadius:8,fontSize:12,fontWeight:700}}>☁️ 保存</button>
          <div style={{width:1, background:"#065f46", margin:"0 4px"}}></div>
          {/* ★マスター画面へ飛ぶボタン */}
          {history.canUndo && <button onClick={()=>{const lbl=history.lastLabel; history.undo(); showToast(`↶ 「${lbl}」を取り消しました`);}} style={{background:"#422006",border:"1px solid #a16207",color:"#fcd34d",padding:"8px 14px",borderRadius:8,fontSize:12,cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}} title={`取り消し: ${history.lastLabel}`}>↶ 元に戻す</button>}
          <button onClick={()=>setMode("master")} style={{background:"#1e3a8a",border:"1px solid #2563eb",color:"#bfdbfe",padding:"8px 14px",borderRadius:8,fontSize:12,cursor:"pointer",fontWeight:700}}>⚙️ マスター</button>
          <button onClick={()=>setMode("tile-purchase")} style={{background:"linear-gradient(135deg,#b45309,#92400e)",border:"none",color:"white",padding:"8px 18px",borderRadius:8,fontSize:13,fontWeight:700}}>🏠 瓦発注書</button>
          <button onClick={()=>{if(!koujiName||!koujiName.trim()){showToast("工事名を入力してから開いてください");return;}goToPhoto(koujiName.trim());}} style={{background:"linear-gradient(135deg,#ff6b35,#e85d2a)",border:"none",color:"white",padding:"8px 18px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}} title="同じ工事名で写真帳を開く">📷 写真帳</button>
          <button onClick={()=>setMode("preview")} style={{background:"linear-gradient(135deg,#10b981,#059669)",border:"none",color:"white",padding:"8px 18px",borderRadius:8,fontSize:13,fontWeight:700}}>📄 PDF</button>
        </div>
      </div>

      <div style={{maxWidth:1000,margin:"0 auto",padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}>
        <Card title="案件情報" id="section-info" color="#10b981">
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",gap:12}}>
            <Field label="工事名称"><input style={I} value={koujiName} onChange={e=>setKoujiName(e.target.value)} /></Field>
            <Field label="請負先名"><input style={I} value={clientName} onChange={e=>setClientName(e.target.value)} /></Field>
            <Field label="工事場所"><input style={I} value={koujiAddress} onChange={e=>setKoujiAddress(e.target.value)} /></Field>
            <div style={{display:"flex", gap:10}}>
                <Field label="着工予定"><input type="date" style={I} value={dateChakko} onChange={e=>setDateChakko(e.target.value)}/></Field>
                <Field label="上棟予定"><input type="date" style={I} value={dateJoto} onChange={e=>setDateJoto(e.target.value)}/></Field>
            </div>
            <Field label="工事仕様"><input style={I} value={spec} onChange={e=>setSpec(e.target.value)}/></Field>
            <div style={{display:"flex", gap:10}}>
                <Field label="瓦名称"><select style={I} value={kawaraShu} onChange={e=>setKawaraShu(e.target.value)}>{PRODUCT_NAMES.map(t=><option key={t} value={t}>{t}</option>)}</select></Field>
                <Field label="瓦の色"><input style={I} value={kawaraColor} onChange={e=>setKawaraColor(e.target.value)}/></Field>
            </div>
            <Field label="瓦 仕入先">
              <select style={I} value={tileSupplier} onChange={e=>setTileSupplier(e.target.value)}>
                <option value="">（未設定）</option>
                {masterSuppliers.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="ハウスメーカー">
              <select style={I} value={houseMakerName} onChange={e => setHouseMakerName(e.target.value)}>
                <option value="">（未設定）</option>
                {masterHouseMakers.map(h => (
                  <option key={h.name} value={h.name}>{h.name}（{h.kakuRate}%）</option>
                ))}
              </select>
            </Field>
            <div style={{display:"flex", gap:10, alignItems:"flex-end"}}>
                <Field label={
                  houseMakerName && hanbaKakuRate === ""
                    ? `販売掛率 (%) ← ${houseMakerName}設定（${effectiveHanbaKakuRate}%）使用中`
                    : "販売掛率 (%) ※入力時はHM設定より優先"
                }>
                    <input type="number" step="0.1" min="0" max="100" style={{...I, textAlign:"right", color:"#fbbf24", fontWeight:700}} value={hanbaKakuRate} onChange={e=>setHanbaKakuRate(e.target.value)} placeholder={
                      houseMakerName && hanbaKakuRate === ""
                        ? `${effectiveHanbaKakuRate}% (HM設定)`
                        : "未入力=マスター掛率を使用"
                    } />
                </Field>
                <button onClick={applyHanbaKakuToAllRows} disabled={effectiveHanbaKakuRate === ""} style={{background: effectiveHanbaKakuRate !== "" ? "#92400e" : "#1e293b", border:"1px solid #78350f", color: effectiveHanbaKakuRate !== "" ? "#fde68a" : "#475569", padding:"8px 14px", borderRadius:6, cursor: effectiveHanbaKakuRate !== "" ? "pointer" : "default", fontWeight:700, fontSize:12, whiteSpace:"nowrap", marginBottom:0}}>全行に適用</button>
            </div>
            {/* ★野地面積に「自動積算ボタン」を完全復活！ */}
            <div style={{display:"flex", gap:10}}>
                <Field label="野地面積（m²）">
                    <div style={{display:"flex", gap:8}}>
                        <input type="number" step="0.1" style={{...I, textAlign:"right", color:"#67e8f9"}} value={yochiArea} onChange={e=>setYochiArea(e.target.value)} />
                        <button onClick={()=>setShowAutoEstimate(true)} disabled={!yochiArea || Number(yochiArea)<=0} style={{background:"#0ea5e9", border:"none", color:"#fff", padding:"0 16px", borderRadius:6, cursor:"pointer", fontWeight:700, whiteSpace:"nowrap", opacity: (!yochiArea || Number(yochiArea)<=0) ? 0.5 : 1}}>⚡自動積算</button>
                    </div>
                </Field>
                <Field label="資材運賃単価"><input type="number" style={{...I, textAlign:"right", color:"#34d399", fontWeight:"bold"}} value={unchinTanka} onChange={e=>setUnchinTanka(e.target.value)}/></Field>
            </div>
          </div>
        </Card>

        {/* サマリー */}
        <div style={{display:"flex", gap:10, flexWrap:"wrap", justifyContent:"flex-end"}}>
            <div style={{background:"#0b1e30", border:"1px solid #1d3d5c", borderRadius:8, padding:"8px 16px", textAlign:"right"}}><div style={{fontSize:10, color:"#94a3b8"}}>瓦代金</div><div style={{fontSize:14, fontWeight:700, color:"#60a5fa"}}>¥{tileSub.toLocaleString()}</div></div>
            <div style={{background:"#0b1e30", border:"1px solid #1d3d5c", borderRadius:8, padding:"8px 16px", textAlign:"right"}}><div style={{fontSize:10, color:"#94a3b8"}}>副資材</div><div style={{fontSize:14, fontWeight:700, color:"#fbbf24"}}>¥{matSub.toLocaleString()}</div></div>
            <div style={{background:"#0b1e30", border:"1px solid #1d3d5c", borderRadius:8, padding:"8px 16px", textAlign:"right"}}><div style={{fontSize:10, color:"#94a3b8"}}>労務経費</div><div style={{fontSize:14, fontWeight:700, color:"#f9a8d4"}}>¥{expSub.toLocaleString()}</div></div>
            <div style={{background:"#0b1e30", border:"1px solid #1d3d5c", borderRadius:8, padding:"8px 16px", textAlign:"right"}}><div style={{fontSize:10, color:"#94a3b8"}}>資材運賃</div><div style={{fontSize:14, fontWeight:700, color:"#34d399"}}>¥{unchinTotal.toLocaleString()}</div></div>
            <div style={{background:"#831843", border:"1px solid #f43f5e", borderRadius:8, padding:"8px 20px", textAlign:"right", flex:"1 1 100%", maxWidth:"300px"}}><div style={{fontSize:10, color:"#fecdd3"}}>実行予算（合計）</div><div style={{fontSize:22, fontWeight:900, color:"#fff1f2"}}>¥{totalCost.toLocaleString()}</div></div>
        </div>

        {/* 枚数整合性チェック */}
        {(() => {
          const area = Number(yochiArea) || 0;
          if (area <= 0) return null;
          const totalPieces = tileRows.filter(r => r.hinmei && r.suryo && r.tani === "枚").reduce((s, r) => s + (Number(r.suryo) || 0), 0);
          if (totalPieces === 0) return null;
          const expected = Math.round(area * (TILES_PER_SQM[kawaraShu] || 16));
          const diffRate = Math.abs(totalPieces - expected) / expected;
          if (diffRate < 0.15) return null;
          const isOver = totalPieces > expected;
          return (
            <div style={{background:"#2d1b0f",border:"1px solid #d97706",borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,fontSize:12}}>
              <span style={{fontSize:16}}>⚠️</span>
              <span style={{color:"#fcd34d",fontWeight:700}}>
                入力枚数 <b>{totalPieces.toLocaleString()}枚</b> が 野地面積 {area}㎡ の概算 <b>{expected.toLocaleString()}枚</b> より
                <span style={{color:isOver?"#fca5a5":"#93c5fd"}}> {Math.round(diffRate*100)}% {isOver?"多い":"少ない"}</span> です。ご確認ください。
              </span>
            </div>
          );
        })()}

        {/* 粗利計算パネル */}
        {(() => {
          const tsubo = yochiArea ? Number(yochiArea) / TSUBO_RATE : 0;
          const area  = Number(yochiArea) || 0;
          const grossRateGood = masterCompanyInfo?.grossRateGood ?? 30;
          const grossRateWarn = masterCompanyInfo?.grossRateWarn ?? 20;
          const rateEstimate  = targetGrossRate < 100 ? Math.ceil(totalCost / (1 - Number(targetGrossRate) / 100)) : 0;
          const taxBreakdown = calcTaxBreakdown({
            estimatePrice: grossMode === "price" ? estimatePrice : rateEstimate,
            taxMode,
            taxRate: masterCompanyInfo?.taxRate ?? 10,
          });
          const ep = taxBreakdown.exclusive;
          const priceGrossRate = ep > 0 ? ((ep - totalCost) / ep * 100) : 0;
          const displayEstimate = grossMode === "rate" ? rateEstimate : ep;
          const displayGross    = grossMode === "rate" ? Number(targetGrossRate) : priceGrossRate;
          const displayProfit   = displayEstimate - totalCost;
          const QUICK_RATES = [10, 20, 30, 40];
          const panelNum = (label, val, color="#dde8f2", size=13) => (
            <div style={{display:"flex",flexDirection:"column",gap:2}}><div style={{fontSize:9,color:"#7aadcf",fontWeight:600}}>{label}</div><div style={{fontSize:size,fontWeight:700,color}}>{val}</div></div>
          );

          return (
            <div id="section-profit" style={{background:"#0b1e30",border:"1px solid #1d3d5c",borderRadius:12,overflow:"hidden",marginBottom:0}}>
              <div style={{background:"#071624",borderBottom:"1px solid #1d3d5c",padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:13,fontWeight:700,color:"#34d399",letterSpacing:1}}>粗利計算パネル</span>
                <div style={{display:"flex",gap:0,borderRadius:6,overflow:"hidden",border:"1px solid #1d3d5c",marginLeft:12}}>
                  <button onClick={()=>setGrossMode("rate")} style={{padding:"4px 14px",fontSize:11,fontWeight:700,border:"none",cursor:"pointer",background:grossMode==="rate"?"#064e3b":"#0b1e30",color:grossMode==="rate"?"#a7f3d0":"#64748b"}}>方式A：粗利率→見積</button>
                  <button onClick={()=>setGrossMode("price")} style={{padding:"4px 14px",fontSize:11,fontWeight:700,border:"none",cursor:"pointer",background:grossMode==="price"?"#064e3b":"#0b1e30",color:grossMode==="price"?"#a7f3d0":"#64748b"}}>方式B：見積→粗利率</button>
                </div>
                <div style={{display:"flex",gap:0,borderRadius:6,overflow:"hidden",border:"1px solid #1d3d5c",marginLeft:12}}>
                  <button onClick={()=>setTaxMode("exclusive")} style={{padding:"4px 10px",fontSize:11,fontWeight:700,border:"none",cursor:"pointer",background:taxMode==="exclusive"?"#0c4a6e":"#0b1e30",color:taxMode==="exclusive"?"#bae6fd":"#64748b"}}>税抜入力</button>
                  <button onClick={()=>setTaxMode("inclusive")} style={{padding:"4px 10px",fontSize:11,fontWeight:700,border:"none",cursor:"pointer",background:taxMode==="inclusive"?"#0c4a6e":"#0b1e30",color:taxMode==="inclusive"?"#bae6fd":"#64748b"}}>税込入力</button>
                </div>
              </div>
              <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"flex",alignItems:"flex-end",gap:16,flexWrap:"wrap"}}>
                  {grossMode === "rate" ? (
                    <div style={{display:"flex",flexDirection:"column",gap:4}}>
                      <label style={{fontSize:11,color:"#7aadcf",fontWeight:600}}>目標粗利率 (%)</label>
                      <input type="number" step="0.5" min="0" max="99" value={targetGrossRate} onChange={e=>setTargetGrossRate(e.target.value)} style={{...I,width:110,textAlign:"right",color:"#34d399",fontWeight:700,fontSize:15}}/>
                    </div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:4}}>
                      <label style={{fontSize:11,color:"#7aadcf",fontWeight:600}}>{taxMode === "inclusive" ? "見積金額（税込入力）" : "見積金額（税抜入力）"}</label>
                      <input type="number" step="1000" value={estimatePrice} onChange={e=>setEstimatePrice(e.target.value)} style={{...I,width:150,textAlign:"right",color:"#fbbf24",fontWeight:700,fontSize:15}} placeholder="0"/>
                    </div>
                  )}
                  <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
                    <div style={{background:"#071e36",border:"1px solid #1d3d5c",borderRadius:8,padding:"8px 16px"}}>{panelNum("原価合計", `¥${totalCost.toLocaleString()}`, "#94a3b8")}</div>
                    <div style={{fontSize:18,color:"#334155"}}>→</div>
                    <div style={{background:"#064e3b",border:"1px solid #10b981",borderRadius:8,padding:"8px 16px"}}>{panelNum("見積金額", displayEstimate > 0 ? `¥${displayEstimate.toLocaleString()}` : "—", "#34d399", 16)}</div>
                    <div style={{background:"#1e1b4b",border:"1px solid #6366f1",borderRadius:8,padding:"8px 16px"}}>{panelNum("粗利益", displayProfit > 0 ? `¥${displayProfit.toLocaleString()}` : "—", "#818cf8")}</div>
                    <div style={{background:displayGross >= grossRateGood ? "#064e3b" : displayGross >= grossRateWarn ? "#1c1917" : "#2d0f0f", border:`1px solid ${displayGross >= grossRateGood ? "#10b981" : displayGross >= grossRateWarn ? "#d97706" : "#ef4444"}`,borderRadius:8,padding:"8px 16px"}}>
                      {panelNum("粗利率", displayEstimate > 0 ? `${displayGross.toFixed(1)} %` : "—", displayGross >= grossRateGood ? "#34d399" : displayGross >= grossRateWarn ? "#fbbf24" : "#f87171", 16)}
                    </div>
                  </div>
                </div>
                {area > 0 && (
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <div style={{background:"#071e36",border:"1px solid #1d3d5c",borderRadius:8,padding:"8px 14px",display:"flex",gap:16}}>
                      {panelNum(`原価 m²単価 (${area.toFixed(1)}m²)`, `¥${Math.ceil(totalCost/area).toLocaleString()}`, "#60a5fa")}
                      {panelNum(`原価 坪単価 (${tsubo.toFixed(2)}坪)`, `¥${Math.ceil(totalCost/tsubo).toLocaleString()}`, "#60a5fa")}
                    </div>
                    {displayEstimate > 0 && (
                      <div style={{background:"#052e16",border:"1px solid #16a34a",borderRadius:8,padding:"8px 14px",display:"flex",gap:16}}>
                        {panelNum("見積 m²単価", `¥${Math.ceil(displayEstimate/area).toLocaleString()}`, "#86efac")}
                        {panelNum("見積 坪単価", `¥${Math.ceil(displayEstimate/tsubo).toLocaleString()}`, "#86efac")}
                      </div>
                    )}
                  </div>
                )}
                {displayEstimate > 0 && (
                  <div style={{fontSize:11,color:"#64748b",marginTop:4}}>
                    税抜 ¥{taxBreakdown.exclusive.toLocaleString()} ／ 消費税（{masterCompanyInfo?.taxRate ?? 10}%） ¥{taxBreakdown.tax.toLocaleString()} ／ 税込 ¥{taxBreakdown.inclusive.toLocaleString()}
                  </div>
                )}
                <div>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:6}}>粗利早見表</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {QUICK_RATES.map(r => {
                      const est = Math.ceil(totalCost / (1 - r/100));
                      const profit = est - totalCost;
                      const isActive = Math.abs(displayGross - r) < 0.5;
                      return (
                        <button key={r} onClick={()=>{setGrossMode("rate");setTargetGrossRate(r);}} style={{background:isActive?"#064e3b":"#0b1e30",border:`1px solid ${isActive?"#10b981":"#1d3d5c"}`,borderRadius:8,padding:"8px 14px",cursor:"pointer",textAlign:"left",minWidth:110}}>
                          <div style={{fontSize:12,fontWeight:900,color:isActive?"#a7f3d0":"#94a3b8",marginBottom:2}}>粗利 {r}%</div>
                          <div style={{fontSize:12,fontWeight:700,color:"#dde8f2"}}>¥{est.toLocaleString()}</div>
                          <div style={{fontSize:10,color:"#64748b"}}>利益 ¥{profit.toLocaleString()}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ★瓦明細：カタログボタン完全復活！ */}
        <Card title="瓦 計算明細" id="section-tile" color="#3b82f6" action={<div style={{display:"flex",gap:6}}><button onClick={()=>setCatalogType('tile')} style={{background:"#0369a1",color:"#fff",padding:"6px 12px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:"bold"}}>📖 カタログ</button><button onClick={addTileRow} style={{background:"#1e3a8a",color:"#fff",padding:"6px 12px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:"bold"}}>＋ 行追加</button></div>}>
          <div className="table-wrapper"><table className="res-table"><thead>
            <tr><th>操作</th><th>品名</th><th>数量</th><th>単位</th><th style={{textAlign:"right"}}>単価</th><th style={{textAlign:"right"}}>原価単価</th><th style={{textAlign:"right"}}>金額</th><th>削除</th></tr>
          </thead>
          <tbody>{tileRows.map((row,idx)=>{
            const { costPrice, rowTotal } = calcTileRowCost({ row, kawaraShu, kawaraColor, hanbaKakuRate: effectiveHanbaKakuRate, masterStdPrices, masterDiscounts });
            return (<tr key={row.id}><td><button onClick={()=>moveTileRow(idx,-1)}>▲</button></td><td><FilterInput value={row.hinmei} onChange={v=>updTileRow(row.id,"hinmei",v)} items={tileHinmeiOptions} onKeyDown={focusNextInput} /></td><td><input type="text" inputMode="decimal" value={row.suryo} onChange={e=>updTileRow(row.id,"suryo",toHalfWidth(e.target.value))} onFocus={e=>e.target.select()} onKeyDown={focusNextInput} style={{...I, textAlign:"right"}}/></td><td><input value={row.tani} onChange={e=>updTileRow(row.id,"tani",e.target.value)} onFocus={e=>e.target.select()} onKeyDown={focusNextInput} style={{...I, width:52, textAlign:"center", padding:"4px 4px"}}/></td><td><input type="text" inputMode="decimal" value={row.unitPrice} onChange={e=>updTileRow(row.id,"unitPrice",toHalfWidth(e.target.value))} onFocus={e=>e.target.select()} onKeyDown={focusNextInput} placeholder={masterStdPrices[kawaraShu]?.[row.hinmei] != null ? String(masterStdPrices[kawaraShu][row.hinmei]) : ""} style={{...I, textAlign:"right"}}/></td><td style={{textAlign:"right"}}>¥{costPrice.toLocaleString()}</td><td style={{textAlign:"right"}}>¥{rowTotal.toLocaleString()}</td><td><button onClick={()=>removeTileRow(row.id)}>×</button></td></tr>);
          })}</tbody></table></div>
        </Card>

        {/* ★副資材明細：カタログボタン完全復活！ */}
        <Card title="副資材 計算明細" id="section-material" color="#f59e0b" action={<div style={{display:"flex",gap:6}}><button onClick={()=>setCatalogType('material')} style={{background:"#9a3412",color:"#fff",padding:"6px 12px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:"bold"}}>📖 カタログ</button><button onClick={addMaterialRow} style={{background:"#78350f",color:"#fff",padding:"6px 12px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:"bold"}}>＋ 行追加</button></div>}>
          <div className="table-wrapper"><table className="res-table"><thead>
            <tr><th>品名</th><th>数量</th><th>単位</th><th>単価</th><th style={{textAlign:"right"}}>金額</th><th>削除</th></tr>
          </thead>
          <tbody>{materialRows.map((row)=>{
            const rowTotal = Math.ceil(Number(row.costPrice || 0) * Number(row.suryo || 0));
            return (<tr key={row.id}><td><FilterInput value={row.hinmei} onChange={v=>updMaterialRow(row.id,"hinmei",v)} items={Object.keys(masterMats)} onKeyDown={focusNextInput} /></td><td><input type="text" inputMode="decimal" value={row.suryo} onChange={e=>updMaterialRow(row.id,"suryo",toHalfWidth(e.target.value))} onFocus={e=>e.target.select()} onKeyDown={focusNextInput} style={{...I, textAlign:"right"}}/></td><td><input value={row.tani} onChange={e=>updMaterialRow(row.id,"tani",e.target.value)} onFocus={e=>e.target.select()} onKeyDown={focusNextInput} style={{...I, width:52, textAlign:"center", padding:"4px 4px"}}/></td><td><input type="text" inputMode="decimal" value={row.costPrice} onChange={e=>updMaterialRow(row.id,"costPrice",toHalfWidth(e.target.value))} onFocus={e=>e.target.select()} onKeyDown={focusNextInput} style={{...I, textAlign:"right"}}/></td><td style={{textAlign:"right"}}>¥{rowTotal.toLocaleString()}</td><td><button onClick={()=>removeMaterialRow(row.id)}>×</button></td></tr>);
          })}</tbody></table></div>
        </Card>

        {/* ★労務費明細：カタログボタン完全復活！ */}
        <Card title="労務・経費 計算明細" id="section-expense" color="#ec4899" action={<div style={{display:"flex",gap:6}}><button onClick={()=>setCatalogType('expense')} style={{background:"#9d174d",color:"#fff",padding:"6px 12px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:"bold"}}>📖 カタログ</button><button onClick={addExpenseRow} style={{background:"#831843",color:"#fff",padding:"6px 12px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:"bold"}}>＋ 行追加</button></div>}>
          <div className="table-wrapper"><table className="res-table"><thead>
            <tr><th>社保</th><th>項目</th><th>数量</th><th>単位</th><th>単価</th><th style={{textAlign:"right"}}>金額</th><th>削除</th></tr>
          </thead>
          <tbody>{expenseRows.map((row)=>{
            const rowTotal = Math.ceil(Number(row.costPrice || 0) * Number(row.suryo || 0));
            return (<tr key={row.id}><td><input type="checkbox" checked={row.isLabor} onChange={e=>updExpenseRow(row.id,"isLabor",e.target.checked)}/></td><td><FilterInput value={row.hinmei} onChange={v=>updExpenseRow(row.id,"hinmei",v)} items={EXPENSE_ITEMS} onKeyDown={focusNextInput} /></td><td><input type="text" inputMode="decimal" value={row.suryo} onChange={e=>updExpenseRow(row.id,"suryo",toHalfWidth(e.target.value))} onFocus={e=>e.target.select()} onKeyDown={focusNextInput} style={{...I, textAlign:"right"}}/></td><td><input value={row.tani} onChange={e=>updExpenseRow(row.id,"tani",e.target.value)} onFocus={e=>e.target.select()} onKeyDown={focusNextInput} style={{...I, width:52, textAlign:"center", padding:"4px 4px"}}/></td><td><input type="text" inputMode="decimal" value={row.costPrice} onChange={e=>updExpenseRow(row.id,"costPrice",toHalfWidth(e.target.value))} onFocus={e=>e.target.select()} onKeyDown={focusNextInput} style={{...I, textAlign:"right"}}/></td><td style={{textAlign:"right"}}>¥{rowTotal.toLocaleString()}</td><td><button onClick={()=>removeExpenseRow(row.id)}>×</button></td></tr>);
          })}</tbody></table></div>
        </Card>

        <Card title="メモ" id="section-biko" color="#a855f7">
          <textarea value={biko} onChange={e=>setBiko(e.target.value)} rows={3} style={{...I,resize:"vertical"}} placeholder="備考など"/>
        </Card>
      </div>
      {toast && <Toast key={toast.id} message={toast.msg} onClose={() => setToast(null)} />}
    </div>
  );
}
