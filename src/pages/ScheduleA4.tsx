/**
 * ScheduleA4 — A4横向きガントチャート PDF コンポーネント
 *
 * レイアウト（297mm × 210mm landscape）:
 *   ┌ ヘッダー（タイトル・現場名・会社名） ─────────────────────────┐
 *   ├ 月行（月またぎスパン） ────────────────────────────────────────┤
 *   ├ 日行（日付 + 曜日） ───────────────────────────────────────────┤
 *   ├ [段階ヘッダー行]  ─── ██████████████████████████████ ───────  │
 *   ├  工程名          ─── ████  ██████                    ───────  │
 *   └ フッター（ページ番号） ───────────────────────────────────────┘
 */
import type { Project } from '../types';
import {
  type ScheduleTask,
  STATUS_LABELS, STATUS_COLORS, VENDOR_PALETTE, vendorColor,
  parseDate, addDaysToStr, dateDiff, helperTotal,
  scheduleA4PageCount,
} from '../shared/scheduleUtils';

export { scheduleA4PageCount };

// ─── 定数（全て mm 単位）────────────────────────────────────────────
const PW = 297;   // A4 landscape width
const PH = 210;   // A4 landscape height
const ML = 8;     // left margin
const MR = 8;     // right margin
const MT = 7;     // top margin
const MB = 7;     // bottom margin

const LABEL_W = 66;                          // 工程名カラム幅
const CAL_W   = PW - ML - MR - LABEL_W;     // カレンダー幅 ≒ 215mm
const TITLE_H = 10;                          // タイトル行高
const MON_H   = 5;                           // 月ヘッダー行高
const DAY_H   = 7;                           // 日付行高
const PHASE_H = 6;                           // フェーズヘッダー行高
const TASK_H  = 7;                           // タスク行高
const FOOT_H  = 6;                           // フッター行高
const CONTENT_H = PH - MT - MB - TITLE_H - MON_H - DAY_H - FOOT_H; // 使用可能な行エリア高

const JP = "'Noto Sans JP','BIZ UDPGothic','Hiragino Kaku Gothic ProN',Meiryo,sans-serif";

// ─── 日付ユーティリティ ──────────────────────────────────────────────

function allDaysInRange(start: string, end: string): string[] {
  const days: string[] = [];
  for (let i = 0; i <= dateDiff(start, end); i++) days.push(addDaysToStr(start, i));
  return days;
}

function dayW(total: number): number {
  // 総日数に応じて1日あたりの幅(mm)を決める
  return Math.max(1.5, CAL_W / total);
}

function dayX(d: string, start: string, total: number): number {
  return LABEL_W + (dateDiff(start, d) / total) * CAL_W;
}

function barX(start: string, rangeStart: string, total: number): number {
  return LABEL_W + Math.max(0, dateDiff(rangeStart, start)) / total * CAL_W;
}

function barW(start: string, end: string, rangeStart: string, rangeEnd: string, total: number): number {
  const s = dateDiff(rangeStart, start);
  const e = dateDiff(rangeStart, end);
  const clampS = Math.max(0, s);
  const clampE = Math.min(total - 1, e);
  return Math.max(1, (clampE - clampS + 1) / total * CAL_W);
}

// ─── 月グループ計算 ──────────────────────────────────────────────────

interface MonthSpan { label: string; startDay: string; days: number }

function calcMonthSpans(start: string, end: string): MonthSpan[] {
  const spans: MonthSpan[] = [];
  let cur = parseDate(start);
  const endD = parseDate(end);
  while (cur <= endD) {
    const y = cur.getFullYear(), m = cur.getMonth();
    const monthStart = cur;
    const nextM = new Date(y, m + 1, 1);
    const monthEnd = nextM > endD ? endD : new Date(nextM.getTime() - 86400000);
    const days = dateDiff(
      `${y}-${String(m+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`,
      `${monthEnd.getFullYear()}-${String(monthEnd.getMonth()+1).padStart(2,'0')}-${String(monthEnd.getDate()).padStart(2,'0')}`,
    ) + 1;
    spans.push({
      label: `${y}年${m+1}月`,
      startDay: `${y}-${String(m+1).padStart(2,'0')}-${String(monthStart.getDate()).padStart(2,'0')}`,
      days,
    });
    cur = nextM;
  }
  return spans;
}

// ─── 単色 pill ───────────────────────────────────────────────────────

function StatusPill({ status }: { status: ScheduleTask['status'] }) {
  return (
    <span style={{
      fontSize: '5pt', fontWeight: 700, padding: '0.5px 3px', borderRadius: 2,
      background: STATUS_COLORS[status] + '33', color: STATUS_COLORS[status],
      fontFamily: JP,
    }}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── A4 1ページ ─────────────────────────────────────────────────────

type GanttRow =
  | { type: 'phase'; phase: string }
  | { type: 'task'; task: ScheduleTask };

interface A4PageProps {
  project: Project;
  rows: GanttRow[];
  rangeStart: string;
  rangeEnd: string;
  totalDays: number;
  companyName?: string;
  colorBy: 'status' | 'vendor' | 'helper';
  allVendors: string[];
  pageNum: number;
  totalPages: number;
}

function A4Page({
  project, rows, rangeStart, rangeEnd, totalDays,
  companyName, colorBy, allVendors, pageNum, totalPages,
}: A4PageProps) {
  const allDays = allDaysInRange(rangeStart, rangeEnd);
  const dw = dayW(totalDays);
  const monthSpans = calcMonthSpans(rangeStart, rangeEnd);
  const todayStr = new Date().toISOString().slice(0, 10);

  function barColor(t: ScheduleTask): string {
    if (colorBy === 'vendor') return vendorColor(t.vendor, allVendors);
    if (colorBy === 'helper') {
      const n = helperTotal(t.helpers ?? []);
      if (n === 0) return '#94a3b8';
      if (n === 1) return '#0ea5e9';
      if (n <= 3) return '#f59e0b';
      return '#ef4444';
    }
    return STATUS_COLORS[t.status];
  }

  // mm → px変換（印刷では1mm = 3.7795px だが、ブラウザ印刷で mm単位使用）
  const px = (mm: number) => `${mm}mm`;

  return (
    <div
      className="pdf-page-wrapper"
      style={{
        width: px(PW), height: px(PH),
        position: 'relative',
        background: '#fff',
        overflow: 'hidden',
        boxSizing: 'border-box',
        fontFamily: JP,
        color: '#111',
      }}
    >
      {/* ─ タイトル行 ─ */}
      <div style={{
        position: 'absolute', top: px(MT), left: px(ML),
        width: px(PW - ML - MR), height: px(TITLE_H),
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1.5pt solid #1e3a8a', paddingBottom: '1mm',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4mm' }}>
          <span style={{ fontSize: '13pt', fontWeight: 900, letterSpacing: '0.08em', color: '#1e3a8a' }}>工程表</span>
          <span style={{ fontSize: '9pt', fontWeight: 700, color: '#333' }}>{project.projectName}</span>
          {project.projectLocation && (
            <span style={{ fontSize: '7pt', color: '#666' }}>📍 {project.projectLocation}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4mm' }}>
          {companyName && <span style={{ fontSize: '7pt', color: '#555' }}>{companyName}</span>}
          <span style={{ fontSize: '7pt', color: '#777' }}>{pageNum} / {totalPages}</span>
        </div>
      </div>

      {/* ─ 月ヘッダー ─ */}
      {monthSpans.map((ms, i) => {
        const x = barX(ms.startDay, rangeStart, totalDays);
        const w = (ms.days / totalDays) * CAL_W;
        return (
          <div key={i} style={{
            position: 'absolute',
            top: px(MT + TITLE_H),
            left: px(ML + x),
            width: px(w - 0.5),
            height: px(MON_H),
            background: '#1e3a8a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxSizing: 'border-box',
            borderRight: '0.3pt solid #fff',
          }}>
            <span style={{ fontSize: '6pt', fontWeight: 700, color: '#fff', fontFamily: JP }}>{ms.label}</span>
          </div>
        );
      })}

      {/* ─ 日付ヘッダー ─ */}
      {/* 工程名ラベル列ヘッダー */}
      <div style={{
        position: 'absolute', top: px(MT + TITLE_H + MON_H),
        left: px(ML), width: px(LABEL_W), height: px(DAY_H),
        background: '#e2e8f0',
        display: 'flex', alignItems: 'center', paddingLeft: '3mm',
        borderBottom: '0.5pt solid #aaa', borderRight: '0.5pt solid #aaa',
        boxSizing: 'border-box',
      }}>
        <span style={{ fontSize: '6pt', fontWeight: 700, color: '#475569', fontFamily: JP }}>工程名</span>
      </div>

      {/* 各日セル */}
      {allDays.map(d => {
        const dt = parseDate(d);
        const dow = dt.getDay(); // 0=Sun,6=Sat
        const isSun = dow === 0;
        const isSat = dow === 6;
        const isToday = d === todayStr;
        const x = ML + (dateDiff(rangeStart, d) / totalDays) * CAL_W;
        const bg = isToday ? '#fef3c7' : isSun ? '#fee2e2' : isSat ? '#eff6ff' : '#e2e8f0';
        const fg = isToday ? '#92400e' : isSun ? '#991b1b' : isSat ? '#1e40af' : '#475569';
        const dayNum = dt.getDate();
        return (
          <div key={d} style={{
            position: 'absolute',
            top: px(MT + TITLE_H + MON_H),
            left: px(x),
            width: px(dw - 0.3),
            height: px(DAY_H),
            background: bg,
            borderBottom: isToday ? '1.5pt solid #f59e0b' : '0.5pt solid #aaa',
            borderRight: '0.3pt solid #ccc',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            boxSizing: 'border-box', overflow: 'hidden',
          }}>
            {dw >= 3 && (
              <span style={{ fontSize: `${Math.min(6, dw * 0.85)}pt`, fontWeight: isToday ? 900 : isSun || isSat ? 700 : 400, color: fg, lineHeight: 1.1, fontFamily: JP }}>
                {dayNum}
              </span>
            )}
            {dw >= 5 && (
              <span style={{ fontSize: `${Math.min(4.5, dw * 0.6)}pt`, color: fg, lineHeight: 1, fontFamily: JP }}>
                {['日', '月', '火', '水', '木', '金', '土'][dow]}
              </span>
            )}
          </div>
        );
      })}

      {/* ─ タスク行 ─ */}
      {rows.map((row, ri) => {
        const rowTop = MT + TITLE_H + MON_H + DAY_H + ri * TASK_H;

        if (row.type === 'phase') {
          return (
            <div key={`ph-${ri}`}>
              {/* フェーズ名ラベル */}
              <div style={{
                position: 'absolute', top: px(rowTop),
                left: px(ML), width: px(LABEL_W), height: px(PHASE_H),
                background: '#1e40af', display: 'flex', alignItems: 'center', paddingLeft: '3mm',
                borderBottom: '0.5pt solid #1e3a8a',
                boxSizing: 'border-box',
              }}>
                <span style={{ fontSize: '7pt', fontWeight: 700, color: '#fff', fontFamily: JP }}>▶ {row.phase}</span>
              </div>
              {/* フェーズ行のカレンダー背景 */}
              <div style={{
                position: 'absolute', top: px(rowTop),
                left: px(ML + LABEL_W), width: px(CAL_W), height: px(PHASE_H),
                background: '#dbeafe',
                borderBottom: '0.5pt solid #93c5fd',
                boxSizing: 'border-box',
              }} />
              {/* 縦グリッド線（フェーズ行） */}
              {allDays.map(d => {
                const dt = parseDate(d);
                const isMon = dt.getDay() === 1;
                const x = ML + LABEL_W + (dateDiff(rangeStart, d) / totalDays) * CAL_W;
                return isMon ? (
                  <div key={d} style={{
                    position: 'absolute', top: px(rowTop),
                    left: px(x), width: '0.3pt', height: px(PHASE_H),
                    background: '#93c5fd',
                  }} />
                ) : null;
              })}
            </div>
          );
        }

        // task row
        const { task: t } = row;
        const isSkip = t.status === 'skip';
        const isDone = t.status === 'done';
        const color = barColor(t);
        const bx = ML + LABEL_W + Math.max(0, dateDiff(rangeStart, t.startDate)) / totalDays * CAL_W;
        const bEnd = Math.min(totalDays - 1, dateDiff(rangeStart, t.endDate));
        const bStart = Math.max(0, dateDiff(rangeStart, t.startDate));
        const bw = Math.max(1.5, (bEnd - bStart + 1) / totalDays * CAL_W);
        const hTotal = helperTotal(t.helpers ?? []);

        return (
          <div key={`t-${ri}`}>
            {/* 工程名ラベル */}
            <div style={{
              position: 'absolute', top: px(rowTop),
              left: px(ML), width: px(LABEL_W), height: px(TASK_H),
              display: 'flex', alignItems: 'center',
              paddingLeft: '3mm', paddingRight: '1mm',
              borderBottom: '0.3pt solid #e2e8f0',
              background: isDone ? '#f0fdf4' : isSkip ? '#f8fafc' : '#fff',
              boxSizing: 'border-box', overflow: 'hidden', gap: '1mm',
            }}>
              <span style={{ fontSize: '6pt', fontWeight: isDone ? 400 : 600, color: isSkip ? '#9ca3af' : '#111', textDecoration: isSkip ? 'line-through' : 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: JP }}>
                {t.name}
              </span>
              <StatusPill status={t.status} />
            </div>

            {/* カレンダー行の背景 + グリッド */}
            <div style={{
              position: 'absolute', top: px(rowTop),
              left: px(ML + LABEL_W), width: px(CAL_W), height: px(TASK_H),
              background: isDone ? '#f0fdf4' : ri % 2 === 0 ? '#fafafa' : '#fff',
              borderBottom: '0.3pt solid #e2e8f0',
              boxSizing: 'border-box',
            }} />
            {allDays.map(d => {
              const dt = parseDate(d);
              const isSun = dt.getDay() === 0;
              const isSat = dt.getDay() === 6;
              const x = ML + LABEL_W + (dateDiff(rangeStart, d) / totalDays) * CAL_W;
              if (!isSun && !isSat) return null;
              return (
                <div key={d} style={{
                  position: 'absolute', top: px(rowTop),
                  left: px(x), width: px(dw - 0.3), height: px(TASK_H),
                  background: isSun ? 'rgba(254,202,202,0.3)' : 'rgba(219,234,254,0.3)',
                }} />
              );
            })}

            {/* Today line */}
            {(() => {
              const tOff = dateDiff(rangeStart, todayStr);
              if (tOff < 0 || tOff >= totalDays) return null;
              const tx = ML + LABEL_W + (tOff + 0.5) / totalDays * CAL_W;
              return <div style={{ position: 'absolute', top: px(rowTop), left: px(tx), width: '0.5pt', height: px(TASK_H), background: '#f59e0b', opacity: 0.8 }} />;
            })()}

            {/* ガントバー */}
            {!isSkip && (
              <div style={{
                position: 'absolute',
                top: px(rowTop + 1.2),
                left: px(bx),
                width: px(bw),
                height: px(TASK_H - 2.4),
                background: color,
                opacity: isDone ? 0.55 : 0.85,
                borderRadius: '1pt',
                boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', overflow: 'hidden',
                paddingLeft: '1mm', gap: '1mm',
              }}>
                {bw > 6 && t.vendor && (
                  <span style={{ fontSize: '4.5pt', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: JP }}>
                    {t.vendor}
                  </span>
                )}
                {bw > 4 && hTotal > 0 && (
                  <span style={{ fontSize: '4.5pt', color: '#fff', fontWeight: 700, background: 'rgba(0,0,0,0.25)', borderRadius: 2, padding: '0 2px', whiteSpace: 'nowrap', fontFamily: JP }}>
                    +{hTotal}
                  </span>
                )}
              </div>
            )}

            {/* 日数テキスト（バー右外） */}
            {!isSkip && bw > 0 && (
              <div style={{
                position: 'absolute',
                top: px(rowTop + TASK_H * 0.2),
                left: px(bx + bw + 0.5),
                height: px(TASK_H * 0.6),
                display: 'flex', alignItems: 'center',
              }}>
                <span style={{ fontSize: '4.5pt', color: '#94a3b8', fontFamily: JP }}>{t.days}日</span>
              </div>
            )}
          </div>
        );
      })}

      {/* ─ フッター ─ */}
      <div style={{
        position: 'absolute',
        top: px(PH - MB - FOOT_H),
        left: px(ML), width: px(PW - ML - MR), height: px(FOOT_H),
        borderTop: '0.5pt solid #cbd5e1',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: '1mm',
        boxSizing: 'border-box',
      }}>
        <span style={{ fontSize: '5.5pt', color: '#94a3b8', fontFamily: JP }}>{project.projectName} — 工程表</span>
        <div style={{ display: 'flex', gap: '4mm', alignItems: 'center' }}>
          {/* 凡例 */}
          {(['todo', 'in_progress', 'done'] as const).map(s => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: '1mm', fontSize: '5pt', color: '#555', fontFamily: JP }}>
              <span style={{ display: 'inline-block', width: '3mm', height: '2mm', background: STATUS_COLORS[s], borderRadius: '0.5mm' }} />
              {STATUS_LABELS[s]}
            </span>
          ))}
          <span style={{ fontSize: '5.5pt', color: '#94a3b8', fontFamily: JP }}>- {pageNum} / {totalPages} -</span>
        </div>
      </div>

      {/* ─ 左カラム縦罫線 ─ */}
      <div style={{
        position: 'absolute',
        top: px(MT + TITLE_H + MON_H),
        left: px(ML + LABEL_W),
        width: '0.5pt',
        height: px(DAY_H + rows.length * TASK_H + 1),
        background: '#aaa',
      }} />
    </div>
  );
}

// ─── メインエクスポート ───────────────────────────────────────────────

interface ScheduleA4Props {
  project: Project;
  companyName?: string;
  companyPhone?: string;
  colorBy?: 'status' | 'vendor' | 'helper';
  startPage?: number;
  totalPages?: number;
}

export default function ScheduleA4({
  project,
  companyName,
  colorBy = 'status',
  startPage = 1,
  totalPages = 1,
}: ScheduleA4Props) {
  const tasks = project.schedule?.tasks ?? [];
  if (tasks.length === 0) return null;

  const allVendors = [...new Set(tasks.map(t => t.vendor).filter(Boolean))];
  const rangeStart = tasks.reduce((m, t) => t.startDate < m ? t.startDate : m, tasks[0].startDate);
  const rangeEnd   = tasks.reduce((m, t) => t.endDate   > m ? t.endDate   : m, tasks[0].endDate);
  const totalDays  = Math.max(1, dateDiff(rangeStart, rangeEnd) + 1);

  // フェーズ + タスクの行リスト
  type GanttRow = { type: 'phase'; phase: string } | { type: 'task'; task: ScheduleTask };
  const allRows: GanttRow[] = [];
  const phases = [...new Set(tasks.map(t => t.phase))];
  for (const phase of phases) {
    allRows.push({ type: 'phase', phase });
    tasks.forEach(t => { if (t.phase === phase) allRows.push({ type: 'task', task: t }); });
  }

  // 1ページに入る最大行数
  const rowsPerPage = Math.floor(CONTENT_H / TASK_H) - 1; // -1 for safety

  // ページ分割：フェーズの途中では切らない
  const pages: GanttRow[][] = [];
  let cur: GanttRow[] = [];
  for (const row of allRows) {
    if (cur.length >= rowsPerPage && row.type === 'phase') {
      pages.push(cur);
      cur = [];
    }
    cur.push(row);
  }
  if (cur.length > 0) pages.push(cur);

  return (
    <>
      {pages.map((rows, pi) => (
        <A4Page
          key={pi}
          project={project}
          rows={rows}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          totalDays={totalDays}
          companyName={companyName}
          colorBy={colorBy}
          allVendors={allVendors}
          pageNum={startPage + pi}
          totalPages={totalPages}
        />
      ))}
    </>
  );
}
