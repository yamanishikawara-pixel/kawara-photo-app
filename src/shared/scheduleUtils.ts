// src/shared/scheduleUtils.ts

import type { Project } from '../types';

export type ScheduleStatus = 'todo' | 'in_progress' | 'done' | 'skip';

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
  link: 'sequential' | 'parallel';
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

/** 全タスクの開始・終了日を link 関係に基づいて再計算する */
export function cascade(tasks: ScheduleTask[], skipSun = false): ScheduleTask[] {
  if (tasks.length === 0) return [];
  const result: ScheduleTask[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = { ...tasks[i] };
    if (i === 0) {
      task.endDate = calcEnd(task.startDate, task.days, skipSun);
    } else {
      const prev = result[i - 1];
      task.startDate =
        task.link === 'parallel' ? prev.startDate : nextWorkDay(prev.endDate, skipSun);
      task.endDate = calcEnd(task.startDate, task.days, skipSun);
    }
    result.push(task);
  }
  return result;
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
  todo: '#475569',
  in_progress: '#2563eb',
  done: '#16a34a',
  skip: '#94a3b8',
};

export const STATUS_BG: Record<ScheduleStatus, string> = {
  todo: '#1e293b',
  in_progress: '#1e3a5f',
  done: '#14532d',
  skip: '#1e293b',
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
    link: 'sequential',
    ...overrides,
  };
}

export function makeTemplate(startDate: string): ScheduleTask[] {
  const templates: Omit<ScheduleTask, 'id' | 'startDate' | 'endDate'>[] = [
    { phase: '準備', name: '近隣挨拶・安全設置', days: 1, status: 'todo', vendor: '', note: '', link: 'sequential' },
    { phase: '準備', name: '仮設足場組立', days: 1, status: 'todo', vendor: '', note: '', link: 'sequential' },
    { phase: '撤去', name: '既存瓦撤去', days: 2, status: 'todo', vendor: '', note: '', link: 'sequential' },
    { phase: '撤去', name: '野地板解体', days: 1, status: 'todo', vendor: '', note: '', link: 'sequential' },
    { phase: '下地', name: '新野地板施工', days: 1, status: 'todo', vendor: '', note: '', link: 'sequential' },
    { phase: '下地', name: '防水ルーフィング施工', days: 1, status: 'todo', vendor: '', note: '', link: 'sequential' },
    { phase: '下地', name: '瓦桟施工', days: 1, status: 'todo', vendor: '', note: '', link: 'parallel' },
    { phase: '瓦葺', name: '瓦葺き', days: 3, status: 'todo', vendor: '', note: '', link: 'sequential' },
    { phase: '瓦葺', name: '棟施工', days: 1, status: 'todo', vendor: '', note: '', link: 'sequential' },
    { phase: '仕上', name: '雨押さえ板金施工', days: 1, status: 'todo', vendor: '', note: '', link: 'sequential' },
    { phase: '仕上', name: '清掃・点検', days: 1, status: 'todo', vendor: '', note: '', link: 'sequential' },
    { phase: '完了', name: '仮設足場解体', days: 1, status: 'todo', vendor: '', note: '', link: 'sequential' },
    { phase: '完了', name: '最終確認・引き渡し', days: 1, status: 'todo', vendor: '', note: '', link: 'sequential' },
  ];
  const seed = templates.map((t, i) => ({
    ...newTask({ ...t, id: String(i + 1), startDate, endDate: startDate }),
  }));
  return cascade(seed, false);
}

// ─── PDF helpers ──────────────────────────────────────────────────

/** A4 1ページあたりの最大タスク行数（フェーズヘッダ含む） */
const ROWS_PER_A4 = 28;

export function scheduleA4PageCount(project: Project): number {
  const tasks = project.schedule?.tasks ?? [];
  if (tasks.length === 0) return 0;
  // タスク行 + フェーズヘッダ行（フェーズが変わるたびに1行）
  const phases = [...new Set(tasks.map(t => t.phase))];
  const totalRows = tasks.length + phases.length + 1; // +1 for table header
  return Math.max(1, Math.ceil(totalRows / ROWS_PER_A4));
}
