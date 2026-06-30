import { useState } from "react";

/* ============================================================
   施工写真報告書 — 一から作り直し試作
   方向性：「崩した中の真面目さ」/ 職人・力強さ
   ・型通りの報告書を脱ぎ、物づくりの現場の質感で組む
   ・太い番号、左揃えの抜け、構造材のような縦バー
   ・写真を主役に大きく、施工前後を黒帯で力強くラベリング
   ・配色は屋根の素材感（炭・鉄・藍鼠・瓦・赤錆）
   ※ デモ。実データ未接続。写真はプレースホルダ＋見本赤丸
   ============================================================ */

// 屋根の素材感パレット
const C = {
  ink: "#1c1f22",      // 炭（見出し・本文）
  steel: "#2f363d",    // 鉄（帯）
  ainezu: "#4a5560",   // 藍鼠（施工前ラベル）
  kawara: "#6b7178",   // 瓦のいぶし銀
  rust: "#c0492f",     // 赤錆（アクセント・番号）
  moss: "#5a7d52",     // 苔緑（施工後ラベル）
  paper: "#f7f5f1",    // 紙
  line: "#d8d4cc",     // 罫
};

const ITEMS = [
  {
    no: 1,
    place: "北面 谷樋まわり",
    before: "谷樋に経年劣化と土砂の堆積。雨水の流れが阻害され、雨漏りの起点となっていた。",
    after: "ガルバリウム鋼板製の谷樋に全面交換。清掃のうえ勾配を再調整し、排水を確保。",
    circle: { x: 60, y: 40, size: 24 },
  },
  {
    no: 2,
    place: "棟瓦 取り直し",
    before: "棟瓦のずれと漆喰の剥離を確認。地震・経年により固定力が低下していた。",
    after: "棟を一旦解体し、南蛮漆喰で再固定。瓦のラインを通し直して仕上げ。",
    circle: { x: 44, y: 56, size: 20 },
  },
];

export default function CraftReport() {
  const [n, setN] = useState(2); // 表示する箇所数（プレビュー用）
  const items = ITEMS.slice(0, n);

  return (
    <div
      style={{
        background: C.steel,
        minHeight: "100vh",
        padding: "0 0 50px",
        fontFamily:
          '"Hiragino Sans","Hiragino Kaku Gothic ProN",-apple-system,sans-serif',
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        @media print { .no-print { display:none !important; } body{background:#fff!important;}
          .sheet { box-shadow:none!important; margin:0!important; }
          * { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; } }
      `}</style>

      {/* デモ操作（印刷対象外） */}
      <div
        className="no-print"
        style={{
          position: "sticky", top: 0, zIndex: 5,
          background: "rgba(28,31,34,.95)", backdropFilter: "blur(6px)",
          padding: "12px 16px", display: "flex", gap: 10, alignItems: "center",
          justifyContent: "center", borderBottom: `1px solid ${C.ainezu}`,
        }}
      >
        <span style={{ color: "#9aa3ac", fontSize: 12, fontWeight: 700 }}>箇所数プレビュー</span>
        {[1, 2].map((v) => (
          <button key={v} onClick={() => setN(v)}
            style={{
              border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 800,
              background: n === v ? C.rust : "rgba(255,255,255,.1)", color: "#fff",
            }}>{v}箇所</button>
        ))}
      </div>

      {/* A4 横 シート */}
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 24 }}>
        <div
          className="sheet"
          style={{
            width: "100%", maxWidth: 740, aspectRatio: "297 / 210",
            background: C.paper, color: C.ink, borderRadius: 3,
            boxShadow: "0 16px 44px rgba(0,0,0,.45)",
            padding: 0, display: "flex", flexDirection: "column", overflow: "hidden",
          }}
        >
          {/* ── 報告書ヘッダー：左に太い見出し、抜けのある構成 ── */}
          <div style={{ display: "flex", alignItems: "stretch", borderBottom: `2px solid ${C.ink}` }}>
            {/* 左：赤錆の縦バー＋タイトル */}
            <div style={{ flex: 1, padding: "16px 22px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 6, alignSelf: "stretch", background: C.rust }} />
              <div>
                <div style={{ fontSize: 10, letterSpacing: ".25em", color: C.kawara, fontWeight: 800 }}>
                  施工写真報告書
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".02em", lineHeight: 1.15, marginTop: 3 }}>
                  安村様邸　屋根葺き替え工事
                </div>
              </div>
            </div>
            {/* 右：施工者（黒ブロックで締める） */}
            <div style={{ background: C.ink, color: C.paper, padding: "16px 20px", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "right", minWidth: 180 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>有限会社 山西瓦店</div>
              <div style={{ fontSize: 9, color: "#b9bec4", marginTop: 3, lineHeight: 1.6 }}>
                富山県富山市八尾町1-2-3<br />TEL 076-000-0000
              </div>
            </div>
          </div>

          {/* ── 箇所リスト ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {items.map((it, idx) => (
              <div
                key={it.no}
                style={{
                  flex: 1, display: "flex", minHeight: 0,
                  borderBottom: idx < items.length - 1 ? `1px solid ${C.line}` : "none",
                }}
              >
                {/* 左帯：大きな番号（赤錆）＋箇所名（縦置き感のある抜け） */}
                <div style={{ width: 132, flex: "0 0 auto", padding: "14px 14px 14px 22px", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.rust }}>No.</span>
                    <span style={{ fontSize: 38, fontWeight: 900, color: C.rust, lineHeight: 0.9, letterSpacing: "-.02em" }}>
                      {String(it.no).padStart(2, "0")}
                    </span>
                  </div>
                  <div style={{ width: 28, height: 3, background: C.ink, margin: "8px 0 8px" }} />
                  <div style={{ fontSize: 13, fontWeight: 900, lineHeight: 1.35 }}>{it.place}</div>
                </div>

                {/* 写真2枚＋所見 */}
                <div style={{ flex: 1, padding: "14px 22px 14px 0", display: "flex", gap: 14, minHeight: 0 }}>
                  {[
                    ["before", "施 工 前", C.ainezu, it.before],
                    ["after", "施 工 後", C.moss, it.after],
                  ].map(([side, label, barColor, text]) => (
                    <div key={side} style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                      {/* 黒帯ラベル：力強く、字間広め */}
                      <div style={{
                        background: barColor, color: C.paper, fontSize: 10, fontWeight: 900,
                        letterSpacing: ".4em", padding: "4px 0", textAlign: "center",
                        textIndent: ".4em",
                      }}>
                        {label}
                      </div>
                      {/* 写真（プレースホルダ＋見本赤丸） */}
                      <div style={{ flex: 1, position: "relative", background: "#e6e3dd", minHeight: 0, display: "grid", placeItems: "center", border: `1px solid ${C.line}`, borderTop: "none" }}>
                        <span style={{ fontSize: 24, color: "rgba(0,0,0,.16)" }}>▦</span>
                        {/* 見本赤丸：白縁つきで濃い背景でも映える */}
                        {side === "before" && (
                          <div style={{
                            position: "absolute", left: `${it.circle.x}%`, top: `${it.circle.y}%`,
                            width: `${it.circle.size}%`, aspectRatio: "1/1", transform: "translate(-50%,-50%)",
                            borderRadius: "50%", border: `3.5px solid ${C.rust}`,
                            boxShadow: "0 0 0 1.5px #fff, inset 0 0 0 1.5px #fff",
                          }} />
                        )}
                      </div>
                      {/* 所見：囲まず、左に色バーだけ（崩し）。本文はきっちり（真面目） */}
                      <div style={{
                        fontSize: 9.5, color: "#33383d", lineHeight: 1.55, padding: "5px 0 0 9px",
                        borderLeft: `3px solid ${barColor}`, marginTop: 6,
                      }}>
                        {text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ── フッター：細く、左に工期・右にページ ── */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "7px 22px", background: C.ink, color: "#b9bec4", fontSize: 8.5, letterSpacing: ".08em",
          }}>
            <span>工期　令和8年6月10日 〜 6月28日　／　ナチュラル工房</span>
            <span>1 / 1</span>
          </div>
        </div>
      </div>

      <p className="no-print" style={{ textAlign: "center", color: "#aeb6bd", fontSize: 12, marginTop: 18, lineHeight: 1.7 }}>
        職人・力強さ路線の試作。写真は実際にはここに大きく入ります。<br />
        赤丸は白縁つきで、黒い瓦の上でもはっきり映えます。
      </p>
    </div>
  );
}
