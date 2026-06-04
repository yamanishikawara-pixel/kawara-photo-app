import type { Project } from '../types';
import {
  type ScheduleTask,
  STATUS_LABELS, STATUS_COLORS, VENDOR_PALETTE, vendorColor,
  toDateStr, parseDate, addDaysToStr, dateDiff,
  scheduleA4PageCount,
} from '../shared/scheduleUtils';

export { scheduleA4PageCount };

const JP = "'Noto Sans JP','BIZ UDPGothic','Hiragino Kaku Gothic ProN',Meiryo,sans-serif";

function fmtShort(s: string) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtFull(s: string) {
  const d = parseDate(s);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

interface ScheduleA4Props {
  project: Project;
  companyName?: string;
  companyPhone?: string;
  colorBy?: 'status' | 'vendor';
  startPage?: number;
  totalPages?: number;
}

// ─── one A4 page ────────────────────────────────────────────────

interface A4PageProps {
  project: Project;
  rows: Array<{ type: 'phase'; phase: string } | { type: 'task'; task: ScheduleTask; idx: number }>;
  ganttStart: string;
  totalGanttDays: number;
  companyName?: string;
  companyPhone?: string;
  colorBy: 'status' | 'vendor';
  allVendors: string[];
  pageNum: number;
  totalPages: number;
}

function A4Page({ project, rows, ganttStart, totalGanttDays, companyName, colorBy, allVendors, pageNum, totalPages }: A4PageProps) {
  // Mini-gantt bar width in mm per day (scale to 60mm total width)
  const barAreaMm = 60;
  const dayMm = totalGanttDays > 0 ? barAreaMm / totalGanttDays : barAreaMm;

  const TD: React.CSSProperties = {
    border: '0.5pt solid #aaa',
    padding: '2px 4px',
    fontSize: '8pt',
    fontFamily: JP,
    verticalAlign: 'middle',
  };

  return (
    <div className="pdf-page-wrapper" style={{ width: '210mm', height: '297mm', position: 'relative', background: '#fff', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div className="pdf-page" style={{ width: '210mm', height: '297mm', padding: '8mm 10mm', boxSizing: 'border-box', fontFamily: JP, background: '#fff', color: '#111', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1.5pt solid #333', paddingBottom: '3mm', marginBottom: '4mm', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '14pt', fontWeight: 800, letterSpacing: '0.05em' }}>工程表</div>
            <div style={{ fontSize: '9pt', marginTop: '1mm', color: '#333' }}>{project.projectName}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '8pt', color: '#555', lineHeight: 1.5 }}>
            {companyName && <div>{companyName}</div>}
            {project.projectLocation && <div>{project.projectLocation}</div>}
          </div>
        </div>

        {/* Gantt date header */}
        {totalGanttDays > 0 && (
          <div style={{ display: 'flex', marginBottom: '1mm', flexShrink: 0 }}>
            <div style={{ width: '72mm', flexShrink: 0 }} />
            <div style={{ width: `${barAreaMm}mm`, position: 'relative', height: '6mm', overflow: 'hidden' }}>
              {(() => {
                const steps: string[] = [];
                for (let i = 0; i < totalGanttDays; i += Math.ceil(totalGanttDays / 10)) {
                  steps.push(addDaysToStr(ganttStart, i));
                }
                return steps.map(d => (
                  <div key={d} style={{
                    position: 'absolute',
                    left: `${dateDiff(ganttStart, d) * dayMm}mm`,
                    fontSize: '6pt', color: '#666',
                  }}>{fmtShort(d)}</div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', flex: 1 }}>
          <colgroup>
            <col style={{ width: '22mm' }} />
            <col style={{ width: '50mm' }} />
            <col style={{ width: '16mm' }} />
            <col style={{ width: '8mm' }} />
            <col style={{ width: '20mm' }} />
            <col style={{ width: `${barAreaMm}mm` }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#e5e7eb' }}>
              <th style={{ ...TD, fontWeight: 700, fontSize: '7pt' }}>段階</th>
              <th style={{ ...TD, fontWeight: 700, fontSize: '7pt' }}>工程名</th>
              <th style={{ ...TD, fontWeight: 700, fontSize: '7pt' }}>期間</th>
              <th style={{ ...TD, fontWeight: 700, fontSize: '7pt', textAlign: 'center' }}>日</th>
              <th style={{ ...TD, fontWeight: 700, fontSize: '7pt' }}>状態</th>
              <th style={{ ...TD, fontWeight: 700, fontSize: '7pt' }}>ガント</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              if (row.type === 'phase') {
                return (
                  <tr key={`ph-${ri}`} style={{ background: '#dbeafe' }}>
                    <td colSpan={6} style={{ ...TD, fontWeight: 700, fontSize: '9pt', padding: '3px 6px', color: '#1e3a8a', letterSpacing: '0.05em' }}>
                      ▶ {row.phase}
                    </td>
                  </tr>
                );
              }
              const { task: t } = row;
              const barLeft = dateDiff(ganttStart, t.startDate);
              const barWidth = Math.max(0.5, dateDiff(t.startDate, t.endDate) + 1);
              const barColor = colorBy === 'vendor'
                ? vendorColor(t.vendor, allVendors)
                : STATUS_COLORS[t.status];
              const isDone = t.status === 'done';
              const isSkip = t.status === 'skip';

              return (
                <tr key={t.id} style={{ background: isDone ? '#f0fdf4' : isSkip ? '#f8fafc' : '#fff' }}>
                  <td style={{ ...TD, color: '#555', fontSize: '7pt' }}>{t.phase}</td>
                  <td style={{ ...TD, fontWeight: isDone ? 400 : 600, textDecoration: isSkip ? 'line-through' : 'none', color: isSkip ? '#9ca3af' : '#111' }}>
                    {t.name}
                  </td>
                  <td style={{ ...TD, fontSize: '7pt', color: '#444' }}>
                    {fmtShort(t.startDate)}〜{fmtShort(t.endDate)}
                  </td>
                  <td style={{ ...TD, textAlign: 'center', fontSize: '7pt', color: '#444' }}>{t.days}</td>
                  <td style={{ ...TD, fontSize: '7pt' }}>
                    <span style={{ padding: '1px 4px', borderRadius: 3, background: barColor + '22', color: barColor, fontWeight: 700 }}>
                      {STATUS_LABELS[t.status]}
                    </span>
                  </td>
                  {/* Gantt bar cell */}
                  <td style={{ ...TD, padding: 0, position: 'relative' }}>
                    <div style={{ position: 'relative', height: '100%', minHeight: '5mm' }}>
                      <div style={{
                        position: 'absolute',
                        left: `${Math.max(0, barLeft * dayMm)}mm`,
                        width: `${Math.min(barAreaMm - barLeft * dayMm, barWidth * dayMm)}mm`,
                        top: '1mm', bottom: '1mm',
                        background: barColor,
                        opacity: isSkip ? 0.2 : 0.75,
                        borderRadius: '1mm',
                      }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '0.5pt solid #ccc', paddingTop: '2mm', marginTop: 'auto', fontSize: '7pt', color: '#777', flexShrink: 0 }}>
          <span>{project.projectName} — 工程表</span>
          <span>- {pageNum} / {totalPages} -</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────

export default function ScheduleA4({ project, companyName, companyPhone, colorBy = 'status', startPage = 1, totalPages = 1 }: ScheduleA4Props) {
  const tasks = project.schedule?.tasks ?? [];
  if (tasks.length === 0) return null;

  const allVendors = [...new Set(tasks.map(t => t.vendor).filter(Boolean))];
  const ganttStart = tasks.reduce((m, t) => t.startDate < m ? t.startDate : m, tasks[0].startDate);
  const ganttEnd   = tasks.reduce((m, t) => t.endDate   > m ? t.endDate   : m, tasks[0].endDate);
  const totalGanttDays = Math.max(1, dateDiff(ganttStart, ganttEnd) + 1);

  // Build flat row list: [ phase-header, task, task, phase-header, task, ... ]
  type Row = { type: 'phase'; phase: string } | { type: 'task'; task: ScheduleTask; idx: number };
  const allRows: Row[] = [];
  const phases = [...new Set(tasks.map(t => t.phase))];
  for (const phase of phases) {
    allRows.push({ type: 'phase', phase });
    tasks.forEach((t, i) => { if (t.phase === phase) allRows.push({ type: 'task', task: t, idx: i }); });
  }

  // Split into pages (break only on phase headers)
  const MAX_ROWS = 25;
  const pages: Row[][] = [];
  let cur: Row[] = [];

  for (const row of allRows) {
    if (cur.length >= MAX_ROWS && row.type === 'phase') {
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
          ganttStart={ganttStart}
          totalGanttDays={totalGanttDays}
          companyName={companyName}
          companyPhone={companyPhone}
          colorBy={colorBy}
          allVendors={allVendors}
          pageNum={startPage + pi}
          totalPages={totalPages}
        />
      ))}
    </>
  );
}
