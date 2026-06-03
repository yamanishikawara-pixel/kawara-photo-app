// src/DashboardScreen.jsx
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { projectStorageKey } from './projectStorage';
import { calculateBudget, calcTaxBreakdown, calcRateMetrics } from './budgetCalculations';
import logoImg from './logo-clear.png';

const STATUS_LABELS = { draft: "📝 見積中", in_progress: "🔨 施工中", completed: "✅ 完了" };

function readField(slug, field) {
  try {
    const raw = window.localStorage.getItem(projectStorageKey(slug, field));
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
}

function getFiscalYear(dateStr, fiscalYearStartMonth) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  return month >= fiscalYearStartMonth ? year : year - 1;
}

function grossColor(rate, good, warn) {
  return rate >= good ? "#34d399" : rate >= warn ? "#fbbf24" : "#f87171";
}

function CostBar({ row }) {
  if (row.totalCost <= 0) return <span style={{ color: "#475569", fontSize: 11 }}>データなし</span>;
  const segments = [
    { key: "tile",   rate: row.tileRate,   color: "#3b82f6", label: "瓦" },
    { key: "mat",    rate: row.matRate,    color: "#f59e0b", label: "副資材" },
    { key: "exp",    rate: row.expRate,    color: "#ec4899", label: "労務" },
    { key: "wel",    rate: row.welRate,    color: "#a855f7", label: "社保" },
    { key: "unchin", rate: row.unchinRate, color: "#34d399", label: "運賃" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 180 }}>
      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "#1e293b" }}>
        {segments.map(s => s.rate > 0 && (
          <div key={s.key} style={{ width: `${Math.min(s.rate, 100)}%`, background: s.color }} title={`${s.label}: ${s.rate.toFixed(1)}%`} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: "#94a3b8" }}>
        {segments.map(s => s.rate > 0.5 && (
          <span key={s.key}><span style={{ color: s.color }}>■</span> {s.label} {s.rate.toFixed(0)}%</span>
        ))}
      </div>
    </div>
  );
}

function grossBg(rate, good, warn) {
  return rate >= good ? "#064e3b" : rate >= warn ? "#2d1b0f" : "#2d0f0f";
}
function grossBorder(rate, good, warn) {
  return rate >= good ? "#10b981" : rate >= warn ? "#d97706" : "#ef4444";
}
const I_btn = (bg, border, color) => ({
  background: bg, border: `1px solid ${border}`, color, padding: "7px 14px",
  borderRadius: 7, fontSize: 12, cursor: "pointer", fontWeight: 700,
});

export function DashboardScreen({ projectList, masterStdPrices, masterDiscounts, masterCompanyInfo, masterHouseMakers = [], setMode, showToast }) {
  const taxRate = masterCompanyInfo?.taxRate ?? 10;
  const grossRateGood = masterCompanyInfo?.grossRateGood ?? 30;
  const grossRateWarn = masterCompanyInfo?.grossRateWarn ?? 20;
  const fiscalYearStartMonth = masterCompanyInfo?.fiscalYearStartMonth ?? 4;
  const [showArchived, setShowArchived] = useState(false);
  const [fiscalYearFilter, setFiscalYearFilter] = useState("all");

  // 全案件のデータを計算
  const allRows = useMemo(() => {
    return projectList.map(slug => {
      const kawaraShu     = readField(slug, "kawaraShu")     ?? "三州53版和型";
      const kawaraColor   = readField(slug, "kawaraColor")   ?? "銀鱗";
      const hanbaKakuRate = readField(slug, "hanbaKakuRate") ?? "";
      const houseMakerName = readField(slug, "houseMakerName") ?? "";
      const hm = masterHouseMakers.find(h => h.name === houseMakerName);
      const effectiveHanbaKakuRate = hanbaKakuRate !== "" ? hanbaKakuRate : (hm !== undefined ? hm.kakuRate : "");
      const insuranceRate = readField(slug, "insuranceRate") ?? 21.4;
      const unchinTanka   = readField(slug, "unchinTanka")   ?? 13;
      const tileRows      = readField(slug, "tileRows")      ?? [];
      const materialRows  = readField(slug, "materialRows")  ?? [];
      const expenseRows   = readField(slug, "expenseRows")   ?? [];
      const grossMode     = readField(slug, "grossMode")     ?? "rate";
      const targetGrossRate = readField(slug, "targetGrossRate") ?? 30;
      const estimatePriceRaw = readField(slug, "estimatePrice") ?? "";
      const taxMode       = readField(slug, "taxMode")       ?? "exclusive";
      const archived      = readField(slug, "archived")      ?? false;
      const status        = readField(slug, "status")        ?? "draft";
      const koujiName     = readField(slug, "koujiName")     ?? slug;
      const date          = readField(slug, "date")          ?? "";
      const yochiArea     = readField(slug, "yochiArea")     ?? "";

      const { totalCost, tileSub, matSub, expSub, welfareCost, unchinTotal } = calculateBudget({
        tileRows, materialRows, expenseRows,
        masterStdPrices, masterDiscounts,
        kawaraShu, kawaraColor, hanbaKakuRate: effectiveHanbaKakuRate, insuranceRate, unchinTanka,
      });

      // 見積金額（税抜）の確定
      let effectiveEstimate = 0;
      if (grossMode === "rate") {
        const r = Number(targetGrossRate) || 0;
        effectiveEstimate = r < 100 && totalCost > 0 ? Math.ceil(totalCost / (1 - r / 100)) : 0;
      } else {
        const tb = calcTaxBreakdown({ estimatePrice: estimatePriceRaw, taxMode, taxRate });
        effectiveEstimate = tb.exclusive;
      }

      const metrics = calcRateMetrics({ totalCost, tileSub, matSub, expSub, welfareCost, unchinTotal, estimatePrice: effectiveEstimate });
      const grossProfit = effectiveEstimate - totalCost;
      const fiscalYear = getFiscalYear(date, fiscalYearStartMonth);

      return { slug, koujiName, date, status, archived, totalCost, tileSub, matSub, expSub, welfareCost, unchinTotal, effectiveEstimate, grossProfit, yochiArea, fiscalYear, ...metrics };
    });
  }, [projectList, masterStdPrices, masterDiscounts, masterHouseMakers, taxRate, fiscalYearStartMonth]);

  // 年度一覧（表示用）
  const fiscalYears = useMemo(() => {
    const years = new Set(allRows.map(r => r.fiscalYear).filter(Boolean));
    return Array.from(years).sort((a, b) => b - a);
  }, [allRows]);

  // フィルタ後の行
  const filteredRows = useMemo(() => {
    return allRows.filter(r => {
      if (!showArchived && r.archived) return false;
      if (fiscalYearFilter !== "all" && String(r.fiscalYear) !== fiscalYearFilter) return false;
      return true;
    }).sort((a, b) => (b.date || "0000").localeCompare(a.date || "0000"));
  }, [allRows, showArchived, fiscalYearFilter]);

  // 集計
  const summary = useMemo(() => {
    const rows = filteredRows.filter(r => r.totalCost > 0);
    if (rows.length === 0) return null;
    const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
    const totalEst  = rows.reduce((s, r) => s + r.effectiveEstimate, 0);
    const totalProfit = totalEst - totalCost;
    const avgGrossRate = totalEst > 0 ? (totalProfit / totalEst * 100) : 0;
    return { count: rows.length, totalCost, totalEst, totalProfit, avgGrossRate };
  }, [filteredRows]);

  // XLSX エクスポート
  const handleExport = () => {
    const headers = ["工事名", "契約日", "ステータス", "原価合計", "瓦代金", "副資材", "労務経費", "社保", "運賃", "見積金額(税抜)", "粗利益", "粗利率(%)"];
    const data = filteredRows.map(r => [
      r.koujiName, r.date,
      STATUS_LABELS[r.status] ?? r.status,
      r.totalCost, r.tileSub, r.matSub, r.expSub, r.welfareCost, r.unchinTotal,
      r.effectiveEstimate, r.grossProfit,
      r.grossRate.toFixed(1),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    // 列幅
    ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 10 }, ...Array(9).fill({ wch: 14 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ダッシュボード");
    const suffix = fiscalYearFilter !== "all" ? `_${fiscalYearFilter}年度` : "";
    XLSX.writeFile(wb, `ダッシュボード${suffix}.xlsx`);
    showToast("XLSX をダウンロードしました");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#05111f", fontFamily: "'Noto Sans JP', sans-serif", color: "#dde8f2" }}>
      {/* ヘッダー */}
      <div style={{ background: "linear-gradient(90deg,#1e1b4b,#0f0a2e)", borderBottom: "1px solid #312e81", padding: "14px 24px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14, position: "sticky", top: 0, zIndex: 100 }}>
        <img src={logoImg} alt="logo" style={{ width: 34, height: 34, objectFit: "contain" }} />
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 2, color: "#c4b5fd" }}>📊 原価率ダッシュボード</div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* 年度フィルター */}
          <select value={fiscalYearFilter} onChange={e => setFiscalYearFilter(e.target.value)}
            style={{ background: "#1e1b4b", border: "1px solid #4338ca", borderRadius: 6, color: "#c4b5fd", fontSize: 12, padding: "6px 10px" }}>
            <option value="all">すべての年度</option>
            {fiscalYears.map(y => <option key={y} value={String(y)}>{y}年度</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94a3b8", cursor: "pointer", whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            アーカイブを含む
          </label>
          <button onClick={handleExport} style={I_btn("#1e1b4b", "#4338ca", "#c4b5fd")}>📥 XLSX出力</button>
          <button onClick={() => setMode("projects")} style={I_btn("transparent", "#312e81", "#a5b4fc")}>← 現場一覧</button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>

        {/* サマリーカード */}
        {summary && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 20px", textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#64748b" }}>対象案件数</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#dde8f2" }}>{summary.count}件</div>
            </div>
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 20px", textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#64748b" }}>原価合計</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#94a3b8" }}>¥{summary.totalCost.toLocaleString()}</div>
            </div>
            <div style={{ background: "#052e16", border: "1px solid #16a34a", borderRadius: 10, padding: "14px 20px", textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#86efac" }}>見積合計（税抜）</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#4ade80" }}>¥{summary.totalEst.toLocaleString()}</div>
            </div>
            <div style={{ background: "#1e1b4b", border: "1px solid #4338ca", borderRadius: 10, padding: "14px 20px", textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#a5b4fc" }}>粗利合計</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#818cf8" }}>¥{summary.totalProfit.toLocaleString()}</div>
            </div>
            <div style={{ background: grossBg(summary.avgGrossRate, grossRateGood, grossRateWarn), border: `1px solid ${grossBorder(summary.avgGrossRate, grossRateGood, grossRateWarn)}`, borderRadius: 10, padding: "14px 20px", textAlign: "right" }}>
              <div style={{ fontSize: 10, color: grossColor(summary.avgGrossRate, grossRateGood, grossRateWarn), opacity: 0.8 }}>平均粗利率</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: grossColor(summary.avgGrossRate, grossRateGood, grossRateWarn) }}>{summary.avgGrossRate.toFixed(1)}%</div>
            </div>
          </div>
        )}

        {/* 一覧テーブル */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#0f172a", borderBottom: "1px solid #1e3a5c" }}>
                {["工事名", "契約日", "ST", "原価合計", "見積(税抜)", "粗利益", "粗利率", "原価構成比"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: h === "原価構成比" ? "left" : "right", color: "#64748b", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "#475569", padding: "60px 0" }}>表示できる案件がありません</td></tr>
              )}
              {filteredRows.map(r => (
                <tr key={r.slug} style={{ borderBottom: "1px solid #1a2f45" }}
                  onPointerEnter={e => e.currentTarget.style.background = "#0a1a2e"}
                  onPointerLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <div style={{ fontWeight: 700, color: "#dde8f2", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.koujiName}</div>
                    {r.archived && <div style={{ fontSize: 10, color: "#64748b" }}>📦 アーカイブ済み</div>}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#64748b", whiteSpace: "nowrap" }}>{r.date || "—"}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap", fontSize: 11 }}>
                    <span style={{ color: r.status === "completed" ? "#86efac" : r.status === "in_progress" ? "#fcd34d" : "#94a3b8" }}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#94a3b8", whiteSpace: "nowrap" }}>
                    {r.totalCost > 0 ? `¥${r.totalCost.toLocaleString()}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#4ade80", whiteSpace: "nowrap" }}>
                    {r.effectiveEstimate > 0 ? `¥${r.effectiveEstimate.toLocaleString()}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: r.grossProfit >= 0 ? "#818cf8" : "#f87171", whiteSpace: "nowrap" }}>
                    {r.effectiveEstimate > 0 ? `¥${r.grossProfit.toLocaleString()}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {r.effectiveEstimate > 0 ? (
                      <span style={{ fontWeight: 900, fontSize: 13, color: grossColor(r.grossRate, grossRateGood, grossRateWarn) }}>{r.grossRate.toFixed(1)}%</span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <CostBar row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 凡例 */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16, fontSize: 11, color: "#64748b" }}>
          {[["瓦", "#3b82f6"], ["副資材", "#f59e0b"], ["労務経費", "#ec4899"], ["社保", "#a855f7"], ["運賃", "#34d399"]].map(([label, color]) => (
            <span key={label}><span style={{ color }}>■</span> {label}</span>
          ))}
          <span style={{ marginLeft: "auto" }}>
            粗利率：
            <span style={{ color: "#34d399" }}>■ {grossRateGood}%以上</span>
            {" | "}
            <span style={{ color: "#fbbf24" }}>■ {grossRateWarn}%以上</span>
            {" | "}
            <span style={{ color: "#f87171" }}>■ {grossRateWarn}%未満</span>
          </span>
        </div>
      </div>
    </div>
  );
}
