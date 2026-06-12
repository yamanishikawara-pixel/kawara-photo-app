// src/shared/scheduleUtils.ts

import type { Project } from '../types';

export type ScheduleStatus = 'todo' | 'in_progress' | 'done' | 'skip';

/** 応援人員 */
export interface Helper {
  name: string;   // 氏名
  count: number;  // 人数
}

export interface ScheduleTask {
  id: string;
  phase: string;
  name: string;
  days: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  status: ScheduleStatus;
  vendor: string;
  note: string;
  helpers: Helper[];  // 応援人員リスト
  workerCount: number; // 自社作業員数
}

export interface ScheduleData {
  tasks: ScheduleTask[];
  skipSundays: boolean;
}

// ─── Date helpers ────────────────────────────────────────────────

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysToStr(dateStr: string, n: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function dateDiff(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

function calcEnd(startDate: string, days: number, skipSun: boolean): string {
  let remaining = Math.max(1, days) - 1;
  const d = parseDate(startDate);
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (!skipSun || d.getDay() !== 0) remaining--;
  }
  return toDateStr(d);
}

function nextWorkDay(dateStr: string, skipSun: boolean): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + 1);
  if (skipSun) {
    while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  }
  return toDateStr(d);
}

// ─── Core algorithms ─────────────────────────────────────────────

/** 各タスクの終了日を startDate + days から再計算する（タスク間の依存関係は持たない） */
export function cascade(tasks: ScheduleTask[], skipSun = false): ScheduleTask[] {
  return tasks.map(task => ({
    ...task,
    endDate: calcEnd(task.startDate, task.days, skipSun),
  }));
}

/** 未完了タスクを n 日順延し再 cascade する（雨天順延等） */
export function postpone(tasks: ScheduleTask[], n: number, skipSun = false): ScheduleTask[] {
  if (n <= 0 || tasks.length === 0) return tasks;
  const shifted = tasks.map(t => {
    if (t.status === 'done' || t.status === 'skip') return { ...t };
    let d = parseDate(t.startDate);
    let rem = n;
    while (rem > 0) {
      d.setDate(d.getDate() + 1);
      if (!skipSun || d.getDay() !== 0) rem--;
    }
    return { ...t, startDate: toDateStr(d) };
  });
  return cascade(shifted, skipSun);
}

// ─── Display constants ────────────────────────────────────────────

export const STATUS_LABELS: Record<ScheduleStatus, string> = {
  todo: '着手前',
  in_progress: '施工中',
  done: '完了',
  skip: 'スキップ',
};

export const STATUS_COLORS: Record<ScheduleStatus, string> = {
  todo:        '#8b8ba8', // 着手前  : グレー（待機）
  in_progress: '#ff9f0a', // 施工中  : Apple オレンジ（アクティブ）
  done:        '#30d158', // 完了    : Apple グリーン
  skip:        '#3a3a3c', // スキップ: 暗グレー
};

export const STATUS_BG: Record<ScheduleStatus, string> = {
  todo:        'rgba(139,139,168,0.15)',
  in_progress: 'rgba(255,159,10,0.18)',
  done:        'rgba(48,209,88,0.15)',
  skip:        'rgba(58,58,60,0.4)',
};

export const VENDOR_PALETTE = [
  '#7c3aed', '#c2410c', '#0369a1', '#15803d',
  '#b91c1c', '#a21caf', '#0e7490', '#92400e',
];

export function vendorColor(vendor: string, allVendors: string[]): string {
  if (!vendor) return '#475569';
  const idx = allVendors.indexOf(vendor);
  return idx < 0 ? '#475569' : VENDOR_PALETTE[idx % VENDOR_PALETTE.length];
}

// ─── Factory ─────────────────────────────────────────────────────

export function helperTotal(helpers: Helper[]): number {
  return helpers.reduce((s, h) => s + (Number(h.count) || 0), 0);
}

export function newTask(overrides?: Partial<ScheduleTask>): ScheduleTask {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    phase: '工事',
    name: '',
    days: 1,
    startDate: toDateStr(new Date()),
    endDate: toDateStr(new Date()),
    status: 'todo',
    vendor: '',
    note: '',
    helpers: [],
    workerCount: 1,
    ...overrides,
  };
}

export function makeTemplate(startDate: string): ScheduleTask[] {
  const templates: (Omit<ScheduleTask, 'id' | 'startDate' | 'endDate'> & { _parallel?: boolean })[] = [
    { phase: '準備', name: '近隣挨拶・安全設置', days: 1, status: 'todo', vendor: '', note: '', helpers: [], workerCount: 1 },
    { phase: '準備', name: '仮設足場組立', days: 1, status: 'todo', vendor: '', note: '', helpers: [], workerCount: 1 },
    { phase: '撤去', name: '既存瓦撤去', days: 2, status: 'todo', vendor: '', note: '', helpers: [], workerCount: 1 },
    { phase: '撤去', name: '野地板解体', days: 1, status: 'todo', vendor: '', note: '', helpers: [], workerCount: 1 },
    { phase: '下地', name: '新野地板施工', days: 1, status: 'todo', vendor: '', note: '', helpers: [], workerCount: 1 },
    { phase: '下地', name: '防水ルーフィング施工', days: 1, status: 'todo', vendor: '', note: '', helpers: [], workerCount: 1 },
    { phase: '下地', name: '瓦桟施工', days: 1, status: 'todo', vendor: '', note: '', helpers: [], workerCount: 1, _parallel: true },
    { phase: '瓦葺', name: '瓦葺き', days: 3, status: 'todo', vendor: '', note: '', helpers: [], workerCount: 1 },
    { phase: '瓦葺', name: '棟施工', days: 1, status: 'todo', vendor: '', note: '', helpers: [], workerCount: 1 },
    { phase: '仕上', name: '雨押さえ板金施工', days: 1, status: 'todo', vendor: '', note: '', helpers: [], workerCount: 1 },
    { phase: '仕上', name: '清掃・点検', days: 1, status: 'todo', vendor: '', note: '', helpers: [], workerCount: 1 },
    { phase: '完了', name: '仮設足場解体', days: 1, status: 'todo', vendor: '', note: '', helpers: [], workerCount: 1 },
    { phase: '完了', name: '最終確認・引き渡し', days: 1, status: 'todo', vendor: '', note: '', helpers: [], workerCount: 1 },
  ];
  let prevStart = startDate;
  let prevEnd = startDate;
  return templates.map((t, i) => {
    const { _parallel, ...rest } = t;
    let taskStart: string;
    if (i === 0) {
      taskStart = startDate;
    } else if (_parallel) {
      taskStart = prevStart;
    } else {
      taskStart = nextWorkDay(prevEnd, false);
    }
    const taskEnd = calcEnd(taskStart, t.days, false);
    prevStart = taskStart;
    prevEnd = taskEnd;
    return newTask({ ...rest, id: String(i + 1), startDate: taskStart, endDate: taskEnd });
  });
}

// ─── PDF helpers ──────────────────────────────────────────────────

/** A4横1ページあたりの最大行数（フェーズヘッダ含む）。ScheduleA4.tsx の描画と必ず一致させること */
export const SCHEDULE_A4_ROWS_FIRST = 22;
export const SCHEDULE_A4_ROWS_OTHERS = 26;

/**
 * ScheduleA4.tsx と同じアルゴリズムでページ数を計算する。
 * フェーズ行＋タスク行を順に積み、フェーズの先頭行でのみ改ページする。
 */
export function scheduleA4PageCount(project: Project): number {
  const tasks = project.schedule?.tasks ?? [];
  if (tasks.length === 0) return 0;

  const phases = [...new Set(tasks.map(t => t.phase))];
  const rows: boolean[] = []; // true = フェーズ見出し行
  for (const phase of phases) {
    rows.push(true);
    tasks.forEach(t => { if (t.phase === phase) rows.push(false); });
  }

  let pages = 0;
  let cur = 0;
  for (const isPhaseRow of rows) {
    const limit = pages === 0 ? SCHEDULE_A4_ROWS_FIRST : SCHEDULE_A4_ROWS_OTHERS;
    if (cur >= limit && isPhaseRow) {
      pages++;
      cur = 0;
    }
    cur++;
  }
  if (cur > 0) pages++;

  return Math.max(1, pages);
}
