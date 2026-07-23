import { useState } from "react";

/* ============================================================
   スケジュール管理 モック（kawara-photo-app 追加機能案）
   - 月間カレンダー＋予定リスト
   - 予定の種類（上棟日・修理・打ち合わせ等）は自由に追加でき、色分け
   - 予定は物件（プロジェクト）に紐付け可能 → 台帳・工程表へ飛べる想定
   - 職人路線の配色（炭・鉄・赤錆・藍鼠・苔緑）で統一
   ※ 見た目のモック。データは仮。保存はしない。
   ============================================================ */

const C = {
  ink: "#1c1f22", steel: "#2f363d", ainezu: "#4a5560",
  kawara: "#6b7178", rust: "#c0492f", moss: "#5a7d52",
  paper: "#f7f5f1", line: "#d8d4cc", sand: "#b8860b",
};

// 予定の種類（ユーザーが自由に追加・編集できる想定）
const TYPES = [
  { id: "jotou", label: "新築上棟", color: "#c0492f" },   // 赤錆
  { id: "shinchiku", label: "新築工事", color: "#4a5560" }, // 藍鼠
  { id: "shuri", label: "修理", color: "#5a7d52" },        // 苔緑
  { id: "uchiawase", label: "打ち合わせ", color: "#b8860b" }, // 山吹
  { id: "sonota", label: "その他", color: "#6b7178" },      // 瓦
];

// 仮の予定データ（2026年7月）
const EVENTS = [
  { d: 3,  type: "uchiawase", title: "田中様 見積打合せ", project: null, time: "10:00" },
  { d: 6,  type: "shinchiku", title: "常川様邸 瓦揚げ", project: "常川様邸", time: "8:00" },
  { d: 7,  type: "shinchiku", title: "常川様邸 平部緊結", project: "常川様邸", time: "8:00" },
  { d: 9,  type: "shuri",     title: "佐藤様 雨漏り修理", project: null, time: "9:00" },
  { d: 13, type: "jotou",     title: "山田様邸 上棟", project: "山田様邸", time: "8:00" },
  { d: 15, type: "shuri",     title: "鈴木様 雪止め追加", project: null, time: "13:00" },
  { d: 17, type: "uchiawase", title: "山田様邸 色決め", project: "山田様邸", time: "15:00" },
  { d: 22, type: "jotou",     title: "ナチュラル工房 新物件 上棟", project: null, time: "8:00" },
  { d: 24, type: "shinchiku", title: "山田様邸 ルーフィング", project: "山田様邸", time: "8:00" },
  { d: 28, type: "shuri",     title: "高橋様 棟補修", project: null, time: "9:30" },
];

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];
// 2026年7月: 1日=水曜, 31日まで
const FIRST_DOW = 3, NUM_DAYS = 31;

export default function ScheduleMock() {
  const [selected, setSelected] = useState(13);
  const [filter, setFilter] = useState(null); // 種類フィルタ

  const typeOf = (id) => TYPES.find((t) => t.id === id);
  const eventsOf = (d) => EVENTS.filter((e) => e.d === d && (!filter || e.type === filter));
  const selectedEvents = eventsOf(selected);

  // カレンダーのマス
  const cells = [];
  for (let i = 0; i < FIRST_DOW; i++) cells.push(null);
  for (let d = 1; d <= NUM_DAYS; d++) cells.push(d);

  return (
    <div style={{ background: C.steel, minHeight: "100vh", padding: "0 0 40px",
      fontFamily: '"Hiragino Sans","Hiragino Kaku Gothic ProN",-apple-system,sans-serif' }}>
      <style>{`*{box-sizing:border-box}button{font-family:inherit;cursor:pointer;border:none}`}</style>

      {/* ヘッダー（アプリ共通の職人トーン） */}
      <div style={{ background: C.ink, padding: "14px 16px", display: "flex",
        alignItems: "center", gap: 12 }}>
        <div style={{ width: 5, height: 30, background: C.rust }} />
        <div>
          <div style={{ fontSize: 9, letterSpacing: ".2em", color: "#9aa3ac", fontWeight: 800 }}>スケジュール</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: C.paper }}>2026年 7月</div>
        </div>
        <button style={{ marginLeft: "auto", background: C.rust, color: "#fff",
          borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 800 }}>
          ＋ 予定追加
        </button>
      </div>

      {/* 種類フィルタ（自由に追加できる予定の種類。タップで絞り込み） */}
      <div style={{ display: "flex", gap: 6, padding: "10px 12px", overflowX: "auto",
        background: "rgba(28,31,34,.6)" }}>
        {TYPES.map((t) => (
          <button key={t.id} onClick={() => setFilter(filter === t.id ? null : t.id)}
            style={{ display: "flex", alignItems: "center", gap: 5, borderRadius: 20,
              padding: "5px 12px", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap",
              background: filter === t.id ? t.color : "rgba(255,255,255,.08)",
              color: filter === t.id ? "#fff" : "#c9ced4" }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: t.color }} />
            {t.label}
          </button>
        ))}
        <button style={{ borderRadius: 20, padding: "5px 12px", fontSize: 11.5, fontWeight: 800,
          background: "rgba(255,255,255,.08)", color: "#9aa3ac", whiteSpace: "nowrap" }}>
          ＋ 種類を追加
        </button>
      </div>

      {/* 月間カレンダー */}
      <div style={{ margin: "10px 12px", background: C.paper, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)",
          borderBottom: "2px solid " + C.ink }}>
          {DAYS.map((d, i) => (
            <div key={d} style={{ textAlign: "center", padding: "7px 0", fontSize: 11,
              fontWeight: 800, color: i === 0 ? C.rust : i === 6 ? C.ainezu : C.kawara }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
          {cells.map((d, i) => {
            const evs = d ? eventsOf(d) : [];
            const isSel = d === selected;
            return (
              <button key={i} onClick={() => d && setSelected(d)}
                style={{ minHeight: 58, padding: "4px 3px", textAlign: "left",
                  background: isSel ? "#eee9df" : "transparent",
                  borderRight: (i % 7 < 6) ? "1px solid " + C.line : "none",
                  borderBottom: "1px solid " + C.line,
                  outline: isSel ? "2px solid " + C.rust : "none", outlineOffset: -2 }}>
                {d && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800,
                      color: i % 7 === 0 ? C.rust : i % 7 === 6 ? C.ainezu : C.ink }}>{d}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                      {evs.slice(0, 2).map((e, j) => (
                        <div key={j} style={{ fontSize: 8, fontWeight: 700, color: "#fff",
                          background: typeOf(e.type).color, borderRadius: 3,
                          padding: "1px 3px", overflow: "hidden", whiteSpace: "nowrap",
                          textOverflow: "ellipsis" }}>
                          {e.title}
                        </div>
                      ))}
                      {evs.length > 2 && (
                        <div style={{ fontSize: 8, color: C.kawara, fontWeight: 700 }}>+{evs.length - 2}件</div>
                      )}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 選択日の予定リスト */}
      <div style={{ margin: "0 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "6px 2px" }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: C.paper }}>7/{selected}</span>
          <span style={{ fontSize: 12, color: "#9aa3ac", fontWeight: 700 }}>
            ({DAYS[(FIRST_DOW + selected - 1) % 7]}) の予定
          </span>
        </div>
        {selectedEvents.length === 0 && (
          <div style={{ background: "rgba(255,255,255,.05)", borderRadius: 10, padding: 18,
            textAlign: "center", color: "#9aa3ac", fontSize: 13 }}>
            予定なし
          </div>
        )}
        {selectedEvents.map((e, i) => {
          const t = typeOf(e.type);
          return (
            <div key={i} style={{ background: C.paper, borderRadius: 10, padding: "12px 14px",
              marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 5, alignSelf: "stretch", background: t.color, borderRadius: 3 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#fff",
                    background: t.color, borderRadius: 4, padding: "2px 8px" }}>{t.label}</span>
                  <span style={{ fontSize: 12, color: C.kawara, fontWeight: 700 }}>{e.time}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, color: C.ink, marginTop: 4 }}>{e.title}</div>
                {e.project && (
                  <button style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: C.ainezu,
                    background: "#e7e3da", borderRadius: 6, padding: "4px 10px" }}>
                    📁 {e.project} の台帳・工程表を開く →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ textAlign: "center", color: "#aeb6bd", fontSize: 11.5, margin: "16px 14px 0", lineHeight: 1.7 }}>
        モック：種類（上棟・修理・打合せ…）は自由に追加でき色分け。日をタップで予定表示。<br />
        物件に紐付いた予定は、その物件の台帳・工程表へ飛べる想定。
      </p>
    </div>
  );
}
