/**
 * ScheduleA4 — 標準的な日本式工程表 (A4横向き・テーブルレイアウト)
 *
 * 構造:
 *   ヘッダー（工事名・会社名・期間）
 *   ┌────────┬─── 6月 ──────┬─── 7月 ──────┐
 *   │ 工程名 │ 1│ 2│ 3│ 4│ 5│ 6│ 7│ 8│...│
 *   │        │月│火│水│木│金│土│日│月│...│
 *   ├────────┤                              │
 *   │▶ 準備  │ (フェーズ帯)                  │
 *   │近隣挨拶│█│ │ │ │ │ │ │ │...│
 *   │足場組立│ │█│█│ │ │ │ │ │...│
 *   ├────────┤                              │
 *   │▶ 撤去  │                              │
 *   │既存瓦撤│ │ │ │█│█│█│█│ │...│
 *   └────────┴──────────────────────────────┘
 */
import type { Project } from '../types';
import {
  type ScheduleTask,
  STATUS_LABELS, STATUS_COLORS, VENDOR_PALETTE, vendorColor,
  parseDate, addDaysToStr, dateDiff, helperTotal,
  scheduleA4PageCount,
  SCHEDULE_A4_ROWS_FIRST, SCHEDULE_A4_ROWS_OTHERS,
} from '../shared/scheduleUtils';

export { scheduleA4PageCount };

const JP = "'Noto Sans JP','BIZ UDPGothic','Hiragino Kaku Gothic ProN',Meiryo,sans-serif";
const DOW = ['日','月','火','水','木','金','土'];

// ─── ユーティリティ ────────────────────────────────────────────────────

function fmtHeader(s: string) {
  const d = parseDate(s);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}

function allDays(start: string, end: string): string[] {
  const out: string[] = [];
  for (let i = 0; i <= dateDiff(start, end); i++) out.push(addDaysToStr(start, i));
  return out;
}

interface MonthSpan { label: string; count: number }
function monthSpans(days: string[]): MonthSpan[] {
  const spans: MonthSpan[] = [];
  for (const d of days) {
    const dt = parseDate(d);
    const lbl = `${dt.getMonth()+1}月`;
    if (spans.length > 0 && spans[spans.length-1].label === lbl) {
      spans[spans.length-1].count++;
    } else {
      spans.push({ label: lbl, count: 1 });
    }
  }
  return spans;
}

// ─── セル CSS ─────────────────────────────────────────────────────────

/** セルの基本スタイル */
function cellBase(extra?: React.CSSProperties): React.CSSProperties {
  return {
    border: '0.4pt solid #b0b0b0',
    padding: 0,
    boxSizing: 'border-box',
    ...extra,
  };
}

function dayBg(d: string, today: string): string {
  const dow = parseDate(d).getDay();
  if (d === today) return '#fef9c3';
  if (dow === 0) return '#fee2e2';
  if (dow === 6) return '#eff6ff';
  return '#fff';
}

// ─── 1ページ ─────────────────────────────────────────────────────────

interface PageProps {
  project: Project;
  rows: Array<{ type: 'phase'; phase: string } | { type: 'task'; task: ScheduleTask }>;
  days: string[];
  companyName: string;
  colorBy: 'status' | 'vendor' | 'helper';
  mode: 'internal' | 'customer';
  allVendors: string[];
  pageNum: number;
  totalPages: number;
  isFirstPage: boolean;
}

function GanttPage({
  project, rows, days, companyName, colorBy, mode, allVendors,
  pageNum, totalPages, isFirstPage,
}: PageProps) {
  const isInternal = mode === 'internal';
  const today = new Date().toISOString().slice(0, 10);
  const spans = monthSpans(days);
  const N = days.length;

  // 1日あたりの幅: A4横(277mm有効幅) - 工程名列(65mm) = 212mm ÷ N日
  // 最小2mm, 最大15mm
  const cellWmm = Math.min(15, Math.max(2, 212 / N));
  const cellW = `${cellWmm.toFixed(1)}mm`;
  const labelW = '65mm';

  // PDF は全バー単一グレー（状態は右側の文字テキストで表現、色の混乱なし）
  function barColor(_t: ScheduleTask): string {
    return '#64748b';
  }

  const tdName: React.CSSProperties = {
    ...cellBase(),
    width: labelW, minWidth: labelW, maxWidth: labelW,
    padding: '1pt 3pt',
    textAlign: 'left',
    fontFamily: JP,
    overflow: 'hidden',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  };

  const tdDay: React.CSSProperties = {
    ...cellBase(),
    width: cellW, minWidth: cellW, maxWidth: cellW,
    textAlign: 'center',
    verticalAlign: 'middle',
    fontFamily: JP,
    overflow: 'hidden',
    padding: 0,
  };

  return (
    <div
      className="pdf-page-wrapper"
      style={{
        width: '297mm', height: '210mm',
        background: '#fff',
        overflow: 'hidden',
        boxSizing: 'border-box',
        padding: '7mm 10mm 6mm 10mm',
        fontFamily: JP,
        color: '#111',
        display: 'flex',
        flexDirection: 'column',
        gap: '2mm',
        pageBreakAfter: 'always',
      }}
    >
      {/* ヘッダー */}
      {isFirstPage && (
        <div style={{ flexShrink: 0, borderBottom: '1.5pt solid #1e3a8a', paddingBottom: '2mm', marginBottom: '1mm', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1mm' }}>
            <div style={{ fontSize: '14pt', fontWeight: 900, color: '#1e3a8a', letterSpacing: '0.08em' }}>工 程 表</div>
            <div style={{ display: 'flex', gap: '5mm', fontSize: '8pt', color: '#333' }}>
              <span><b>工事名：</b>{project.projectName}</span>
              {project.projectLocation && <span><b>現場：</b>{project.projectLocation}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '7.5pt', color: '#555', lineHeight: 1.6 }}>
            {companyName && <div>{companyName}</div>}
            <div><b>期間：</b>{days.length > 0 ? `${fmtHeader(days[0])} 〜 ${fmtHeader(days[days.length-1])}` : ''}</div>
          </div>
        </div>
      )}

      {/* ガントテーブル */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <table style={{
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          width: '100%',
          fontFamily: JP,
          fontSize: '6.5pt',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        } as React.CSSProperties}>
          <colgroup>
            <col style={{ width: labelW }} />
            {days.map(d => <col key={d} style={{ width: cellW }} />)}
          </colgroup>

          {/* 月ヘッダー */}
          <thead>
            <tr>
              <th style={{ ...tdName, background: '#1e3a8a', color: '#fff', fontWeight: 700, fontSize: '7pt', textAlign: 'center' }}>
                工程名
              </th>
              {spans.map((s, i) => (
                <th
                  key={i}
                  colSpan={s.count}
                  style={{
                    ...cellBase({ background: '#1e3a8a', color: '#fff', textAlign: 'center', fontWeight: 700, padding: '1.5pt 0', fontSize: '7pt', fontFamily: JP }),
                  }}
                >
                  {s.label}
                </th>
              ))}
            </tr>

            {/* 日付 + 曜日ヘッダー */}
            <tr>
              <th style={{ ...tdName, background: '#e2e8f0', fontSize: '6pt', color: '#475569', textAlign: 'center', fontWeight: 600 }}>
                {isInternal ? '担当・応援 / 状態' : '工程名'}
              </th>
              {days.map(d => {
                const dt = parseDate(d);
                const dow = dt.getDay();
                const isSun = dow === 0, isSat = dow === 6;
                const isToday = d === today;
                const bg = isToday ? '#fbbf24' : isSun ? '#fca5a5' : isSat ? '#93c5fd' : '#e2e8f0';
                const fg = isToday ? '#78350f' : isSun ? '#7f1d1d' : isSat ? '#1e3a8a' : '#374151';
                return (
                  <th key={d} style={{ ...tdDay, background: bg, color: fg, fontWeight: isSun || isSat ? 700 : 600, padding: '0.5pt 0', fontSize: `${Math.min(6.5, cellWmm * 0.7)}pt` }}>
                    {cellWmm >= 4 && <div style={{ lineHeight: 1.2 }}>{dt.getDate()}</div>}
                    {cellWmm >= 5 && <div style={{ lineHeight: 1 }}>{DOW[dow]}</div>}
                    {cellWmm < 4 && dt.getDate()}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* タスク行 */}
          <tbody>
            {rows.map((row, ri) => {
              if (row.type === 'phase') {
                return (
                  <tr key={`ph-${ri}`}>
                    <td
                      colSpan={N + 1}
                      style={{
                        ...cellBase({ background: '#1e40af', color: '#fff', padding: '2pt 4pt', fontWeight: 700, fontSize: '7.5pt', fontFamily: JP }),
                        letterSpacing: '0.05em',
                      }}
                    >
                      ▶ {row.phase}
                    </td>
                  </tr>
                );
              }

              const { task: t } = row;
              const isSkip = t.status === 'skip';
              const isDone = t.status === 'done';
              const color = barColor(t);
              const hTotal = helperTotal(t.helpers ?? []);

              return (
                <tr key={t.id}>
                  {/* 工程名セル */}
                  <td style={{
                    ...tdName,
                    background: isDone ? '#f0fdf4' : isSkip ? '#f8fafc' : ri % 2 === 0 ? '#fff' : '#fafafa',
                    height: '6mm',
                    fontSize: '7pt',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                      <span style={{ fontWeight: isSkip ? 400 : 600, textDecoration: isSkip ? 'line-through' : 'none', color: isSkip ? '#9ca3af' : '#111', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.name || '（未入力）'}
                      </span>
                      {isInternal ? (
                        <span style={{ fontSize: '5.5pt', color: '#64748b' }}>
                          {t.vendor}
                          {(t.workerCount ?? 1) > 0 && ` 自社${t.workerCount ?? 1}人`}
                          {hTotal > 0 && ` / ${(t.helpers ?? []).map(h => `${h.name}${h.count}人`).join('・')}`}
                          {` ｜ ${STATUS_LABELS[t.status]}`}
                        </span>
                      ) : null}
                    </div>
                  </td>

                  {/* 日程セル */}
                  {days.map(d => {
                    const inRange = !isSkip && d >= t.startDate && d <= t.endDate;
                    const dt = parseDate(d);
                    const dow = dt.getDay();
                    const isSun = dow === 0, isSat = dow === 6;
                    const isToday = d === today;
                    const rowBg = ri % 2 === 0 ? '#fff' : '#fafafa';
                    const wkBg = isSun ? 'rgba(252,165,165,0.25)' : isSat ? 'rgba(147,197,253,0.25)' : null;

                    let bg: string;
                    if (inRange) {
                      // 完了は薄グレー、通常は標準グレー
                      bg = isDone ? '#cbd5e1' : color;
                    } else if (wkBg) {
                      bg = wkBg;
                    } else {
                      bg = ri % 2 === 0 ? '#fff' : '#fafafa';
                    }

                    return (
                      <td key={d} style={{
                        ...tdDay,
                        background: bg,
                        borderLeft: isToday ? '1.5pt solid #f59e0b' : undefined,
                        borderRight: isToday ? '1.5pt solid #f59e0b' : undefined,
                        height: '6mm',
                        opacity: isSkip ? 0.35 : 1,
                      }} />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* フッター */}
      <div style={{ flexShrink: 0, borderTop: '0.5pt solid #cbd5e1', paddingTop: '1.5mm', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '6pt', color: '#94a3b8', fontFamily: JP }}>
        <span>{project.projectName}</span>
        <div style={{ display: 'flex', gap: '4mm', alignItems: 'center' }}>
          {(['todo','in_progress','done'] as const).map(s => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: '1mm' }}>
              <span style={{ display: 'inline-block', width: '4mm', height: '2mm', background: STATUS_COLORS[s], borderRadius: '0.5mm' }} />
              {STATUS_LABELS[s]}
            </span>
          ))}
          <span style={{ color: '#6b7280' }}>- {pageNum} / {totalPages} -</span>
        </div>
      </div>
    </div>
  );
}

// ─── メインエクスポート ────────────────────────────────────────────────

interface ScheduleA4Props {
  project: Project;
  companyName?: string;
  companyPhone?: string;
  colorBy?: 'status' | 'vendor' | 'helper';
  /** 'internal' = 自社用（応援・担当・状態すべて表示）, 'customer' = お客様用（工程名のみ・清書印刷） */
  mode?: 'internal' | 'customer';
  startPage?: number;
  totalPages?: number;
}

export default function ScheduleA4({
  project,
  companyName = '',
  colorBy = 'status',
  mode = 'internal',
  startPage = 1,
  totalPages = 1,
}: ScheduleA4Props) {
  const tasks = project.schedule?.tasks ?? [];
  if (tasks.length === 0) return null;

  const allVendors = [...new Set(tasks.map(t => t.vendor).filter(Boolean))];
  const rangeStart = tasks.reduce((m, t) => t.startDate < m ? t.startDate : m, tasks[0].startDate);
  const rangeEnd   = tasks.reduce((m, t) => t.endDate   > m ? t.endDate   : m, tasks[0].endDate);
  const days = allDays(rangeStart, rangeEnd);

  // フェーズ + タスク行リストを構築
  type GanttRow = { type: 'phase'; phase: string } | { type: 'task'; task: ScheduleTask };
  const allRows: GanttRow[] = [];
  const phases = [...new Set(tasks.map(t => t.phase))];
  for (const phase of phases) {
    allRows.push({ type: 'phase', phase });
    tasks.forEach(t => { if (t.phase === phase) allRows.push({ type: 'task', task: t }); });
  }

  // 1ページあたり最大行数（A4高さ - ヘッダー - 日付2行 - フッター）÷ 行高
  // 初ページはヘッダー分少ない（実測: A4 landscape 197mm ÷ 6mm/行 ≒ 30行、ヘッダー消費約4行）
  // ※ scheduleA4PageCount() と必ず一致させるため、値は scheduleUtils.ts の共有定数を使う
  const ROWS_FIRST  = SCHEDULE_A4_ROWS_FIRST;
  const ROWS_OTHERS = SCHEDULE_A4_ROWS_OTHERS;

  const pages: GanttRow[][] = [];
  let cur: GanttRow[] = [];

  for (const row of allRows) {
    const limit = pages.length === 0 ? ROWS_FIRST : ROWS_OTHERS;
    // フェーズヘッダーで改ページ
    if (cur.length >= limit && row.type === 'phase') {
      pages.push(cur);
      cur = [];
    }
    cur.push(row);
  }
  if (cur.length > 0) pages.push(cur);

  const total = totalPages; // caller が計算済み

  return (
    <>
      {pages.map((rows, pi) => (
        <GanttPage
          key={pi}
          project={project}
          rows={rows}
          days={days}
          companyName={companyName}
          colorBy={mode === 'customer' ? 'status' : colorBy}
          mode={mode}
          allVendors={allVendors}
          pageNum={startPage + pi}
          totalPages={total}
          isFirstPage={pi === 0}
        />
      ))}
    </>
  );
}
