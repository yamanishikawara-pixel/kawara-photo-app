import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Project, UserSettings } from '../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';

/* ============================================================
   工程表（ガントチャート）
   - 工事件名・現場住所・自社情報・会社ロゴの表示（Firestoreと連動）
   - セルをタップ → タスクバー作成
   - バー本体をドラッグ → 移動 / 両端ハンドル → 期間伸縮
   - 行の追加・削除、タスク名/担当者のインライン編集
   - タスクごとの色選択(iOSカラーパレット)
   - 印刷ボタン → A4横に最適化された@media printを適用
   ============================================================ */

// ---------- 日付ユーティリティ ----------
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (date: Date, n: number) => {
  const x = new Date(date);
  x.setDate(x.getDate() + n);
  return x;
};
const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// ---------- 日本の祝日（2025〜2027年・振替休日含む） ----------
const HOLIDAYS: Record<string, string> = {
  // 2025
  "2025-01-01": "元日", "2025-01-13": "成人の日", "2025-02-11": "建国記念の日",
  "2025-02-23": "天皇誕生日", "2025-02-24": "振替休日", "2025-03-20": "春分の日",
  "2025-04-29": "昭和の日", "2025-05-03": "憲法記念日", "2025-05-04": "みどりの日",
  "2025-05-05": "こどもの日", "2025-05-06": "振替休日", "2025-07-21": "海の日",
  "2025-08-11": "山の日", "2025-09-15": "敬老の日", "2025-09-23": "秋分の日",
  "2025-10-13": "スポーツの日", "2025-11-03": "文化の日", "2025-11-23": "勤労感謝の日",
  "2025-11-24": "振替休日",
  // 2026
  "2026-01-01": "元日", "2026-01-12": "成人の日", "2026-02-11": "建国記念の日",
  "2026-02-23": "天皇誕生日", "2026-03-20": "春分の日", "2026-04-29": "昭和の日",
  "2026-05-03": "憲法記念日", "2026-05-04": "みどりの日", "2026-05-05": "こどもの日",
  "2026-05-06": "振替休日", "2026-07-20": "海の日", "2026-08-11": "山の日",
  "2026-09-21": "敬老の日", "2026-09-22": "国民の休日", "2026-09-23": "秋分の日",
  "2026-10-12": "スポーツの日", "2026-11-03": "文化の日", "2026-11-23": "勤労感謝の日",
  // 2027
  "2027-01-01": "元日", "2027-01-11": "成人の日", "2027-02-11": "建国記念の日",
  "2027-02-23": "天皇誕生日", "2027-03-21": "春分の日", "2027-03-22": "振替休日",
  "2027-04-29": "昭和の日", "2027-05-03": "憲法記念日", "2027-05-04": "みどりの日",
  "2027-05-05": "こどもの日", "2027-07-19": "海の日", "2027-08-11": "山の日",
  "2027-09-20": "敬老の日", "2027-09-23": "秋分の日", "2027-10-11": "スポーツの日",
  "2027-11-03": "文化の日", "2027-11-23": "勤労感謝の日",
};
const holidayName = (date: Date) => HOLIDAYS[fmt(date)] || null;

// ---------- 休日（日曜・祝日）を除いた営業日計算 ----------
const isOff = (date: Date) => date.getDay() === 0 || !!holidayName(date);
const nextWorkday = (date: Date) => {
  let d = new Date(date);
  while (isOff(d)) d = addDays(d, 1);
  return d;
};
const prevWorkday = (date: Date) => {
  let d = new Date(date);
  while (isOff(d)) d = addDays(d, -1);
  return d;
};
// 開始日から実働n日分の日付リスト（休日はスキップ）
const workdaySpan = (startDate: Date, workDays: number) => {
  const out: Date[] = [];
  let d = new Date(startDate);
  while (out.length < workDays) {
    if (!isOff(d)) out.push(new Date(d));
    d = addDays(d, 1);
  }
  return out;
};
// from〜to（両端含む）の実働日数
const countWorkdays = (from: Date, to: Date) => {
  let c = 0;
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) if (!isOff(d)) c++;
  return c;
};

// ---------- iOS風カラーパレット ----------
const COLORS = [
  "#007AFF", // blue
  "#34C759", // green
  "#FF9500", // orange
  "#FF3B30", // red
  "#AF52DE", // purple
  "#5AC8FA", // teal
  "#FF2D55", // pink
  "#5856D6", // indigo
];

const DEBOUNCE_MS = 600;

export interface GanttTask {
  id: number;
  name: string;
  assignee: string;
  color: string;
  start: string | null; // YYYY-MM-DD
  duration: number; // 実働日数
}

type DragMode = "move" | "resize-l" | "resize-r";
interface DragState {
  taskId: number;
  mode: DragMode;
  startX: number;
  gridLeft: number;
  pxPerDay: number;
  origStartDate: Date;
  origEndDate: Date;
  origDur: number;
}

let uid = 100;
const newId = () => ++uid;

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [colorPickerFor, setColorPickerFor] = useState<number | null>(null);

  // ---------- Firestore連携 ----------
  const [, setProject] = useState<Project | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------- 工事件名・現場住所（project連動） ----------
  const [projectName, setProjectName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");

  const mountedRef = useRef(true);
  const tasksLoadedRef = useRef(false);
  const tasksDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fieldDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});

  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  // ---------- マウント管理 ----------
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (tasksDebounceRef.current) clearTimeout(tasksDebounceRef.current);
      Object.values(fieldDebounceRef.current).forEach((t) => { if (t) clearTimeout(t); });
    };
  }, []);

  // ---------- データロード ----------
  useEffect(() => {
    if (!id) return;
    let aborted = false;
    (async () => {
      try {
        const d = await getDoc(doc(db, "projects", id));
        if (aborted || !mountedRef.current) return;
        if (d.exists()) {
          const data = d.data() as Project;
          setProject(data);
          setProjectName(data.projectName ?? "");
          setSiteAddress(data.projectLocation ?? "");
          const loaded = (data.ganttTasks ?? []) as GanttTask[];
          setTasks(loaded);
          uid = loaded.reduce((m, t) => Math.max(m, t.id), uid);
        } else {
          setError("工程表データが見つかりません。");
        }
        const user = auth.currentUser;
        if (user) {
          const s = await getDoc(doc(db, "users", user.uid));
          if (aborted || !mountedRef.current) return;
          if (s.exists()) setUserSettings(s.data() as UserSettings);
        }
      } catch (err) {
        if (aborted || !mountedRef.current) return;
        logFirebaseError(err, "工程表データの読み込み");
        setError(firebaseErrorMessage(err, "工程表データの読み込み"));
      } finally {
        if (!aborted && mountedRef.current) {
          tasksLoadedRef.current = true;
          setLoading(false);
        }
      }
    })();
    return () => { aborted = true; };
  }, [id]);

  // ---------- tasks 保存（デバウンス） ----------
  useEffect(() => {
    if (!id || !tasksLoadedRef.current) return;
    if (tasksDebounceRef.current) clearTimeout(tasksDebounceRef.current);
    tasksDebounceRef.current = setTimeout(() => {
      updateDoc(doc(db, "projects", id), { ganttTasks: tasks }).catch((err) => {
        logFirebaseError(err, "工程表の保存");
      });
    }, DEBOUNCE_MS);
    return () => { if (tasksDebounceRef.current) clearTimeout(tasksDebounceRef.current); };
  }, [tasks, id]);

  // ---------- 工事件名・現場住所 保存（デバウンス） ----------
  const saveProjectField = useCallback((field: "projectName" | "projectLocation", value: string) => {
    if (!id) return;
    if (fieldDebounceRef.current[field]) clearTimeout(fieldDebounceRef.current[field]);
    fieldDebounceRef.current[field] = setTimeout(() => {
      updateDoc(doc(db, "projects", id), { [field]: value }).catch((err) => {
        logFirebaseError(err, "工程表データの保存");
      });
    }, DEBOUNCE_MS);
  }, [id]);

  const handleProjectNameChange = (value: string) => {
    setProjectName(value);
    saveProjectField("projectName", value);
  };
  const handleSiteAddressChange = (value: string) => {
    setSiteAddress(value);
    saveProjectField("projectLocation", value);
  };

  const monthStart = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayIdx =
    today.getFullYear() === viewYear && today.getMonth() === viewMonth
      ? today.getDate() - 1
      : -1;

  // ---------- 月送り ----------
  const moveMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  // ---------- タスク操作 ----------
  const updateTask = (taskId: number, patch: Partial<GanttTask>) =>
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));

  const addRow = () =>
    setTasks((ts) => [
      ...ts,
      {
        id: newId(),
        name: "新しい工程",
        assignee: "",
        color: COLORS[ts.length % COLORS.length],
        start: null,
        duration: 0,
      },
    ]);

  const removeRow = (taskId: number) => setTasks((ts) => ts.filter((t) => t.id !== taskId));

  // セルをタップ → バー作成（バー未設定の行のみ・休日は不可）
  const handleCellClick = (task: GanttTask, dayIdx: number) => {
    if (task.start) return; // 既にバーがある行はドラッグで操作
    const date = addDays(monthStart, dayIdx);
    if (isOff(date)) return; // 日曜・祝日は休みのため開始不可
    updateTask(task.id, {
      start: fmt(date),
      duration: 1,
    });
  };

  // ---------- ドラッグ（移動・伸縮 / 営業日ベース） ----------
  const startDrag = (e: React.PointerEvent<HTMLDivElement>, task: GanttTask, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    if (!gridRef.current || !task.start) return;
    const rect = gridRef.current.getBoundingClientRect();
    const span = workdaySpan(parse(task.start), task.duration);
    dragRef.current = {
      taskId: task.id,
      mode,
      startX: e.clientX,
      gridLeft: rect.left,
      pxPerDay: rect.width / daysInMonth,
      origStartDate: span[0],
      origEndDate: span[span.length - 1],
      origDur: task.duration,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const idx = Math.min(
        Math.max(Math.floor((e.clientX - d.gridLeft) / d.pxPerDay), 0),
        daysInMonth - 1
      );
      const pointerDate = addDays(monthStart, idx);

      if (d.mode === "move") {
        const delta = Math.round((e.clientX - d.startX) / d.pxPerDay);
        let ns = addDays(d.origStartDate, delta);
        if (ns < monthStart) ns = new Date(monthStart);
        ns = nextWorkday(ns); // 休日には置けないので翌営業日へスナップ
        updateTask(d.taskId, { start: fmt(ns) });
      } else if (d.mode === "resize-r") {
        // ポインタ位置までの実働日数を期間にする
        const dur =
          pointerDate < d.origStartDate
            ? 1
            : Math.max(1, countWorkdays(d.origStartDate, pointerDate));
        updateTask(d.taskId, { duration: dur });
      } else if (d.mode === "resize-l") {
        // 終了日を固定したまま開始側を伸縮（休日は開始日にしない）
        let ns =
          pointerDate > d.origEndDate
            ? new Date(d.origEndDate)
            : nextWorkday(pointerDate);
        if (ns > d.origEndDate) ns = prevWorkday(d.origEndDate);
        const dur = Math.max(1, countWorkdays(ns, d.origEndDate));
        updateTask(d.taskId, { start: fmt(ns), duration: dur });
      }
    },
    [daysInMonth, monthStart] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const endDrag = () => (dragRef.current = null);

  // ---------- 読込中・エラー ----------
  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="min-h-screen p-6" style={{ background: "#0f0f1a" }}>
        <ErrorMessage message={error} />
      </div>
    );
  }

  // ---------- 描画 ----------
  return (
    <div
      className="min-h-screen bg-gray-50 text-gray-900"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Segoe UI", sans-serif',
      }}
    >
      {/* 印刷用CSS：A4横・不要要素の非表示 */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .chart-card, .doc-header { box-shadow: none !important; border: none !important; border-radius: 0 !important; }
          .doc-header { padding: 0 0 12px 0 !important; margin-bottom: 8px !important; border-bottom: 2px solid #111 !important; }
          .chart-scroll { overflow: visible !important; }
          .chart-grid { min-width: 0 !important; }
          input, textarea { border: none !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        input:focus, textarea:focus { outline: none; }
        .bar-handle { touch-action: none; }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6">
        {/* ===== 操作ツールバー（印刷時は非表示） ===== */}
        <header className="no-print flex flex-wrap items-center gap-3 mb-6">
          <button
            onClick={() => navigate(`/project/${id}`)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm border border-gray-100 text-gray-500 active:opacity-70"
            aria-label="戻る"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-2xl font-semibold tracking-tight mr-auto">
            工程表
          </h1>
          <div className="flex items-center bg-white rounded-full shadow-sm border border-gray-100">
            <button
              onClick={() => moveMonth(-1)}
              className="px-4 py-2 text-blue-500 text-lg active:opacity-50"
              aria-label="前の月"
            >
              ‹
            </button>
            <span className="px-2 font-medium tabular-nums whitespace-nowrap">
              {viewYear}年{viewMonth + 1}月
            </span>
            <button
              onClick={() => moveMonth(1)}
              className="px-4 py-2 text-blue-500 text-lg active:opacity-50"
              aria-label="次の月"
            >
              ›
            </button>
          </div>
          <button
            onClick={addRow}
            className="px-4 py-2 rounded-full bg-blue-500 text-white text-sm font-medium shadow-sm active:opacity-70"
          >
            ＋ 工程を追加
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-full bg-white text-blue-500 text-sm font-medium shadow-sm border border-gray-100 active:opacity-70"
          >
            印刷 / PDF出力
          </button>
        </header>

        {/* ===== 書類ヘッダー：工事件名・会社情報・ロゴ（印刷にも表示） ===== */}
        <div className="doc-header bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 mb-4 flex flex-wrap items-start gap-4">
          {/* 工事件名 */}
          <div className="flex-1 min-w-[220px]">
            <div className="text-[10px] tracking-widest text-gray-400 font-medium mb-0.5">
              工事件名
            </div>
            <input
              value={projectName}
              onChange={(e) => handleProjectNameChange(e.target.value)}
              className="w-full text-xl sm:text-2xl font-semibold tracking-tight bg-transparent"
              placeholder="工事件名を入力"
            />
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 mt-1.5">
              <div className="flex items-baseline gap-1.5 flex-1 min-w-[200px]">
                <span className="text-[10px] tracking-widest text-gray-400 font-medium shrink-0">
                  現場住所
                </span>
                <input
                  value={siteAddress}
                  onChange={(e) => handleSiteAddressChange(e.target.value)}
                  className="flex-1 min-w-0 text-sm text-gray-600 bg-transparent"
                  placeholder="現場住所を入力"
                />
              </div>
              <div className="text-sm text-gray-500 tabular-nums shrink-0">
                工期：{viewYear}年{viewMonth + 1}月
              </div>
            </div>
          </div>

          {/* 会社ロゴ + 自社情報（設定画面の情報を表示） */}
          <div className="flex items-center gap-4 ml-auto">
            {userSettings?.logoUrl && (
              <img
                src={userSettings.logoUrl}
                alt="会社ロゴ"
                className="h-14 max-w-[160px] object-contain shrink-0"
              />
            )}
            <div className="text-right">
              <div className="w-52 sm:w-64 text-sm font-semibold truncate">
                {userSettings?.companyName || ""}
              </div>
              <div className="w-52 sm:w-64 text-xs text-gray-500 truncate">
                {userSettings?.address || ""}
              </div>
              <div className="w-52 sm:w-64 text-xs text-gray-500 truncate">
                {userSettings?.phone ? `TEL ${userSettings.phone}` : ""}
              </div>
            </div>
          </div>
        </div>

        {/* ===== チャート本体 ===== */}
        <div className="chart-card bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="chart-scroll overflow-x-auto">
            <div className="flex" style={{ minWidth: 640 }}>
              {/* --- 左：タスク列 --- */}
              <div className="w-44 sm:w-56 shrink-0 border-r border-gray-100">
                <div className="h-12 flex items-end px-4 pb-2 text-xs text-gray-400 font-medium border-b border-gray-100">
                  工程 / 担当
                </div>
                {tasks.map((t) => (
                  <div
                    key={t.id}
                    className="relative h-14 px-3 flex items-center gap-2 border-b border-gray-50 group"
                  >
                    {/* 色変更ボタン */}
                    <button
                      className="no-print w-4 h-4 rounded-full shrink-0 ring-2 ring-white shadow"
                      style={{ background: t.color }}
                      onClick={() =>
                        setColorPickerFor(colorPickerFor === t.id ? null : t.id)
                      }
                      aria-label="色を変更"
                    />
                    <div className="min-w-0 flex-1">
                      <input
                        value={t.name}
                        onChange={(e) =>
                          updateTask(t.id, { name: e.target.value })
                        }
                        className="w-full text-sm font-medium bg-transparent truncate"
                        placeholder="工程名"
                      />
                      <input
                        value={t.assignee}
                        onChange={(e) =>
                          updateTask(t.id, { assignee: e.target.value })
                        }
                        className="w-full text-xs text-gray-400 bg-transparent truncate"
                        placeholder="担当者"
                      />
                    </div>
                    {/* 行削除 */}
                    <button
                      onClick={() => removeRow(t.id)}
                      className="no-print w-6 h-6 rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 text-sm leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      aria-label="行を削除"
                    >
                      ×
                    </button>
                    {/* カラーピッカー */}
                    {colorPickerFor === t.id && (
                      <div className="no-print absolute left-2 top-12 z-20 flex gap-2 p-2.5 bg-white rounded-xl shadow-lg border border-gray-100">
                        {COLORS.map((c) => (
                          <button
                            key={c}
                            className="w-6 h-6 rounded-full active:scale-90 transition-transform"
                            style={{
                              background: c,
                              boxShadow:
                                t.color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : "none",
                            }}
                            onClick={() => {
                              updateTask(t.id, { color: c });
                              setColorPickerFor(null);
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* --- 右：日付グリッド --- */}
              <div className="flex-1">
                <div
                  ref={gridRef}
                  className="chart-grid relative"
                  style={{ minWidth: daysInMonth * 34 }}
                  onPointerMove={onDragMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  {/* 日付ヘッダー */}
                  <div className="flex h-12 border-b border-gray-100">
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const d = addDays(monthStart, i);
                      const dow = d.getDay();
                      const hol = holidayName(d);
                      const isRed = dow === 0 || hol; // 日曜・祝日
                      const isSat = dow === 6;
                      return (
                        <div
                          key={i}
                          title={hol || ""}
                          className={`relative flex-1 flex flex-col items-center justify-end pb-1.5 text-center ${
                            isRed ? "bg-red-50/80" : isSat ? "bg-blue-50/50" : ""
                          }`}
                        >
                          <span
                            className={`text-[10px] ${
                              isRed
                                ? "text-red-500"
                                : isSat
                                ? "text-blue-400"
                                : "text-gray-400"
                            }`}
                          >
                            {hol ? "祝" : WEEKDAYS[dow]}
                          </span>
                          <span
                            className={`text-xs tabular-nums ${
                              i === todayIdx
                                ? "w-5 h-5 flex items-center justify-center rounded-full bg-blue-500 text-white font-semibold"
                                : isRed
                                ? "text-red-500 font-medium"
                                : isSat
                                ? "text-blue-500"
                                : "text-gray-600"
                            }`}
                          >
                            {i + 1}
                          </span>
                          {/* 日曜・祝日の赤ライン */}
                          {isRed && (
                            <span className="absolute bottom-0 left-0.5 right-0.5 h-0.5 rounded-full bg-red-400" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 行 */}
                  {tasks.map((t) => {
                    // 実働日のみのセグメントを算出（休日で分断）
                    const segments: { start: number; end: number }[] = [];
                    let trueStartIdx: number | null = null;
                    let trueEndIdx: number | null = null;
                    if (t.start && t.duration > 0) {
                      const span = workdaySpan(parse(t.start), t.duration);
                      trueStartIdx = diffDays(span[0], monthStart);
                      trueEndIdx = diffDays(span[span.length - 1], monthStart);
                      span
                        .map((dd) => diffDays(dd, monthStart))
                        .filter((i) => i >= 0 && i < daysInMonth)
                        .forEach((i) => {
                          const last = segments[segments.length - 1];
                          if (last && i === last.end + 1) last.end = i;
                          else segments.push({ start: i, end: i });
                        });
                    }
                    const widest = segments.reduce<{ start: number; end: number } | null>(
                      (a, s) =>
                        !a || s.end - s.start > a.end - a.start ? s : a,
                      null
                    );

                    return (
                      <div
                        key={t.id}
                        className="relative h-14 border-b border-gray-50"
                      >
                        {/* 背景セル（タップでバー作成） */}
                        <div className="absolute inset-0 flex">
                          {Array.from({ length: daysInMonth }, (_, i) => {
                            const cd = addDays(monthStart, i);
                            const dow = cd.getDay();
                            const isRed = dow === 0 || holidayName(cd);
                            const isSat = dow === 6;
                            return (
                              <div
                                key={i}
                                onClick={() => handleCellClick(t, i)}
                                className={`flex-1 border-r border-gray-50 ${
                                  isRed
                                    ? "bg-red-50/80"
                                    : isSat
                                    ? "bg-blue-50/50"
                                    : ""
                                } ${
                                  !t.start && !isRed
                                    ? "cursor-pointer hover:bg-blue-50/60 active:bg-blue-100/60"
                                    : ""
                                }`}
                              />
                            );
                          })}
                        </div>

                        {/* 今日のライン */}
                        {todayIdx >= 0 && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-blue-400/50 pointer-events-none"
                            style={{
                              left: `${((todayIdx + 0.5) / daysInMonth) * 100}%`,
                            }}
                          />
                        )}

                        {/* 休日をまたぐ際の接続ライン */}
                        {segments.length > 1 && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 h-0.5 rounded-full pointer-events-none"
                            style={{
                              left: `${(segments[0].start / daysInMonth) * 100}%`,
                              width: `${
                                ((segments[segments.length - 1].end -
                                  segments[0].start +
                                  1) /
                                  daysInMonth) *
                                100
                              }%`,
                              background: t.color,
                              opacity: 0.35,
                            }}
                          />
                        )}

                        {/* タスクバー（実働日のみ・休日はスキップ） */}
                        {segments.map((seg, si) => (
                          <div
                            key={si}
                            className="bar-handle absolute top-1/2 -translate-y-1/2 h-8 flex items-center cursor-grab active:cursor-grabbing select-none"
                            style={{
                              left: `${(seg.start / daysInMonth) * 100}%`,
                              width: `${
                                ((seg.end - seg.start + 1) / daysInMonth) * 100
                              }%`,
                              background: t.color,
                              borderRadius: 10,
                              boxShadow: `0 2px 8px ${t.color}55`,
                            }}
                            onPointerDown={(e) => startDrag(e, t, "move")}
                          >
                            {/* 左ハンドル（先頭セグメントのみ） */}
                            {si === 0 && seg.start === trueStartIdx && (
                              <div
                                className="bar-handle no-print absolute left-0 top-0 bottom-0 w-4 flex items-center justify-center cursor-ew-resize"
                                onPointerDown={(e) =>
                                  startDrag(e, t, "resize-l")
                                }
                              >
                                <div className="w-1 h-4 rounded-full bg-white/70" />
                              </div>
                            )}
                            {/* 期間ラベル（最長セグメントに表示） */}
                            {seg === widest && (
                              <span className="mx-auto px-1 text-[11px] font-semibold text-white whitespace-nowrap overflow-hidden pointer-events-none">
                                実働{t.duration}日
                              </span>
                            )}
                            {/* 右ハンドル（末尾セグメントのみ） */}
                            {si === segments.length - 1 &&
                              seg.end === trueEndIdx && (
                                <div
                                  className="bar-handle no-print absolute right-0 top-0 bottom-0 w-4 flex items-center justify-center cursor-ew-resize"
                                  onPointerDown={(e) =>
                                    startDrag(e, t, "resize-r")
                                  }
                                >
                                  <div className="w-1 h-4 rounded-full bg-white/70" />
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 操作ヒント */}
        <p className="no-print mt-4 text-xs text-gray-400 leading-relaxed">
          日曜・祝日（赤）は休工日として扱われ、バーは自動的にスキップします。
          空の行の平日セルをタップするとバーを作成。バー本体をドラッグで移動、
          両端の白いグリップをスライドで実働日数を伸縮できます。
          左の●をタップすると色を変更、上部の工事件名・現場住所はそのまま編集できます。
        </p>
      </div>
    </div>
  );
}
