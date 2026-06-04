import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, ChevronDown, ChevronRight, CalendarRange, Trash2, AlignLeft } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Project } from '../types';
import {
  type ScheduleTask, type ScheduleStatus, type ScheduleData,
  cascade, postpone, toDateStr, parseDate, dateDiff, addDaysToStr,
  STATUS_LABELS, STATUS_COLORS, STATUS_BG, VENDOR_PALETTE, vendorColor,
  newTask, makeTemplate,
} from '../shared/scheduleUtils';
import ScheduleA4, { scheduleA4PageCount } from './ScheduleA4';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';

const DAY_W = 26; // px per day in gantt grid
const LABEL_W = 200; // px for the task name panel

// ─── tiny helpers ──────────────────────────────────────────────

function dateLabel(s: string) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDate(s: string) {
  const d = parseDate(s);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function datesInRange(start: string, end: string): string[] {
  const result: string[] = [];
  let cur = parseDate(start);
  const endD = parseDate(end);
  while (cur <= endD) {
    result.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// ─── Input style ───────────────────────────────────────────────
const INP: React.CSSProperties = {
  background: '#0b1929', border: '1px solid #1e3a5a', borderRadius: 6,
  color: '#dde8f2', padding: '7px 10px', fontSize: 14, width: '100%',
  outline: 'none',
};
const SEL: React.CSSProperties = { ...INP, cursor: 'pointer' };

// ─── EditModal ─────────────────────────────────────────────────

interface EditModalProps {
  task: ScheduleTask;
  allPhases: string[];
  allVendors: string[];
  skipSundays: boolean;
  onSave: (updated: ScheduleTask) => void;
  onDelete: () => void;
  onClose: () => void;
}

function EditModal({ task, allPhases, allVendors, skipSundays, onSave, onDelete, onClose }: EditModalProps) {
  const [draft, setDraft] = useState<ScheduleTask>({ ...task });
  const [newPhase, setNewPhase] = useState('');

  const upd = (key: keyof ScheduleTask, val: unknown) =>
    setDraft(prev => ({ ...prev, [key]: val }));

  function handleSave() {
    const days = Math.max(1, Number(draft.days) || 1);
    onSave({ ...draft, days });
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#0d1b2a', border: '1px solid #1e3a5a', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#93c5fd' }}>工程を編集</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#7aadcf', fontWeight: 600 }}>工程名</label>
          <input style={INP} value={draft.name} onChange={e => upd('name', e.target.value)} placeholder="工程名を入力" autoFocus />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#7aadcf', fontWeight: 600 }}>段階（フェーズ）</label>
            <select style={SEL} value={draft.phase} onChange={e => upd('phase', e.target.value)}>
              {allPhases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input style={{ ...INP, fontSize: 12 }} value={newPhase} onChange={e => setNewPhase(e.target.value)} placeholder="新しい段階を追加..." onKeyDown={e => { if (e.key === 'Enter' && newPhase.trim()) { upd('phase', newPhase.trim()); setNewPhase(''); } }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#7aadcf', fontWeight: 600 }}>日数</label>
            <input type="number" min={1} style={INP} value={draft.days} onChange={e => upd('days', Number(e.target.value))} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#7aadcf', fontWeight: 600 }}>開始日（手動）</label>
            <input type="date" style={INP} value={draft.startDate} onChange={e => upd('startDate', e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#7aadcf', fontWeight: 600 }}>前工程との関係</label>
            <select style={SEL} value={draft.link} onChange={e => upd('link', e.target.value as 'sequential' | 'parallel')}>
              <option value="sequential">連続（前工程の翌日）</option>
              <option value="parallel">同時（前工程と同日）</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#7aadcf', fontWeight: 600 }}>担当業者</label>
            <select style={SEL} value={draft.vendor} onChange={e => upd('vendor', e.target.value)}>
              <option value="">（未設定）</option>
              {allVendors.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#7aadcf', fontWeight: 600 }}>ステータス</label>
            <select style={SEL} value={draft.status} onChange={e => upd('status', e.target.value as ScheduleStatus)}>
              {(Object.keys(STATUS_LABELS) as ScheduleStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#7aadcf', fontWeight: 600 }}>メモ</label>
          <textarea rows={2} style={{ ...INP, resize: 'vertical' }} value={draft.note} onChange={e => upd('note', e.target.value)} placeholder="メモ・特記事項" />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 4 }}>
          <button onClick={onDelete} style={{ background: '#2d0f0f', border: '1px solid #ef4444', color: '#f87171', padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
            <Trash2 size={13} style={{ display: 'inline', marginRight: 4 }} />削除
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>キャンセル</button>
            <button onClick={handleSave} style={{ background: '#0ea5e9', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [skipSundays, setSkipSundays] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
  const [colorBy, setColorBy] = useState<'status' | 'vendor'>('status');
  const [customerView, setCustomerView] = useState(false);
  const [postponeDays, setPostponeDays] = useState(1);
  const [showGantt, setShowGantt] = useState(true);
  const [rainOpen, setRainOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const mountedRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 8秒で saveError 消去
  useEffect(() => {
    if (!saveError) return;
    const t = setTimeout(() => { if (mountedRef.current) setSaveError(null); }, 8000);
    return () => clearTimeout(t);
  }, [saveError]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // プロジェクト読み込み
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', id));
        if (!snap.exists() || !mountedRef.current) return;
        const p = snap.data() as Project;
        setProject(p);
        if (p.schedule) {
          setTasks(p.schedule.tasks ?? []);
          setSkipSundays(p.schedule.skipSundays ?? false);
        }
      } catch (err) {
        logFirebaseError(err, 'SchedulePage load');
        if (mountedRef.current) setLoadError(firebaseErrorMessage(err, 'データの読み込み'));
      }
    })();
  }, [id]);

  // デバウンス保存
  const scheduleSave = useCallback((newTasks: ScheduleTask[], newSkip: boolean) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!id || !mountedRef.current) return;
      setSaveStatus('saving');
      try {
        const data: ScheduleData = { tasks: newTasks, skipSundays: newSkip };
        await updateDoc(doc(db, 'projects', id), { schedule: data });
        if (mountedRef.current) setSaveStatus('saved');
        setTimeout(() => { if (mountedRef.current) setSaveStatus('idle'); }, 2000);
      } catch (err) {
        logFirebaseError(err, 'SchedulePage save');
        if (mountedRef.current) {
          setSaveError(firebaseErrorMessage(err, '工程表の保存'));
          setSaveStatus('idle');
        }
      }
    }, 2000);
  }, [id]);

  // pagehide でフラッシュ
  useEffect(() => {
    const flush = () => {
      if (!id || !mountedRef.current) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        const data: ScheduleData = { tasks, skipSundays };
        navigator.sendBeacon(
          `/api/noop`,
          JSON.stringify({ noop: true })
        );
        updateDoc(doc(db, 'projects', id), { schedule: data }).catch(() => {});
      }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [id, tasks, skipSundays]);

  // ─── Derived ────────────────────────────────────────────────

  const allPhases = [...new Set(tasks.map(t => t.phase))];
  const allVendors = [...new Set(tasks.map(t => t.vendor).filter(Boolean))];

  const ganttStart = tasks.length ? tasks.reduce((m, t) => t.startDate < m ? t.startDate : m, tasks[0].startDate) : toDateStr(new Date());
  const ganttEnd = tasks.length ? tasks.reduce((m, t) => t.endDate > m ? t.endDate : m, tasks[0].endDate) : addDaysToStr(ganttStart, 29);
  const totalGanttDays = Math.max(1, dateDiff(ganttStart, ganttEnd) + 1);

  // ─── Mutations ──────────────────────────────────────────────

  function updateTasks(next: ScheduleTask[], skipSun = skipSundays) {
    const updated = cascade(next, skipSun);
    setTasks(updated);
    scheduleSave(updated, skipSun);
  }

  function handleTaskSave(updated: ScheduleTask) {
    if (editIndex === null) return;
    const next = tasks.map((t, i) => i === editIndex ? updated : t);
    updateTasks(next);
    setEditIndex(null);
  }

  function handleTaskDelete() {
    if (editIndex === null) return;
    updateTasks(tasks.filter((_, i) => i !== editIndex));
    setEditIndex(null);
  }

  function addTask(afterIndex?: number) {
    const refTask = afterIndex !== undefined ? tasks[afterIndex] : tasks[tasks.length - 1];
    const phase = refTask?.phase ?? allPhases[0] ?? '工事';
    const insertAt = afterIndex !== undefined ? afterIndex + 1 : tasks.length;
    const draft = newTask({ phase, link: 'sequential', startDate: ganttEnd, endDate: ganttEnd });
    const next = [...tasks.slice(0, insertAt), draft, ...tasks.slice(insertAt)];
    updateTasks(next);
    setEditIndex(insertAt);
  }

  function handleTemplate() {
    if (tasks.length > 0 && !window.confirm('現在の工程表を「ひな形」で上書きしますか？')) return;
    const start = project?.constructionPeriod?.slice(0, 10) || toDateStr(new Date());
    const tmpl = makeTemplate(start);
    setTasks(tmpl);
    scheduleSave(tmpl, skipSundays);
  }

  function handlePostpone() {
    const next = postpone(tasks, postponeDays, skipSundays);
    setTasks(next);
    scheduleSave(next, skipSundays);
    setRainOpen(false);
  }

  function togglePhase(phase: string) {
    setCollapsedPhases(prev => {
      const next = new Set(prev);
      next.has(phase) ? next.delete(phase) : next.add(phase);
      return next;
    });
  }

  function collapseAll() { setCollapsedPhases(new Set(allPhases)); }
  function expandAll()   { setCollapsedPhases(new Set()); }

  function handlePrint() {
    setIsPrinting(true);
    // RAF × 2 で印刷ビューが DOM に反映されてから print() を呼ぶ
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.print();
    }));
  }

  // afterprint で印刷ビューを非表示に戻す
  useEffect(() => {
    const reset = () => { if (mountedRef.current) setIsPrinting(false); };
    window.addEventListener('afterprint', reset);
    return () => window.removeEventListener('afterprint', reset);
  }, []);

  function taskColor(t: ScheduleTask): string {
    if (colorBy === 'vendor') return vendorColor(t.vendor, allVendors);
    return STATUS_COLORS[t.status];
  }

  // ─── Gantt header days ──────────────────────────────────────

  const headerDays: string[] = [];
  for (let i = 0; i < totalGanttDays; i++) {
    headerDays.push(addDaysToStr(ganttStart, i));
  }

  // ─── Group tasks by phase ───────────────────────────────────

  type PhaseGroup = { phase: string; tasks: { task: ScheduleTask; globalIdx: number }[] };
  const phaseGroups: PhaseGroup[] = [];
  for (const phase of allPhases) {
    phaseGroups.push({
      phase,
      tasks: tasks
        .map((task, globalIdx) => ({ task, globalIdx }))
        .filter(({ task }) => task.phase === phase),
    });
  }

  if (loadError) return (
    <div style={{ minHeight: '100vh', background: '#05111f', display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
      <button onClick={() => navigate(`/project/${id}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#8b8ba8', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
        <ArrowLeft size={16} />もどる
      </button>
      <ErrorMessage message={loadError} />
    </div>
  );

  if (!project) return <LoadingSpinner />;

  // 印刷用スナップショット（現在の tasks state を使用）
  const printProject = project
    ? { ...project, schedule: { tasks, skipSundays } }
    : null;
  const printTotalPages = printProject ? scheduleA4PageCount(printProject) : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#05111f', fontFamily: "'Noto Sans JP', sans-serif", color: '#dde8f2', paddingBottom: 60 }}>

      {/* ─ 印刷専用スタイル ─ */}
      <style>{`
        @media print {
          .schedule-ui     { display: none !important; }
          .schedule-print  { display: block !important; }
          @page { size: A4 portrait; margin: 0mm; }
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .pdf-page-wrapper {
            break-before: page !important;
            page-break-before: always !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .pdf-page-wrapper:first-child {
            break-before: auto !important;
            page-break-before: auto !important;
          }
        }
        .schedule-print { display: none; }
      `}</style>

      {/* ─ 印刷専用ビュー（画面では非表示） ─ */}
      {isPrinting && printProject && printTotalPages > 0 && (
        <div className="schedule-print">
          <ScheduleA4
            project={printProject}
            companyName={project?.contractorName ?? undefined}
            colorBy={colorBy}
            startPage={1}
            totalPages={printTotalPages}
          />
        </div>
      )}

      {/* ─ UI（印刷時非表示） ─ */}
      <div className="schedule-ui">

      {/* ─ Header ─ */}
      <div style={{ background: 'linear-gradient(90deg,#0c2340,#061628)', borderBottom: '1px solid #1e3a5a', padding: '12px 16px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => navigate(`/project/${id}`)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#8b8ba8', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          <ArrowLeft size={15} />もどる
        </button>
        <CalendarRange size={18} style={{ color: '#38bdf8' }} />
        <div style={{ fontWeight: 700, fontSize: 16, color: '#f0ede8' }}>工程表</div>
        <div style={{ fontSize: 12, color: '#38bdf8', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.projectName}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {saveStatus === 'saving' && <span style={{ fontSize: 11, color: '#94a3b8' }}>保存中...</span>}
          {saveStatus === 'saved'  && <span style={{ fontSize: 11, color: '#4ade80' }}>✓ 保存済み</span>}
          {tasks.length > 0 && (
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              style={{ background: '#f59e0b', border: 'none', color: '#000', padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, opacity: isPrinting ? 0.6 : 1 }}
            >
              🖨️ {isPrinting ? '準備中...' : 'PDF・印刷'}
            </button>
          )}
        </div>
      </div>

      {/* ─ Toolbar ─ */}
      <div style={{ background: '#0d1b2a', borderBottom: '1px solid #1e3a5a', padding: '10px 16px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {/* Template */}
        <button onClick={handleTemplate}
          style={{ background: '#1e3a5a', border: '1px solid #2a5a8a', color: '#93c5fd', padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
          📋 ひな形
        </button>

        {/* Add task */}
        <button onClick={() => addTask()}
          style={{ background: '#064e3b', border: '1px solid #065f46', color: '#6ee7b7', padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={13} />工程追加
        </button>

        {/* Rain delay */}
        <button onClick={() => setRainOpen(v => !v)}
          style={{ background: '#1e3a8a', border: '1px solid #2563eb', color: '#93c5fd', padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
          🌧 雨天順延
        </button>
        {rainOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={1} max={30} value={postponeDays} onChange={e => setPostponeDays(Number(e.target.value))}
              style={{ ...INP, width: 52, padding: '5px 8px', fontSize: 13, textAlign: 'center' }} />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>日順延</span>
            <button onClick={handlePostpone}
              style={{ background: '#2563eb', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
              実行
            </button>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Color toggle */}
        <button onClick={() => setColorBy(v => v === 'status' ? 'vendor' : 'status')}
          style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
          🎨 {colorBy === 'status' ? '状態別' : '業者別'}
        </button>

        {/* Customer view */}
        <button onClick={() => setCustomerView(v => !v)}
          style={{ background: customerView ? 'rgba(245,158,11,0.15)' : '#1e293b', border: `1px solid ${customerView ? '#f59e0b' : '#334155'}`, color: customerView ? '#f59e0b' : '#94a3b8', padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
          👤 お客様
        </button>

        {/* Gantt toggle */}
        <button onClick={() => setShowGantt(v => !v)}
          style={{ background: showGantt ? 'rgba(56,189,248,0.15)' : '#1e293b', border: `1px solid ${showGantt ? '#38bdf8' : '#334155'}`, color: showGantt ? '#38bdf8' : '#94a3b8', padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
          <AlignLeft size={13} style={{ display: 'inline', marginRight: 4 }} />
          {showGantt ? 'Gantt表示' : 'リスト表示'}
        </button>

        {/* Collapse/Expand */}
        <button onClick={collapseAll} style={{ background: 'none', border: '1px solid #334155', color: '#64748b', padding: '6px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>すべて畳む</button>
        <button onClick={expandAll}   style={{ background: 'none', border: '1px solid #334155', color: '#64748b', padding: '6px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>すべて開く</button>

        {/* Skip sundays */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
          <input type="checkbox" checked={skipSundays} onChange={e => {
            const v = e.target.checked;
            setSkipSundays(v);
            updateTasks(tasks, v);
          }} />
          日曜除く
        </label>
      </div>

      {saveError && (
        <div style={{ padding: '8px 16px' }}>
          <ErrorMessage message={saveError} onDismiss={() => setSaveError(null)} />
        </div>
      )}

      {/* ─ Empty state ─ */}
      {tasks.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 80 }}>
          <CalendarRange size={48} style={{ color: '#1e3a5a' }} />
          <p style={{ color: '#64748b', fontWeight: 700 }}>工程がまだありません</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={handleTemplate} style={{ background: '#1e3a5a', border: '1px solid #2a5a8a', color: '#93c5fd', padding: '10px 20px', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontWeight: 700 }}>
              📋 ひな形から作成
            </button>
            <button onClick={() => addTask()} style={{ background: '#064e3b', border: '1px solid #065f46', color: '#6ee7b7', padding: '10px 20px', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} />工程を追加
            </button>
          </div>
        </div>
      )}

      {/* ─ Schedule body ─ */}
      {tasks.length > 0 && (
        <div style={{ padding: '12px 0' }}>
          {showGantt ? (
            // ─ Gantt view ─
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: LABEL_W + totalGanttDays * DAY_W + 32 }}>

                {/* Day header */}
                <div style={{ display: 'flex', borderBottom: '1px solid #1e3a5a', background: '#0b1929' }}>
                  <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, fontSize: 11, color: '#475569', padding: '6px 12px', fontWeight: 700 }}>工程名</div>
                  <div style={{ display: 'flex', overflow: 'hidden' }}>
                    {headerDays.map(d => {
                      const dt = parseDate(d);
                      const isSun = dt.getDay() === 0;
                      const isSat = dt.getDay() === 6;
                      return (
                        <div key={d} style={{ width: DAY_W, minWidth: DAY_W, textAlign: 'center', fontSize: 9, color: isSun ? '#f87171' : isSat ? '#93c5fd' : '#475569', padding: '4px 0', borderLeft: '1px solid #1e293b' }}>
                          {dateLabel(d)}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Phase groups */}
                {phaseGroups.map(({ phase, tasks: pts }) => {
                  const collapsed = collapsedPhases.has(phase);
                  return (
                    <div key={phase}>
                      {/* Phase header */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', background: '#0f2030', borderBottom: '1px solid #1e3a5a', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => togglePhase(phase)}
                      >
                        <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
                          {collapsed ? <ChevronRight size={13} style={{ color: '#38bdf8' }} /> : <ChevronDown size={13} style={{ color: '#38bdf8' }} />}
                          <span style={{ fontWeight: 700, fontSize: 13, color: '#38bdf8' }}>{phase}</span>
                          <span style={{ fontSize: 11, color: '#475569' }}>（{pts.length}工程）</span>
                        </div>
                        <div style={{ flex: 1, height: 28 }} />
                      </div>

                      {/* Tasks */}
                      {!collapsed && pts.map(({ task: t, globalIdx }) => {
                        const barLeft = dateDiff(ganttStart, t.startDate);
                        const barWidth = Math.max(1, dateDiff(t.startDate, t.endDate) + 1);
                        const color = taskColor(t);
                        return (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #0f1d2e', background: t.status === 'done' ? '#0d1b0d' : t.status === 'skip' ? '#111827' : 'transparent' }}>
                            {/* Task name */}
                            <div
                              style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                              onClick={() => setEditIndex(globalIdx)}
                            >
                              <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4, background: STATUS_BG[t.status], color: STATUS_COLORS[t.status], fontWeight: 700, whiteSpace: 'nowrap' }}>
                                {STATUS_LABELS[t.status]}
                              </span>
                              <span style={{ fontSize: 12, color: t.status === 'skip' ? '#475569' : '#dde8f2', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.status === 'skip' ? 'line-through' : 'none' }}>
                                {t.name || '（未入力）'}
                              </span>
                            </div>

                            {/* Bar area */}
                            <div style={{ position: 'relative', height: 32, flex: 1 }}>
                              {/* Today line */}
                              {(() => {
                                const todayOff = dateDiff(ganttStart, toDateStr(new Date()));
                                if (todayOff >= 0 && todayOff < totalGanttDays) {
                                  return <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayOff * DAY_W + DAY_W / 2, width: 1, background: '#f59e0b', opacity: 0.5 }} />;
                                }
                                return null;
                              })()}

                              {/* Task bar */}
                              <div
                                style={{
                                  position: 'absolute',
                                  left: barLeft * DAY_W,
                                  width: barWidth * DAY_W - 2,
                                  top: 5, bottom: 5,
                                  background: color,
                                  borderRadius: 4,
                                  opacity: t.status === 'skip' ? 0.3 : 0.85,
                                  cursor: 'pointer',
                                  display: 'flex', alignItems: 'center',
                                  padding: '0 6px',
                                  overflow: 'hidden',
                                }}
                                onClick={() => setEditIndex(globalIdx)}
                              >
                                {!customerView && t.vendor && (
                                  <span style={{ fontSize: 9, color: '#fff', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {t.vendor}
                                  </span>
                                )}
                              </div>

                              {/* Grid lines */}
                              {headerDays.map((_, di) => (
                                <div key={di} style={{ position: 'absolute', top: 0, bottom: 0, left: di * DAY_W, width: 1, background: '#0f1d2e' }} />
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {/* Add task to this phase */}
                      {!collapsed && (
                        <button
                          onClick={() => {
                            const lastIdx = pts[pts.length - 1]?.globalIdx;
                            const draft = newTask({ phase, link: 'sequential' });
                            const insertAt = lastIdx !== undefined ? lastIdx + 1 : tasks.length;
                            const next = [...tasks.slice(0, insertAt), draft, ...tasks.slice(insertAt)];
                            updateTasks(next);
                            setEditIndex(insertAt);
                          }}
                          style={{ display: 'block', width: LABEL_W, margin: '2px 8px', background: 'none', border: '1px dashed #1e3a5a', color: '#1e3a5a', padding: '4px 0', borderRadius: 6, fontSize: 12, cursor: 'pointer', textAlign: 'center' }}
                        >
                          + この段階に追加
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            // ─ List view ─
            <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 0 }}>
              {phaseGroups.map(({ phase, tasks: pts }) => {
                const collapsed = collapsedPhases.has(phase);
                return (
                  <div key={phase} style={{ marginBottom: 8 }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0f2030', border: '1px solid #1e3a5a', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}
                      onClick={() => togglePhase(phase)}
                    >
                      {collapsed ? <ChevronRight size={14} style={{ color: '#38bdf8' }} /> : <ChevronDown size={14} style={{ color: '#38bdf8' }} />}
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#38bdf8' }}>{phase}</span>
                      <span style={{ fontSize: 12, color: '#475569' }}>{pts.length}工程</span>
                    </div>

                    {!collapsed && (
                      <div style={{ borderLeft: '2px solid #1e3a5a', marginLeft: 12, marginTop: 2 }}>
                        {pts.map(({ task: t, globalIdx }) => (
                          <div
                            key={t.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #0f1d2e', cursor: 'pointer', background: t.status === 'done' ? '#0d1b0d' : 'transparent' }}
                            onClick={() => setEditIndex(globalIdx)}
                          >
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: taskColor(t), flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: t.status === 'skip' ? '#475569' : '#dde8f2', textDecoration: t.status === 'skip' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.name || '（未入力）'}
                              </div>
                              <div style={{ fontSize: 11, color: '#475569', display: 'flex', gap: 8, marginTop: 2 }}>
                                <span>{fmtDate(t.startDate)}〜{fmtDate(t.endDate)}</span>
                                <span>{t.days}日</span>
                                {!customerView && t.vendor && <span style={{ color: '#7aadcf' }}>{t.vendor}</span>}
                              </div>
                            </div>
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: STATUS_BG[t.status], color: STATUS_COLORS[t.status], fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {STATUS_LABELS[t.status]}
                            </span>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const lastIdx = pts[pts.length - 1]?.globalIdx;
                            const draft = newTask({ phase, link: 'sequential' });
                            const insertAt = lastIdx !== undefined ? lastIdx + 1 : tasks.length;
                            const next = [...tasks.slice(0, insertAt), draft, ...tasks.slice(insertAt)];
                            updateTasks(next);
                            setEditIndex(insertAt);
                          }}
                          style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: '#1e3a5a', padding: '8px 0', fontSize: 12, cursor: 'pointer', textAlign: 'left', paddingLeft: 12 }}
                        >
                          + {phase} に工程を追加
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─ Vendor legend ─ */}
      {colorBy === 'vendor' && allVendors.length > 0 && (
        <div style={{ padding: '8px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {allVendors.map((v, i) => (
            <span key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#dde8f2' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: VENDOR_PALETTE[i % VENDOR_PALETTE.length], display: 'inline-block' }} />
              {v}
            </span>
          ))}
        </div>
      )}

      {/* ─ Summary ─ */}
      {tasks.length > 0 && (
        <div style={{ margin: '12px 16px 0', padding: '12px 16px', background: '#0b1929', border: '1px solid #1e3a5a', borderRadius: 10, display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: '#7aadcf' }}>
          <span>工程数: <b style={{ color: '#dde8f2' }}>{tasks.length}</b></span>
          <span>期間: <b style={{ color: '#dde8f2' }}>{fmtDate(ganttStart)} 〜 {fmtDate(ganttEnd)}</b></span>
          <span>日数: <b style={{ color: '#dde8f2' }}>{totalGanttDays}日</b></span>
          <span>完了: <b style={{ color: '#4ade80' }}>{tasks.filter(t => t.status === 'done').length}</b> / {tasks.length}</span>
        </div>
      )}

      {/* ─ Edit modal ─ */}
      {editIndex !== null && tasks[editIndex] && (
        <EditModal
          task={tasks[editIndex]}
          allPhases={allPhases}
          allVendors={allVendors}
          skipSundays={skipSundays}
          onSave={handleTaskSave}
          onDelete={handleTaskDelete}
          onClose={() => setEditIndex(null)}
        />
      )}

      </div>{/* end .schedule-ui */}
    </div>
  );
}
