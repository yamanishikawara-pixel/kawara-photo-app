// src/PrintSheet.jsx
import { useRef } from 'react';
import { fmtDate } from './utils';
import { calcTileRowCost } from './calcUtils';
import { calcTaxBreakdown } from './budgetCalculations';

const JustifyText = ({ text, width = '4em', margin = '0 auto' }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', width, margin, fontSize: '0.92em' }}>
    {Array.from(text).map((c, i) => <span key={i}>{c}</span>)}
  </div>
);

export function PrintSheet({
    koujiName, koujiAddress, clientName, date, dateJoto, dateChakko,
    spec,
    kawaraShu, kawaraColor, hanbaKakuRate, tileRows, materialRows, expenseRows, biko,
    totalCost, tileSub, matSub, expSub, welfareCost, unchinTotal, masterStdPrices, masterDiscounts,
    estimatePrice = 0, taxMode = "exclusive", taxRate = 10,
}) {
  const areaRef = useRef(null);
  const taxBreakdown = calcTaxBreakdown({ estimatePrice, taxMode, taxRate });

  const printTileRows = tileRows.filter(r => r.hinmei || r.suryo);
  const printMatRows  = materialRows.filter(r => r.hinmei || r.suryo);
  const printExpRows  = expenseRows.filter(r => r.hinmei || r.suryo);

  const base  = { border: "1px solid #555", fontSize: 10, color: "#000", padding: "3px 5px", verticalAlign: "middle" };
  const label = { ...base, background: "#f0f0f0", fontWeight: "bold", textAlign: "center", whiteSpace: "nowrap" };
  const head  = { ...base, background: "#e8e8e8", textAlign: "center", fontWeight: "bold" };
  const sec   = (text) => (
    <div style={{ fontSize: 11, fontWeight: "bold", marginTop: 10, marginBottom: 3,
      borderLeft: "3px solid #333", paddingLeft: 6 }}>{text}</div>
  );

  return (
    <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
      <div id="print-area" ref={areaRef} style={{
        fontFamily: "'BIZ UDPGothic', 'MS PGothic', sans-serif",
        width: "186mm", padding: "0",
        background: "#fff", color: "#000",
        boxSizing: "border-box",
        margin: "0 auto",
      }}>

        {/* ── タイトル行 ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
          <div style={{ flex: 1 }}></div>
          <div style={{ flex: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 20, fontWeight: "bold", borderBottom: "2px solid #000", paddingBottom: 2, display: "flex", justifyContent: "space-between", minWidth: "6em", gap: "0.3em" }}>
              {Array.from("実行予算書").map((c, i) => <span key={i}>{c}</span>)}
            </div>
          </div>
          <div style={{ flex: 1, textAlign: "right", fontSize: 9, color: "#444" }}>積算日 {date ? date.replace(/-/g, '/') : ""}</div>
        </div>

        {/* ── ヘッダー格子 ── */}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginBottom: 8 }}>
          <tbody>
            <tr>
              <td style={{ ...label, width: "13%" }}><JustifyText text="工事件名" width="4em" /></td>
              <td style={{ ...base, width: "37%" }}>{koujiName}</td>
              <td style={{ ...label, width: "13%" }}><JustifyText text="請負先名" width="4em" /></td>
              <td style={{ ...base, width: "37%" }}>{clientName}</td>
            </tr>
            <tr>
              <td style={label}><JustifyText text="工事場所" width="4em" /></td>
              <td style={base}>{koujiAddress}</td>
              <td style={label}><JustifyText text="上棟予定" width="4em" /></td>
              <td style={base}>{dateJoto ? fmtDate(dateJoto) : ""}</td>
            </tr>
            <tr>
              <td style={label}><JustifyText text="使用瓦名" width="4em" /></td>
              <td style={base}>{kawaraShu} {kawaraColor}</td>
              <td style={label}><JustifyText text="着工予定" width="4em" /></td>
              <td style={base}>{dateChakko ? fmtDate(dateChakko) : ""}</td>
            </tr>
            <tr>
              <td style={label}><JustifyText text="工事仕様" width="4em" /></td>
              <td style={base} colSpan="3">{spec}</td>
            </tr>
          </tbody>
        </table>

        {/* ── (1) 瓦代金 ── */}
        {sec("(1) 瓦代金")}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginBottom: 6 }}>
          <thead>
            <tr>
              <th style={{ ...head, width: "42%", textAlign: "left", paddingLeft: 6 }}>名称</th>
              <th style={{ ...head, width: "16%" }}>数量</th>
              <th style={{ ...head, width: "20%", textAlign: "right", paddingRight: 5 }}>単価</th>
              <th style={{ ...head, width: "22%", textAlign: "right", paddingRight: 5 }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {printTileRows.map((row, i) => {
              const { costPrice, rowTotal } = calcTileRowCost({ row, kawaraShu, kawaraColor, hanbaKakuRate, masterStdPrices, masterDiscounts });
              return (
                <tr key={row.id ?? i}>
                  <td style={base}>{row.hinmei}</td>
                  <td style={{ ...base, textAlign: "right" }}>{row.suryo} {row.tani}</td>
                  <td style={{ ...base, textAlign: "right" }}>{costPrice.toLocaleString()}</td>
                  <td style={{ ...base, textAlign: "right" }}>{rowTotal.toLocaleString()}</td>
                </tr>
              );
            })}
            <tr>
              <td colSpan="3" style={{ ...base, textAlign: "right", fontWeight: "bold", background: "#f5f5f5" }}>瓦代金 小計</td>
              <td style={{ ...base, textAlign: "right", fontWeight: "bold", background: "#f5f5f5" }}>{tileSub.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        {/* ── (2) 副資材代 ── */}
        {sec("(2) 副資材代")}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginBottom: 6 }}>
          <thead>
            <tr>
              <th style={{ ...head, width: "42%", textAlign: "left", paddingLeft: 6 }}>品名</th>
              <th style={{ ...head, width: "16%" }}>数量</th>
              <th style={{ ...head, width: "20%", textAlign: "right", paddingRight: 5 }}>単価</th>
              <th style={{ ...head, width: "22%", textAlign: "right", paddingRight: 5 }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {printMatRows.map((row, i) => {
              const rowTotal = Math.ceil(Number(row.costPrice || 0) * Number(row.suryo || 0));
              return (
                <tr key={row.id ?? i}>
                  <td style={base}>{row.hinmei}</td>
                  <td style={{ ...base, textAlign: "right" }}>{row.suryo} {row.tani}</td>
                  <td style={{ ...base, textAlign: "right" }}>{Number(row.costPrice || 0).toLocaleString()}</td>
                  <td style={{ ...base, textAlign: "right" }}>{rowTotal.toLocaleString()}</td>
                </tr>
              );
            })}
            <tr>
              <td colSpan="3" style={{ ...base, textAlign: "right", fontWeight: "bold", background: "#f5f5f5" }}>副資材 小計</td>
              <td style={{ ...base, textAlign: "right", fontWeight: "bold", background: "#f5f5f5" }}>{matSub.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        {/* ── (3) 労務・経費 ── */}
        {sec("(3) 労務・経費")}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginBottom: 6 }}>
          <thead>
            <tr>
              <th style={{ ...head, width: "42%", textAlign: "left", paddingLeft: 6 }}>項目</th>
              <th style={{ ...head, width: "16%" }}>数量</th>
              <th style={{ ...head, width: "20%", textAlign: "right", paddingRight: 5 }}>単価</th>
              <th style={{ ...head, width: "22%", textAlign: "right", paddingRight: 5 }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {printExpRows.map((row, i) => {
              const rowTotal = Math.ceil(Number(row.costPrice || 0) * Number(row.suryo || 0));
              return (
                <tr key={row.id ?? i}>
                  <td style={base}>{row.hinmei}</td>
                  <td style={{ ...base, textAlign: "right" }}>{row.suryo} {row.tani}</td>
                  <td style={{ ...base, textAlign: "right" }}>{Number(row.costPrice || 0).toLocaleString()}</td>
                  <td style={{ ...base, textAlign: "right" }}>{rowTotal.toLocaleString()}</td>
                </tr>
              );
            })}
            <tr>
              <td colSpan="3" style={{ ...base, textAlign: "right", fontWeight: "bold", background: "#f5f5f5" }}>労務経費 小計</td>
              <td style={{ ...base, textAlign: "right", fontWeight: "bold", background: "#f5f5f5" }}>{expSub.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        {/* ── 合計 ── */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <table style={{ width: "52%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ ...base, textAlign: "right", width: "55%" }}>資材運賃</td>
                <td style={{ ...base, textAlign: "right", width: "45%" }}>{unchinTotal.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ ...base, textAlign: "right" }}>法定福利費</td>
                <td style={{ ...base, textAlign: "right" }}>{welfareCost.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ ...base, textAlign: "center", fontWeight: "bold", background: "#e0e0e0", border: "2px solid #000", fontSize: 11 }}>
                  実行予算 合計
                </td>
                <td style={{ ...base, textAlign: "right", fontWeight: "bold", background: "#e0e0e0", border: "2px solid #000", fontSize: 15 }}>
                  ¥{totalCost.toLocaleString()}
                </td>
              </tr>
              {taxBreakdown.exclusive > 0 && (
                <>
                  <tr>
                    <td style={{ ...base, textAlign: "right" }}>見積金額（税抜）</td>
                    <td style={{ ...base, textAlign: "right" }}>¥{taxBreakdown.exclusive.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style={{ ...base, textAlign: "right" }}>消費税（{Number(taxRate) || 10}%）</td>
                    <td style={{ ...base, textAlign: "right" }}>¥{taxBreakdown.tax.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style={{ ...base, textAlign: "right" }}>見積金額（税込）</td>
                    <td style={{ ...base, textAlign: "right" }}>¥{taxBreakdown.inclusive.toLocaleString()}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {biko && <div style={{ marginTop: 10, fontSize: 10 }}>【備考】{biko}</div>}
        <div style={{ marginTop: 14, textAlign: "right", fontSize: 9, color: "#555" }}>有限会社山西瓦店</div>
      </div>
    </div>
  );
}
