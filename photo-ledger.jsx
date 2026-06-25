import { useState, useRef, useCallback } from "react";

/* ============================================================
   写真台帳 — 理想形デモ（試作）
   ・施工前 / 施工後 を並べて記録
   ・写真を指でなぞって赤丸を描く（ドラッグで移動・タップで選択→削除/サイズ）
   ・赤丸はそのまま報告書プレビュー(A4)に反映される
   ・自分の端末の写真を選べる（どこにも保存しないデモ）
   ============================================================ */

let _id = 1;
const newId = () => _id++;

const makeRow = (n) => ({
  id: newId(),
  no: n,
  title: "",
  before: { src: null, circles: [] },
  after: { src: null, circles: [] },
  note: "",
});

export default function PhotoLedger() {
  const [rows, setRows] = useState([makeRow(1), makeRow(2)]);
  const [view, setView] = useState("edit"); // 'edit' | 'report'
  const [circleTarget, setCircleTarget] = useState(null); // {rowId, side} 赤丸モードON中の写真
  const [selected, setSelected] = useState(null); // {rowId, side, circleId}

  const update = (rowId, patch) =>
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));

  const updateSide = (rowId, side, patch) =>
    setRows((rs) =>
      rs.map((r) =>
        r.id === rowId ? { ...r, [side]: { ...r[side], ...patch } } : r
      )
    );

  const addRow = () =>
    setRows((rs) => [...rs, makeRow(rs.length + 1)]);

  const removeRow = (rowId) =>
    setRows((rs) =>
      rs.filter((r) => r.id !== rowId).map((r, i) => ({ ...r, no: i + 1 }))
    );

  const pickPhoto = (rowId, side, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateSide(rowId, side, { src: reader.result });
    reader.readAsDataURL(file);
  };

  const addCircle = (rowId, side, xPct, yPct) => {
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== rowId) return r;
        const c = { id: newId(), x: xPct, y: yPct, size: 18 };
        return { ...r, [side]: { ...r[side], circles: [...r[side].circles, c] } };
      })
    );
  };

  const moveCircle = (rowId, side, circleId, xPct, yPct) =>
    setRows((rs) =>
      rs.map((r) =>
        r.id === rowId
          ? {
              ...r,
              [side]: {
                ...r[side],
                circles: r[side].circles.map((c) =>
                  c.id === circleId ? { ...c, x: xPct, y: yPct } : c
                ),
              },
            }
          : r
      )
    );

  const resizeCircle = (rowId, side, circleId, size) =>
    setRows((rs) =>
      rs.map((r) =>
        r.id === rowId
          ? {
              ...r,
              [side]: {
                ...r[side],
                circles: r[side].circles.map((c) =>
                  c.id === circleId ? { ...c, size } : c
                ),
              },
            }
          : r
      )
    );

  const deleteCircle = (rowId, side, circleId) => {
    setRows((rs) =>
      rs.map((r) =>
        r.id === rowId
          ? {
              ...r,
              [side]: {
                ...r[side],
                circles: r[side].circles.filter((c) => c.id !== circleId),
              },
            }
          : r
      )
    );
    setSelected(null);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: view === "report" ? "#5a626c" : "#161b21",
        color: "#e9edf2",
        fontFamily:
          '"Hiragino Sans","Hiragino Kaku Gothic ProN",-apple-system,sans-serif',
        WebkitFontSmoothing: "antialiased",
        paddingBottom: 80,
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
        .seg { transition: background .15s, color .15s; }
        .photo-slot { transition: box-shadow .15s; touch-action: none; }
        .fab { transition: transform .12s; }
        .fab:active { transform: scale(.92); }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .report-page { box-shadow: none !important; margin: 0 !important; page-break-after: always; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* ===== 上部バー ===== */}
      <header
        className="no-print"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: view === "report" ? "rgba(40,46,54,.95)" : "rgba(22,27,33,.92)",
          backdropFilter: "blur(8px)",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: "1px solid rgba(255,255,255,.07)",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 17, marginRight: "auto" }}>
          写真台帳
          <span style={{ fontSize: 12, color: "#7d8a99", fontWeight: 600, marginLeft: 8 }}>
            田中様邸 屋根葺き替え
          </span>
        </div>

        {/* 編集 / 報告書 切替 */}
        <div
          style={{
            display: "flex",
            background: "rgba(255,255,255,.08)",
            borderRadius: 11,
            padding: 3,
          }}
        >
          {[
            ["edit", "編集"],
            ["report", "報告書"],
          ].map(([k, label]) => (
            <button
              key={k}
              className="seg"
              onClick={() => {
                setView(k);
                setCircleTarget(null);
                setSelected(null);
              }}
              style={{
                border: "none",
                borderRadius: 9,
                padding: "7px 16px",
                fontSize: 13.5,
                fontWeight: 700,
                background: view === k ? "#fff" : "transparent",
                color: view === k ? "#161b21" : "#aeb8c2",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "report" && (
          <button
            onClick={() => window.print()}
            style={{
              border: "none",
              borderRadius: 11,
              padding: "8px 16px",
              fontSize: 13.5,
              fontWeight: 700,
              background: "linear-gradient(135deg,#fff,#e6ebf0)",
              color: "#161b21",
            }}
          >
            🖨 印刷 / PDF
          </button>
        )}
      </header>

      {view === "edit" ? (
        <EditView
          rows={rows}
          update={update}
          removeRow={removeRow}
          pickPhoto={pickPhoto}
          circleTarget={circleTarget}
          setCircleTarget={setCircleTarget}
          selected={selected}
          setSelected={setSelected}
          addCircle={addCircle}
          moveCircle={moveCircle}
          resizeCircle={resizeCircle}
          deleteCircle={deleteCircle}
        />
      ) : (
        <ReportView rows={rows} />
      )}

      {/* 行を追加（編集時のみ） */}
      {view === "edit" && (
        <button
          className="fab no-print"
          onClick={addRow}
          style={{
            position: "fixed",
            right: 20,
            bottom: 24,
            zIndex: 30,
            border: "none",
            borderRadius: 16,
            padding: "15px 22px",
            fontSize: 15,
            fontWeight: 800,
            color: "#161b21",
            background: "linear-gradient(135deg,#5cc28e,#46a673)",
            boxShadow: "0 8px 24px rgba(70,166,115,.45)",
          }}
        >
          ＋ 撮影箇所を追加
        </button>
      )}
    </div>
  );
}

/* ============ 編集ビュー ============ */
function EditView(props) {
  const {
    rows, update, removeRow, pickPhoto,
    circleTarget, setCircleTarget, selected, setSelected,
    addCircle, moveCircle, resizeCircle, deleteCircle,
  } = props;

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "16px 14px 0" }}>
      <p
        className="no-print"
        style={{ fontSize: 12.5, color: "#7d8a99", lineHeight: 1.7, margin: "4px 6px 16px" }}
      >
        写真をタップして端末から選択。<span style={{ color: "#ff8a8a" }}>⭕赤丸</span>を押すと指でなぞって丸を描けます。丸はドラッグで移動、タップで選択して削除・大きさ変更ができます。
      </p>

      {rows.map((r) => (
        <div
          key={r.id}
          style={{
            background: "#1f262f",
            borderRadius: 18,
            padding: 14,
            marginBottom: 16,
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,.05)",
          }}
        >
          {/* 行ヘッダー */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span
              style={{
                width: 26, height: 26, borderRadius: 8, background: "#c2703d",
                display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800,
                flex: "0 0 auto",
              }}
            >
              {r.no}
            </span>
            <input
              value={r.title}
              onChange={(e) => update(r.id, { title: e.target.value })}
              placeholder="撮影箇所（例：北面 谷樋まわり）"
              style={{
                flex: 1, background: "transparent", border: "none", color: "#e9edf2",
                fontSize: 15, fontWeight: 700, outline: "none",
              }}
            />
            <button
              className="no-print"
              onClick={() => removeRow(r.id)}
              style={{
                border: "none", background: "rgba(255,255,255,.06)", color: "#8a96a3",
                width: 28, height: 28, borderRadius: 8, fontSize: 16, flex: "0 0 auto",
              }}
              aria-label="この箇所を削除"
            >
              ×
            </button>
          </div>

          {/* 施工前 / 施工後 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              ["before", "施工前", "#8a96a3"],
              ["after", "施工後", "#5cc28e"],
            ].map(([side, label, color]) => (
              <PhotoSlot
                key={side}
                rowId={r.id}
                side={side}
                label={label}
                color={color}
                data={r[side]}
                pickPhoto={pickPhoto}
                circleOn={circleTarget?.rowId === r.id && circleTarget?.side === side}
                toggleCircle={() =>
                  setCircleTarget((c) =>
                    c?.rowId === r.id && c?.side === side ? null : { rowId: r.id, side }
                  )
                }
                selected={selected}
                setSelected={setSelected}
                addCircle={addCircle}
                moveCircle={moveCircle}
                deleteCircle={deleteCircle}
              />
            ))}
          </div>

          {/* 選択中の丸：サイズ調整＆削除 */}
          {selected && selected.rowId === r.id && (() => {
            const s = r[selected.side];
            const c = s.circles.find((x) => x.id === selected.circleId);
            if (!c) return null;
            return (
              <div
                className="no-print"
                style={{
                  marginTop: 10, padding: "10px 12px", background: "rgba(255,122,122,.1)",
                  borderRadius: 12, display: "flex", alignItems: "center", gap: 12,
                }}
              >
                <span style={{ fontSize: 12.5, color: "#ffb0b0", fontWeight: 700 }}>
                  丸の大きさ
                </span>
                <input
                  type="range" min={8} max={45} value={c.size}
                  onChange={(e) =>
                    resizeCircle(r.id, selected.side, c.id, Number(e.target.value))
                  }
                  style={{ flex: 1, accentColor: "#ff5a5a" }}
                />
                <button
                  onClick={() => deleteCircle(r.id, selected.side, c.id)}
                  style={{
                    border: "none", background: "#ff5a5a", color: "#fff",
                    borderRadius: 9, padding: "6px 14px", fontSize: 13, fontWeight: 700,
                  }}
                >
                  削除
                </button>
              </div>
            );
          })()}

          {/* 説明文 */}
          <textarea
            value={r.note}
            onChange={(e) => update(r.id, { note: e.target.value })}
            placeholder="所見・処置内容（例：谷樋の劣化を確認、ガルバ製に交換）"
            rows={2}
            style={{
              width: "100%", marginTop: 10, background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.08)", borderRadius: 10,
              color: "#cdd5de", fontSize: 13.5, padding: "9px 11px", resize: "none",
              outline: "none", lineHeight: 1.6,
            }}
          />
        </div>
      ))}
    </main>
  );
}

/* ============ 写真スロット（赤丸描画つき） ============ */
function PhotoSlot(props) {
  const {
    rowId, side, label, color, data, pickPhoto,
    circleOn, toggleCircle, selected, setSelected,
    addCircle, moveCircle, deleteCircle,
  } = props;
  const ref = useRef(null);
  const fileRef = useRef(null);
  const dragRef = useRef(null);

  const pctFromEvent = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  };

  // 写真エリアのタップ：赤丸モードなら丸を追加（diamで誤差し替え防止）
  const onAreaClick = (e) => {
    if (!data.src) return; // 写真なし→何もしない（選択ボタンから）
    if (!circleOn) return; // 通常時は何もしない（誤動作防止）
    if (selected) { setSelected(null); return; }
    const { x, y } = pctFromEvent(e);
    addCircle(rowId, side, x, y);
  };

  const startDragCircle = (e, c) => {
    e.stopPropagation();
    setSelected({ rowId, side, circleId: c.id });
    dragRef.current = { circleId: c.id };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    moveCircle(rowId, side, dragRef.current.circleId, x, y);
  }, [rowId, side, moveCircle]);
  const endDrag = () => (dragRef.current = null);

  return (
    <div>
      {/* ラベルバー */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 5,
        }}
      >
        <span style={{ fontSize: 11.5, fontWeight: 800, color }}>{label}</span>
        {data.src && (
          <button
            className="no-print"
            onClick={toggleCircle}
            style={{
              border: "none", borderRadius: 8, padding: "3px 10px", fontSize: 11.5,
              fontWeight: 800,
              background: circleOn ? "#ff5a5a" : "rgba(255,255,255,.1)",
              color: circleOn ? "#fff" : "#cdd5de",
            }}
          >
            ⭕赤丸
          </button>
        )}
      </div>

      {/* 写真本体 */}
      <div
        ref={ref}
        className="photo-slot"
        onClick={onAreaClick}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "4 / 3",
          borderRadius: 12,
          overflow: "hidden",
          background: data.src ? "#000" : "rgba(255,255,255,.04)",
          border: circleOn ? "2px solid #ff5a5a" : "1px solid rgba(255,255,255,.08)",
          cursor: circleOn ? "crosshair" : "default",
        }}
      >
        {data.src ? (
          <img
            src={data.src}
            alt={label}
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <button
            className="no-print"
            onClick={() => fileRef.current?.click()}
            style={{
              position: "absolute", inset: 0, border: "none", background: "transparent",
              color: "#6b7682", fontSize: 13, display: "grid", placeItems: "center", gap: 6,
            }}
          >
            <span style={{ fontSize: 30 }}>📷</span>
            写真を選ぶ
          </button>
        )}

        {/* 赤丸たち */}
        {data.circles.map((c) => {
          const isSel = selected?.rowId === rowId && selected?.side === side && selected?.circleId === c.id;
          return (
            <div
              key={c.id}
              onPointerDown={(e) => startDragCircle(e, c)}
              style={{
                position: "absolute",
                left: `${c.x}%`,
                top: `${c.y}%`,
                width: `${c.size}%`,
                aspectRatio: "1 / 1",
                transform: "translate(-50%,-50%)",
                borderRadius: "50%",
                border: "3px solid #ff3b30",
                boxShadow: isSel ? "0 0 0 2px rgba(255,59,48,.4)" : "none",
                cursor: "grab",
                touchAction: "none",
              }}
            />
          );
        })}

        {/* 差し替えボタン（写真あり時・右下） */}
        {data.src && (
          <button
            className="no-print"
            onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
            style={{
              position: "absolute", right: 6, bottom: 6, border: "none",
              borderRadius: 8, padding: "5px 9px", fontSize: 11, fontWeight: 700,
              background: "rgba(0,0,0,.6)", color: "#fff", backdropFilter: "blur(4px)",
            }}
          >
            📁 変更
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => { pickPhoto(rowId, side, e.target.files?.[0]); e.target.value = ""; }}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}

/* ============ 報告書ビュー（A4プレビュー） ============ */
function ReportView({ rows }) {
  // 3箇所/ページ
  const pages = [];
  for (let i = 0; i < rows.length; i += 3) pages.push(rows.slice(i, i + 3));
  if (pages.length === 0) pages.push([]);

  return (
    <main style={{ padding: "22px 14px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
      {pages.map((pageRows, pi) => (
        <div
          key={pi}
          className="report-page"
          style={{
            width: "100%",
            maxWidth: 720,
            aspectRatio: "297 / 210", // A4 横
            background: "#fff",
            color: "#1a1a1a",
            borderRadius: 6,
            boxShadow: "0 10px 30px rgba(0,0,0,.35)",
            padding: "22px 26px",
            display: "flex",
            flexDirection: "column",
            fontFamily: '"Hiragino Mincho ProN","Hiragino Sans",serif',
          }}
        >
          {/* 報告書ヘッダー（1ページ目のみ大きく） */}
          <div style={{ borderBottom: "2px solid #1a1a1a", paddingBottom: 8, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 9, letterSpacing: ".2em", color: "#888" }}>工事写真台帳</div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>田中様邸 屋根葺き替え工事</div>
              </div>
              <div style={{ fontSize: 9, color: "#666", textAlign: "right", lineHeight: 1.6 }}>
                株式会社サンプル建設<br />富山県富山市八尾町1-2-3
              </div>
            </div>
          </div>

          {/* 3箇所 */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            {pageRows.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
                {/* 番号＋タイトル */}
                <div style={{ width: 90, flex: "0 0 auto", paddingTop: 2 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#c2703d" }}>
                    No.{r.no}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, lineHeight: 1.3 }}>
                    {r.title || "（撮影箇所）"}
                  </div>
                  <div style={{ fontSize: 9, color: "#555", marginTop: 5, lineHeight: 1.5 }}>
                    {r.note}
                  </div>
                </div>
                {/* 写真2枚 */}
                {["before", "after"].map((side) => (
                  <div key={side} style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 8, fontWeight: 800, marginBottom: 2,
                        color: side === "before" ? "#666" : "#2e9e6b",
                      }}
                    >
                      {side === "before" ? "施工前" : "施工後"}
                    </div>
                    <div
                      style={{
                        flex: 1, position: "relative", background: "#eee",
                        borderRadius: 3, overflow: "hidden", minHeight: 0,
                        border: "1px solid #ddd",
                      }}
                    >
                      {r[side].src ? (
                        <img src={r[side].src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#bbb", fontSize: 18 }}>📷</div>
                      )}
                      {/* 赤丸を報告書にも反映 */}
                      {r[side].circles.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            position: "absolute", left: `${c.x}%`, top: `${c.y}%`,
                            width: `${c.size}%`, aspectRatio: "1/1",
                            transform: "translate(-50%,-50%)", borderRadius: "50%",
                            border: "2px solid #ff3b30",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ textAlign: "right", fontSize: 8, color: "#999", marginTop: 6 }}>
            - {pi + 1} / {pages.length} -
          </div>
        </div>
      ))}
      <p className="no-print" style={{ fontSize: 12, color: "#cdd5de", textAlign: "center", paddingBottom: 30 }}>
        ※ デモです。「印刷 / PDF」で実際にA4横で出力でき、赤丸も反映されます
      </p>
    </main>
  );
}
