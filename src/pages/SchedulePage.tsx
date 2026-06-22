import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Project, UserSettings } from '../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';
import {
  fmt, parse, addDays, diffDays, WEEKDAYS,
  holidayName, isOff, nextWorkday, prevWorkday,
  workdaySpan, countWorkdays,
  type WorkdayConfig, DEFAULT_WORKDAY_CONFIG,
  HOLIDAY_YEAR_MIN, HOLIDAY_YEAR_MAX,
} from "../utils/workdays";

/* ============================================================
   工程表（ガントチャート）
   - 工事件名・現場住所・自社情報・会社ロゴの表示（Firestoreと連動）
   - セルをタップ → タスクバー作成
   - バー本体をドラッグ → 移動 / 両端ハンドル → 期間伸縮
   - 行の追加・削除、タスク名/担当者のインライン編集
   - タスクごとの色選択(iOSカラーパレット)
   - 印刷ボタン → A4横に最適化された@media printを適用
   ============================================================ */

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
// 最終タスクの終了日より後に表示する空き日数（新しい工程を追加できるようにするため）
const BUFFER_DAYS = 7;
const UNDO_LIMIT = 50;
type SaveState = "idle" | "saving" | "saved" | "error";

export interface GanttTask {
  id: string;
  name: string;
  assignee: string;
  color: string;
  start: string | null; // YYYY-MM-DD
  duration: number; // 実働日数
}

// Firestoreから取得したganttTasksを安全なGanttTask[]に正規化する
function sanitizeTasks(raw: unknown): GanttTask[] {
  const arr = (Array.isArray(raw) ? raw : []) as Partial<GanttTask>[];
  return arr
    .filter((t) => t && typeof t === "object")
    .map((t) => ({
      id: String(t.id ?? crypto.randomUUID()),
      name: typeof t.name === "string" ? t.name : "",
      assignee: typeof t.assignee === "string" ? t.assignee : "",
      color: typeof t.color === "string" ? t.color : COLORS[0],
      start: typeof t.start === "string" ? t.start : null,
      duration: Number.isFinite(t.duration) && (t.duration as number) > 0
        ? Math.floor(t.duration as number)
        : 0,
    }));
}

type DragMode = "move" | "resize-l" | "resize-r";
interface DragState {
  taskId: string;
  mode: DragMode;
  startX: number;
  origStartDate: Date;
  origEndDate: Date;
  origDur: number;
  snapshot: GanttTask[];
  undoPushed: boolean;
}

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const today = new Date();
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [undoStack, setUndoStack] = useState<GanttTask[][]>([]);
  const [workdayConfig, setWorkdayConfig] = useState<WorkdayConfig>(DEFAULT_WORKDAY_CONFIG);
  const [showWorkdaySettings, setShowWorkdaySettings] = useState(false);
  const [newHoliday, setNewHoliday] = useState("");
  const rangeRef = useRef<{ start: Date; days: number } | null>(null);

  // ---------- Firestore連携 ----------
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------- 工事件名・現場住所・工期（project連動） ----------
  const [projectName, setProjectName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [constructionPeriod, setConstructionPeriod] = useState("");

  const mountedRef = useRef(true);
  const tasksLoadedRef = useRef(false);
  const tasksDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fieldDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const tasksRef = useRef<GanttTask[]>([]);
  tasksRef.current = tasks;
  const undoStackRef = useRef(undoStack);
  undoStackRef.current = undoStack;
  const tasksDirtyRef = useRef(false);
  const pendingFieldsRef = useRef<Record<string, string>>({});
  const pendingSourcesRef = useRef<Set<string>>(new Set());
  const userEditedTasksRef = useRef(false);
  const isDraggingRef = useRef(false);
  // 直前にonSnapshotで適用したtasksのJSON文字列（保存effectの書き戻し防止ガード用）
  const lastAppliedTasksRef = useRef<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const markPending = useCallback((source: string) => {
    pendingSourcesRef.current.add(source);
    setSaveState("saving");
  }, []);
  const markDone = useCallback((source: string, ok: boolean) => {
    pendingSourcesRef.current.delete(source);
    if (!ok) setSaveState("error");
    else if (pendingSourcesRef.current.size === 0) setSaveState("saved");
  }, []);

  // 変更「前」のスナップショットを積む
  const pushUndo = useCallback(() => {
    // これから編集が入るため、保存effectのリモート書き戻し防止ガードを無効化する
    // （編集後の値が偶然リモート適用直後の値と一致しても保存をスキップしないようにする）
    lastAppliedTasksRef.current = null;
    setUndoStack((s) => [
      ...s.slice(-(UNDO_LIMIT - 1)),
      tasksRef.current.map((t) => ({ ...t })),
    ]);
  }, []);

  const undo = useCallback(() => {
    const s = undoStackRef.current;
    if (s.length === 0) return;
    const prev = s[s.length - 1];
    setUndoStack(s.slice(0, -1));
    userEditedTasksRef.current = true; // 工期同期・保存を発火させる
    // Undoでtasksがリモート適用直後と同一値に戻る可能性があり、その場合も
    // Firestore側が別の値を保持していれば保存して食い違いを解消する必要があるため破棄する
    lastAppliedTasksRef.current = null;
    // onSnapshotの取り込みガード（225行目）をsetTasksより前に閉じ、競合状態を防ぐ
    tasksDirtyRef.current = true;
    setTasks(prev);
  }, []);

  const undoFnRef = useRef(undo);
  undoFnRef.current = undo;

  // ---------- マウント管理 ----------
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return; // 入力中はブラウザ標準Undoを優先
        e.preventDefault();
        undoFnRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ---------- データロード & リアルタイム同期 ----------
  useEffect(() => {
    if (!id) return;
    tasksLoadedRef.current = false;

    // ローカルに保存待ち（デバウンス未確定）の値がある間は、リモート値で上書きしない
    const applyField = (
      field: "projectName" | "projectLocation" | "constructionPeriod",
      setter: (v: string) => void,
      value: string
    ) => {
      if (field in pendingFieldsRef.current) return;
      setter(value);
    };

    const unsubscribe = onSnapshot(
      doc(db, "projects", id),
      (snap) => {
        if (!mountedRef.current) return;
        if (snap.exists()) {
          const data = snap.data() as Project;
          applyField("projectName", setProjectName, data.projectName ?? "");
          applyField("projectLocation", setSiteAddress, data.projectLocation ?? "");
          applyField("constructionPeriod", setConstructionPeriod, data.constructionPeriod ?? "");

          if (!pendingSourcesRef.current.has("workdayConfig")) {
            const wc = data.workdayConfig;
            const nextConfig =
              wc && typeof wc === "object" &&
              typeof (wc as { saturdayOff?: unknown }).saturdayOff === "boolean" &&
              Array.isArray((wc as { customHolidays?: unknown }).customHolidays) &&
              (wc as { customHolidays: unknown[] }).customHolidays.every((d) => typeof d === "string")
                ? (wc as WorkdayConfig)
                : DEFAULT_WORKDAY_CONFIG;
            setWorkdayConfig((prev) =>
              JSON.stringify(prev) === JSON.stringify(nextConfig) ? prev : nextConfig
            );
          }

          // ドラッグ中・保存待ち中はリモートのtasksを取り込まない（編集中の上書き防止）
          if (!isDraggingRef.current && !tasksDirtyRef.current) {
            const loaded = sanitizeTasks(data.ganttTasks);
            lastAppliedTasksRef.current = JSON.stringify(loaded);
            setTasks(loaded);
          }
        } else {
          setError("工程表データが見つかりません。");
        }
        tasksLoadedRef.current = true;
        setLoading(false);
      },
      (err) => {
        if (!mountedRef.current) return;
        logFirebaseError(err, "工程表データの読み込み");
        setError(firebaseErrorMessage(err, "工程表データの読み込み"));
        tasksLoadedRef.current = true;
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
      if (tasksDebounceRef.current) clearTimeout(tasksDebounceRef.current);
      Object.values(fieldDebounceRef.current).forEach((t) => { if (t) clearTimeout(t); });
      // 未保存分をフラッシュしてから離脱する
      if (tasksDirtyRef.current) {
        updateDoc(doc(db, "projects", id), { ganttTasks: tasksRef.current })
          .catch((err) => logFirebaseError(err, "工程表の保存"));
      }
      tasksDirtyRef.current = false;
      const pending = { ...pendingFieldsRef.current };
      if (Object.keys(pending).length > 0) {
        pendingFieldsRef.current = {};
        updateDoc(doc(db, "projects", id), pending)
          .catch((err) => logFirebaseError(err, "工程表データの保存"));
      }
      pendingSourcesRef.current.clear();
      setUndoStack([]);
      tasksLoadedRef.current = false;
      setLoading(true);
    };
  }, [id]);

  // ---------- ユーザー設定（会社ロゴ等）の読み込み ----------
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    let aborted = false;
    (async () => {
      try {
        const s = await getDoc(doc(db, "users", user.uid));
        if (aborted || !mountedRef.current) return;
        if (s.exists()) setUserSettings(s.data() as UserSettings);
      } catch (err) {
        if (aborted || !mountedRef.current) return;
        logFirebaseError(err, "ユーザー設定の読み込み");
      }
    })();
    return () => { aborted = true; };
  }, []);

  // ---------- tasks 保存（デバウンス） ----------
  useEffect(() => {
    if (!id || !tasksLoadedRef.current || !userEditedTasksRef.current) return;
    // リモートから受信した直後の値をそのまま書き戻さない
    if (JSON.stringify(tasksRef.current) === lastAppliedTasksRef.current) {
      // 変更操作側で先出しした tasksDirtyRef を、保存不要なno-opの場合は戻す
      tasksDirtyRef.current = false;
      return;
    }
    tasksDirtyRef.current = true;
    markPending("tasks");
    if (tasksDebounceRef.current) clearTimeout(tasksDebounceRef.current);
    tasksDebounceRef.current = setTimeout(() => {
      tasksDirtyRef.current = false;
      updateDoc(doc(db, "projects", id), { ganttTasks: tasksRef.current })
        .then(() => { if (mountedRef.current) markDone("tasks", true); })
        .catch((err) => {
          tasksDirtyRef.current = true;
          logFirebaseError(err, "工程表の保存");
          if (mountedRef.current) markDone("tasks", false);
        });
    }, DEBOUNCE_MS);
    return () => { if (tasksDebounceRef.current) clearTimeout(tasksDebounceRef.current); };
  }, [tasks, id, markPending, markDone]);

  // ---------- 工事件名・現場住所・工期 保存（デバウンス） ----------
  const saveProjectField = useCallback((field: "projectName" | "projectLocation" | "constructionPeriod", value: string) => {
    if (!id) return;
    pendingFieldsRef.current[field] = value;
    markPending(field);
    if (fieldDebounceRef.current[field]) clearTimeout(fieldDebounceRef.current[field]);
    fieldDebounceRef.current[field] = setTimeout(() => {
      delete pendingFieldsRef.current[field];
      updateDoc(doc(db, "projects", id), { [field]: value })
        .then(() => { if (mountedRef.current) markDone(field, true); })
        .catch((err) => {
          logFirebaseError(err, "工程表データの保存");
          if (mountedRef.current) markDone(field, false);
        });
    }, DEBOUNCE_MS);
  }, [id, markPending, markDone]);

  const handleProjectNameChange = (value: string) => {
    setProjectName(value);
    saveProjectField("projectName", value);
  };
  const handleSiteAddressChange = (value: string) => {
    setSiteAddress(value);
    saveProjectField("projectLocation", value);
  };

  const updateWorkdayConfig = (next: WorkdayConfig) => {
    setWorkdayConfig(next);
    userEditedTasksRef.current = true; // 工期再計算を許可（休日が変わるとspanが変わるため）
    if (!id) return;
    markPending("workdayConfig");
    updateDoc(doc(db, "projects", id), { workdayConfig: next })
      .then(() => { if (mountedRef.current) markDone("workdayConfig", true); })
      .catch((err) => {
        logFirebaseError(err, "休工日設定の保存");
        if (mountedRef.current) markDone("workdayConfig", false);
      });
  };

  // ---------- 表示範囲（工程開始日〜工程終了日を月をまたいで連続表示） ----------
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // 工程開始日・終了日をタスクの実働日数（休日スキップ後）から算出
  let scheduleStartDate: Date | null = null;
  let scheduleEndDate: Date | null = null;
  for (const t of tasks) {
    if (!t.start || t.duration <= 0) continue;
    const span = workdaySpan(parse(t.start), t.duration, workdayConfig);
    const s = span[0];
    const e = span[span.length - 1];
    if (!scheduleStartDate || s < scheduleStartDate) scheduleStartDate = s;
    if (!scheduleEndDate || e > scheduleEndDate) scheduleEndDate = e;
  }

  // 工期（実際の工程開始日〜終了日）。表紙の工期欄(project.constructionPeriod)と共有する。
  const formatPeriodDate = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  const computedPeriod =
    scheduleStartDate && scheduleEndDate
      ? `${formatPeriodDate(scheduleStartDate)}〜${formatPeriodDate(scheduleEndDate)}`
      : null;

  // 工程の期間が変わったら、表紙の工期欄にも自動反映する
  useEffect(() => {
    if (!tasksLoadedRef.current || !userEditedTasksRef.current) return;
    // リモートから受信した直後の値から計算された工期を書き戻さない
    if (JSON.stringify(tasksRef.current) === lastAppliedTasksRef.current) return;
    if (!computedPeriod || computedPeriod === constructionPeriod) return;
    setConstructionPeriod(computedPeriod);
    saveProjectField("constructionPeriod", computedPeriod);
  }, [computedPeriod, constructionPeriod, saveProjectField]);

  // 表示範囲は「開始日（工程未登録なら本日）から最低1ヶ月分」を確保し、
  // その期間内の空セルは自由に工程を追加できる。
  // 登録済みタスクの実働範囲が1ヶ月を超える場合は、最終タスクの終了日 + BUFFER_DAYS まで表示する。
  // 起点：最先頭タスクの BUFFER_DAYS 前（前倒し操作の余白）。タスク未登録なら本日。
  const computedStart = scheduleStartDate
    ? addDays(scheduleStartDate, -BUFFER_DAYS)
    : todayDateOnly;
  const oneMonthLater = new Date(
    computedStart.getFullYear(),
    computedStart.getMonth() + 1,
    computedStart.getDate()
  );
  const taskEnd = scheduleEndDate ? addDays(scheduleEndDate, BUFFER_DAYS) : oneMonthLater;
  const rangeEndDate = taskEnd > oneMonthLater ? taskEnd : oneMonthLater;
  const computedRange = {
    start: computedStart,
    days: diffDays(rangeEndDate, computedStart) + 1,
  };
  // ドラッグ中は範囲を凍結し、グリッド原点・幅が動かないようにする
  const range = isDragging && rangeRef.current ? rangeRef.current : computedRange;
  rangeRef.current = range;
  const monthStart = range.start;
  const daysInMonth = range.days;
  const todayIdxRaw = diffDays(todayDateOnly, monthStart);
  const todayIdx = todayIdxRaw >= 0 && todayIdxRaw < daysInMonth ? todayIdxRaw : -1;
  const rangeEndYear = addDays(monthStart, daysInMonth - 1).getFullYear();
  const holidayCoverageOk =
    monthStart.getFullYear() >= HOLIDAY_YEAR_MIN && rangeEndYear <= HOLIDAY_YEAR_MAX;
  const monthBands: { label: string; days: number }[] = [];
  for (let i = 0; i < daysInMonth; i++) {
    const d = addDays(monthStart, i);
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    const last = monthBands[monthBands.length - 1];
    if (last && last.label === label) last.days++;
    else monthBands.push({ label, days: 1 });
  }
  const printChunks: { start: Date; days: number }[] = [];
  if (daysInMonth > 45) {
    let chunkStart = new Date(monthStart);
    const rangeEnd = addDays(monthStart, daysInMonth - 1);
    while (chunkStart <= rangeEnd) {
      const nextMonthStart = new Date(chunkStart.getFullYear(), chunkStart.getMonth() + 1, 1);
      const chunkEnd = addDays(nextMonthStart, -1) < rangeEnd ? addDays(nextMonthStart, -1) : rangeEnd;
      printChunks.push({
        start: new Date(chunkStart),
        days: diffDays(chunkEnd, chunkStart) + 1,
      });
      chunkStart = addDays(chunkEnd, 1);
    }
  }

  // ---------- タスク操作 ----------
  const updateTask = (taskId: string, patch: Partial<GanttTask>) => {
    // onSnapshotの取り込みガード（225行目）をsetTasksより前に閉じ、競合状態を防ぐ
    tasksDirtyRef.current = true;
    userEditedTasksRef.current = true;
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  };

  const addRow = () => {
    pushUndo();
    // onSnapshotの取り込みガード（225行目）をsetTasksより前に閉じ、競合状態を防ぐ
    tasksDirtyRef.current = true;
    userEditedTasksRef.current = true;
    setTasks((ts) => [
      ...ts,
      {
        id: crypto.randomUUID(),
        name: "新しい工程",
        assignee: "",
        color: COLORS[ts.length % COLORS.length],
        start: null,
        duration: 0,
      },
    ]);
  };

  const removeRow = (taskId: string) => {
    pushUndo();
    // onSnapshotの取り込みガード（225行目）をsetTasksより前に閉じ、競合状態を防ぐ
    tasksDirtyRef.current = true;
    userEditedTasksRef.current = true;
    setTasks((ts) => ts.filter((t) => t.id !== taskId));
  };

  // 工程の並べ替え（▲▼）
  const moveRow = (id: string, dir: -1 | 1) => {
    const idx = tasksRef.current.findIndex((t) => t.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= tasksRef.current.length) return;
    pushUndo(); // 並べ替えもUndo対象
    // onSnapshotの取り込みガード（225行目）をsetTasksより前に閉じ、競合状態を防ぐ
    tasksDirtyRef.current = true;
    userEditedTasksRef.current = true;
    setTasks((ts) => {
      const next = [...ts];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  };

  // セルをタップ → バー作成（バー未設定の行のみ・休日は不可）
  const handleCellClick = (task: GanttTask, dayIdx: number) => {
    if (task.start) return; // 既にバーがある行はドラッグで操作
    const date = addDays(monthStart, dayIdx);
    if (isOff(date, workdayConfig)) return; // 休工日のため開始不可
    pushUndo();
    updateTask(task.id, {
      start: fmt(date),
      duration: 1,
    });
  };

  // ---------- ドラッグ（移動・伸縮 / 営業日ベース） ----------
  const startDrag = (e: React.PointerEvent<HTMLDivElement>, task: GanttTask, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    if (!gridRef.current || !task.start || task.duration <= 0) return;
    const span = workdaySpan(parse(task.start), task.duration, workdayConfig);
    dragRef.current = {
      taskId: task.id,
      mode,
      startX: e.clientX,
      origStartDate: span[0],
      origEndDate: span[span.length - 1],
      origDur: task.duration,
      snapshot: tasksRef.current.map((t) => ({ ...t })),
      undoPushed: false,
    };
    isDraggingRef.current = true;
    // ドラッグもpushUndoと同様、これから編集が入るため保存effectのガードを無効化する
    lastAppliedTasksRef.current = null;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d || !gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      const pxPerDay = rect.width / daysInMonth;
      const idx = Math.min(
        Math.max(Math.floor((e.clientX - rect.left) / pxPerDay), 0),
        daysInMonth - 1
      );
      const pointerDate = addDays(monthStart, idx);

      if (d.mode === "move") {
        const delta = Math.round((e.clientX - d.startX) / pxPerDay);
        let ns = addDays(d.origStartDate, delta);
        if (ns < monthStart) ns = new Date(monthStart);
        ns = nextWorkday(ns, workdayConfig); // 休日には置けないので翌営業日へスナップ
        if (!d.undoPushed) {
          d.undoPushed = true;
          setUndoStack((s) => [...s.slice(-(UNDO_LIMIT - 1)), d.snapshot]);
        }
        updateTask(d.taskId, { start: fmt(ns) });
      } else if (d.mode === "resize-r") {
        // ポインタ位置までの実働日数を期間にする
        const dur =
          pointerDate < d.origStartDate
            ? 1
            : Math.max(1, countWorkdays(d.origStartDate, pointerDate, workdayConfig));
        if (!d.undoPushed) {
          d.undoPushed = true;
          setUndoStack((s) => [...s.slice(-(UNDO_LIMIT - 1)), d.snapshot]);
        }
        updateTask(d.taskId, { duration: dur });
      } else if (d.mode === "resize-l") {
        // 終了日を固定したまま開始側を伸縮（休日は開始日にしない）
        let ns =
          pointerDate > d.origEndDate
            ? new Date(d.origEndDate)
            : nextWorkday(pointerDate, workdayConfig);
        if (ns > d.origEndDate) ns = prevWorkday(d.origEndDate, workdayConfig);
        const dur = Math.max(1, countWorkdays(ns, d.origEndDate, workdayConfig));
        if (!d.undoPushed) {
          d.undoPushed = true;
          setUndoStack((s) => [...s.slice(-(UNDO_LIMIT - 1)), d.snapshot]);
        }
        updateTask(d.taskId, { start: fmt(ns), duration: dur });
      }
    },
    [daysInMonth, monthStart, workdayConfig] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const endDrag = () => {
    dragRef.current = null;
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  const renderChart = (start: Date, days: number, interactive: boolean): React.ReactElement => {
    const chartTodayIdxRaw = diffDays(todayDateOnly, start);
    const chartTodayIdx =
      start.getTime() === monthStart.getTime() && days === daysInMonth
        ? todayIdx
        : chartTodayIdxRaw >= 0 && chartTodayIdxRaw < days ? chartTodayIdxRaw : -1;
    const chartMonthBands =
      start.getTime() === monthStart.getTime() && days === daysInMonth
        ? monthBands
        : (() => {
            const bands: { label: string; days: number }[] = [];
            for (let i = 0; i < days; i++) {
              const d = addDays(start, i);
              const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
              const last = bands[bands.length - 1];
              if (last && last.label === label) last.days++;
              else bands.push({ label, days: 1 });
            }
            return bands;
          })();

    return (
      <div className="chart-scroll overflow-x-auto">
        <div className="flex" style={{ minWidth: 640 }}>
          {/* --- 左：タスク列 --- */}
          <div className="w-44 sm:w-56 shrink-0 border-r border-gray-100">
            <div className="h-6 border-b border-gray-100" />
            <div className="h-12 flex items-end px-4 pb-2 text-xs text-gray-400 font-medium border-b border-gray-100">
              工程 / 担当
            </div>
            {tasks.map((t, index) => (
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
                    onFocus={pushUndo}
                    onChange={(e) =>
                      updateTask(t.id, { name: e.target.value })
                    }
                    className="w-full text-sm font-medium bg-transparent truncate"
                    placeholder="工程名"
                  />
                  <input
                    value={t.assignee}
                    onFocus={pushUndo}
                    onChange={(e) =>
                      updateTask(t.id, { assignee: e.target.value })
                    }
                    className="w-full text-xs text-gray-400 bg-transparent truncate"
                    placeholder="担当者"
                  />
                </div>
                {/* 並べ替え */}
                <div className="no-print flex flex-col shrink-0">
                  <button
                    onClick={() => moveRow(t.id, -1)}
                    disabled={index === 0}
                    className="w-5 h-4 text-[9px] leading-none text-gray-300 hover:text-blue-500 disabled:opacity-30"
                    aria-label="上へ移動"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveRow(t.id, 1)}
                    disabled={index === tasks.length - 1}
                    className="w-5 h-4 text-[9px] leading-none text-gray-300 hover:text-blue-500 disabled:opacity-30"
                    aria-label="下へ移動"
                  >
                    ▼
                  </button>
                </div>
                {/* 行削除 */}
                <button
                  onClick={() => removeRow(t.id)}
                  className="no-print w-6 h-6 rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 text-sm leading-none"
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
                          pushUndo();
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
              ref={interactive ? gridRef : undefined}
              className="chart-grid relative"
              style={{ minWidth: days * 34 }}
              onPointerMove={interactive ? onDragMove : undefined}
              onPointerUp={interactive ? endDrag : undefined}
              onPointerCancel={interactive ? endDrag : undefined}
            >
              <div className="flex h-6 border-b border-gray-100">
                {chartMonthBands.map((b, i) => (
                  <div
                    key={i}
                    style={{ width: `${(b.days / days) * 100}%` }}
                    className="px-2 flex items-center border-r border-gray-100 overflow-hidden whitespace-nowrap text-[10px] font-medium text-gray-400"
                  >
                    {b.label}
                  </div>
                ))}
              </div>
              {/* 日付ヘッダー */}
              <div className="flex h-12 border-b border-gray-100">
                {Array.from({ length: days }, (_, i) => {
                  const d = addDays(start, i);
                  const dow = d.getDay();
                  const off = isOff(d, workdayConfig);
                  const isSat = d.getDay() === 6 && !off;
                  const hol = holidayName(d);
                  const isCustom = workdayConfig.customHolidays.includes(fmt(d));
                  return (
                    <div
                      key={i}
                      title={hol || (isCustom ? "休工日" : "")}
                      className={`relative flex-1 flex flex-col items-center justify-end pb-1.5 text-center ${
                        off ? "bg-red-50/80" : isSat ? "bg-blue-50/50" : ""
                      }`}
                    >
                      <span
                        className={`text-[10px] ${
                          off
                            ? "text-red-500"
                            : isSat
                            ? "text-blue-400"
                            : "text-gray-400"
                        }`}
                      >
                        {hol ? "祝" : isCustom ? "休" : WEEKDAYS[dow]}
                      </span>
                      <span
                        className={`text-xs tabular-nums ${
                          i === chartTodayIdx
                            ? "w-5 h-5 flex items-center justify-center rounded-full bg-blue-500 text-white font-semibold"
                            : off
                            ? "text-red-500 font-medium"
                            : isSat
                            ? "text-blue-500"
                            : "text-gray-600"
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      {/* 日曜・祝日の赤ライン */}
                      {off && (
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
                  const span = workdaySpan(parse(t.start), t.duration, workdayConfig);
                  trueStartIdx = diffDays(span[0], start);
                  trueEndIdx = diffDays(span[span.length - 1], start);
                  span
                    .map((dd) => diffDays(dd, start))
                    .filter((i) => i >= 0 && i < days)
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
                      {Array.from({ length: days }, (_, i) => {
                        const cd = addDays(start, i);
                        const off = isOff(cd, workdayConfig);
                        const isSat = cd.getDay() === 6 && !off;
                        return (
                          <div
                            key={i}
                            onClick={interactive ? () => handleCellClick(t, i) : undefined}
                            className={`flex-1 border-r border-gray-50 ${
                              off
                                ? "bg-red-50/80"
                                : isSat
                                ? "bg-blue-50/50"
                                : ""
                            } ${
                              interactive && !t.start && !off
                                ? "cursor-pointer hover:bg-blue-50/60 active:bg-blue-100/60"
                                : ""
                            }`}
                          />
                        );
                      })}
                    </div>

                    {/* 今日のライン */}
                    {chartTodayIdx >= 0 && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-blue-400/50 pointer-events-none"
                        style={{
                          left: `${((chartTodayIdx + 0.5) / days) * 100}%`,
                        }}
                      />
                    )}

                    {/* 休日をまたぐ際の接続ライン */}
                    {segments.length > 1 && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-0.5 rounded-full pointer-events-none"
                        style={{
                          left: `${(segments[0].start / days) * 100}%`,
                          width: `${
                            ((segments[segments.length - 1].end -
                              segments[0].start +
                              1) /
                              days) *
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
                        className={`bar-handle absolute top-1/2 -translate-y-1/2 h-8 flex items-center select-none ${
                          interactive ? "cursor-grab active:cursor-grabbing" : ""
                        }`}
                        style={{
                          left: `${(seg.start / days) * 100}%`,
                          width: `${
                            ((seg.end - seg.start + 1) / days) * 100
                          }%`,
                          background: t.color,
                          borderRadius: 10,
                          boxShadow: `0 2px 8px ${t.color}55`,
                        }}
                        onPointerDown={interactive ? (e) => startDrag(e, t, "move") : undefined}
                      >
                        {/* 左ハンドル（先頭セグメントのみ） */}
                        {interactive && si === 0 && seg.start === trueStartIdx && (
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
                        {interactive &&
                          si === segments.length - 1 &&
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
    );
  };

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
      className={`min-h-screen bg-gray-50 text-gray-900 ${printChunks.length > 0 ? "has-print-chunks" : ""}`}
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Segoe UI", sans-serif',
      }}
    >
      {/* 印刷用CSS：A4横・不要要素の非表示 */}
      <style>{`
        .print-only { display: none; }
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { background: #fff !important; }
          .print-only { display: block; }
          .has-print-chunks .screen-only { display: none; }
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
          <span
            className={`no-print text-xs font-medium ${
              saveState === "saving" ? "text-gray-400"
              : saveState === "saved" ? "text-green-600"
              : saveState === "error" ? "text-red-500"
              : "text-transparent"
            }`}
            aria-live="polite"
          >
            {saveState === "saving" && "保存中…"}
            {saveState === "saved" && "✓ 保存済み"}
            {saveState === "error" && "⚠ 保存に失敗しました"}
          </span>
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="px-4 py-2 rounded-full bg-white text-gray-600 text-sm font-medium shadow-sm border border-gray-100 active:opacity-70 disabled:opacity-40"
          >
            ↩ 元に戻す
          </button>
          <button
            onClick={addRow}
            className="px-4 py-2 rounded-full bg-blue-500 text-white text-sm font-medium shadow-sm active:opacity-70"
          >
            ＋ 工程を追加
          </button>
          <button
            onClick={() => setShowWorkdaySettings((v) => !v)}
            className="px-4 py-2 rounded-full bg-white text-gray-600 text-sm font-medium shadow-sm border border-gray-100 active:opacity-70"
          >
            休工日設定
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-full bg-white text-blue-500 text-sm font-medium shadow-sm border border-gray-100 active:opacity-70"
          >
            印刷 / PDF出力
          </button>
        </header>

        {showWorkdaySettings && (
          <div className="no-print bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 mb-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={workdayConfig.saturdayOff}
                onChange={(e) =>
                  updateWorkdayConfig({ ...workdayConfig, saturdayOff: e.target.checked })
                }
              />
              土曜日を休工日にする
            </label>

            <div className="mt-3">
              <div className="text-sm font-medium text-gray-700 mb-1.5">会社休業日</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={newHoliday}
                  onChange={(e) => setNewHoliday(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1"
                />
                <button
                  onClick={() => {
                    if (!newHoliday || workdayConfig.customHolidays.includes(newHoliday)) return;
                    const next = [...workdayConfig.customHolidays, newHoliday].sort();
                    updateWorkdayConfig({ ...workdayConfig, customHolidays: next });
                    setNewHoliday("");
                  }}
                  className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-sm font-medium active:opacity-70"
                >
                  追加
                </button>
              </div>
              {workdayConfig.customHolidays.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {workdayConfig.customHolidays.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-xs text-gray-600"
                    >
                      {d}（{WEEKDAYS[parse(d).getDay()]}）
                      <button
                        onClick={() =>
                          updateWorkdayConfig({
                            ...workdayConfig,
                            customHolidays: workdayConfig.customHolidays.filter((x) => x !== d),
                          })
                        }
                        className="text-gray-400 hover:text-red-400"
                        aria-label="削除"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-3 text-xs text-gray-400">
              休工日はバーが自動的にスキップし、実働日数に含まれません。
            </p>
          </div>
        )}

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
                工期：{computedPeriod ?? (constructionPeriod || "未設定")}
              </div>
            </div>
          </div>

          {/* 会社ロゴ + 自社情報（設定画面の情報を表示） */}
          <div className="flex items-end gap-4 ml-auto self-end">
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
        {!holidayCoverageOk && (
          <div className="no-print mb-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
            表示期間に祝日データの対応範囲（{HOLIDAY_YEAR_MIN}〜{HOLIDAY_YEAR_MAX}年）外の日付が含まれています。範囲外の祝日は平日として扱われます。
          </div>
        )}
        <div className="chart-card bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="screen-only">{renderChart(monthStart, daysInMonth, true)}</div>
          {printChunks.length > 0 && (
            <div className="print-only">
              {printChunks.map((c, i) => (
                <div key={i} style={{ breakAfter: i < printChunks.length - 1 ? "page" : "auto" }}>
                  {renderChart(c.start, c.days, false)}
                </div>
              ))}
            </div>
          )}
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
