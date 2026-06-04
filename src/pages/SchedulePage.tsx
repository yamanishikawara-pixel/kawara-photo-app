import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, ChevronDown, ChevronRight, CalendarRange, Trash2, AlignLeft, ChevronUp, GripVertical } from 'lucide-react';
import {
  DndContext, PointerSensor, TouchSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Project } from '../types';
import {
  type ScheduleTask, type ScheduleStatus, type ScheduleData, type Helper,
  cascade, postpone, toDateStr, parseDate, dateDiff, addDaysToStr,
  STATUS_LABELS, STATUS_COLORS, STATUS_BG, VENDOR_PALETTE, vendorColor,
  helperTotal, newTask, makeTemplate,
} from '../shared/scheduleUtils';
import ScheduleA4, { scheduleA4PageCount } from './ScheduleA4';
import { firebaseErrorMessage, logFirebaseError } from '../shared/firebaseError';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorMessage';

const DAY_W = 26;
const LABEL_W = 200;

// ─── Apple Dark design tokens ──────────────────────────────────
const A = {
  bg:      '#000000',
  s1:      '#1c1c1e',
  s2:      '#2c2c2e',
  s3:      '#3a3a3c',
  sep:     'rgba(255,255,255,0.12)',
  t1:      '#ffffff',
  t2:      'rgba(255,255,255,0.55)',
  t3:      'rgba(255,255,255,0.28)',
  blue:    '#0a84ff',
  green:   '#30d158',
  orange:  '#ff9f0a',
  red:     '#ff453a',
  yellow:  '#ffd60a',
  teal:    '#5ac8fa',
  purple:  '#bf5af2',
} as const;
const FONT = '-apple-system,"SF Pro Display",system-ui,"Helvetica Neue",sans-serif';

/** Appleスタイル塗りボタン */
function ab(bg: string, fg = '#fff'): React.CSSProperties {
  return {
    background: bg, color: fg, border: 'none', borderRadius: 10,
    padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
    WebkitTapHighlightColor: 'transparent',
  };
}
/** Appleスタイルゴーストボタン */
function ag(active = false): React.CSSProperties {
  return {
    background: active ? 'rgba(10,132,255,0.18)' : 'rgba(255,255,255,0.08)',
    color: active ? A.blue : A.t2,
    border: `1px solid ${active ? A.blue : 'transparent'}`,
    borderRadius: 9, padding: '7px 13px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center',
    gap: 5, whiteSpace: 'nowrap', WebkitTapHighlightColor: 'transparent',
  } as React.CSSProperties;
}

// ─── SortableTaskRow（リスト表示用 dnd-kit ラッパー）──────────────

interface SortableTaskRowProps {
  task: ScheduleTask;
  globalIdx: number;
  totalTasks: number;
  taskColor: string;
  customerView: boolean;
  onEdit: () => void;
  onMove: (from: number, to: number) => void;
}

function SortableTaskRow({ task: t, globalIdx, totalTasks, taskColor: tColor, customerView, onEdit, onMove }: SortableTaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '9px 12px',
    borderBottom: `1px solid ${A.sep}`,
    background: t.status === 'done' ? 'rgba(48,209,88,0.06)' : t.status === 'skip' ? A.s2 : 'transparent',
    cursor: 'default',
    userSelect: 'none',
  };

  function fmtD(s: string) {
    const d = parseDate(s);
    return `${d.getMonth()+1}/${d.getDate()}`;
  }

  return (
    <div ref={setNodeRef} style={style}>
      {/* ドラッグハンドル */}
      <div {...attributes} {...listeners} style={{ color: A.t3, cursor: 'grab', display: 'flex', alignItems: 'center', touchAction: 'none', padding: '0 2px' }}>
        <GripVertical size={15} />
      </div>

      {/* 色ドット */}
      <div style={{ width: 8, height: 8, borderRadius: 2, background: tColor, flexShrink: 0 }} />

      {/* テキスト */}
      <div style={{ flex: 1, minWidth: 0 }} onClick={onEdit} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onEdit()} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.status === 'skip' ? A.t3 : A.t1, textDecoration: t.status === 'skip' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT }}>
          {t.name || '（未入力）'}
        </div>
        <div style={{ fontSize: 11, color: A.t3, display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap', fontFamily: FONT }}>
          <span>{fmtD(t.startDate)}〜{fmtD(t.endDate)}</span>
          <span>{t.days}日</span>
          {!customerView && t.vendor && <span style={{ color: A.teal }}>{t.vendor}</span>}
          {!customerView && (t.workerCount ?? 1) > 0 && <span>自社{t.workerCount ?? 1}人</span>}
          {!customerView && helperTotal(t.helpers ?? []) > 0 && (
            <span style={{ color: A.orange, fontWeight: 700 }}>
              🤝 {(t.helpers ?? []).map(h => `${h.name}${h.count}人`).join(' / ')}
            </span>
          )}
        </div>
      </div>

      {/* ステータス + ↑↓ */}
      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: STATUS_BG[t.status], color: STATUS_COLORS[t.status], fontWeight: 700, whiteSpace: 'nowrap', fontFamily: FONT }}>
        {STATUS_LABELS[t.status]}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
        <button onClick={() => onMove(globalIdx, globalIdx - 1)} disabled={globalIdx === 0}
          style={{ background: 'none', border: 'none', color: A.t3, cursor: 'pointer', padding: 0, opacity: globalIdx === 0 ? 0.2 : 1 }}>
          <ChevronUp size={12} />
        </button>
        <button onClick={() => onMove(globalIdx, globalIdx + 1)} disabled={globalIdx === totalTasks - 1}
          style={{ background: 'none', border: 'none', color: A.t3, cursor: 'pointer', padding: 0, opacity: globalIdx === totalTasks - 1 ? 0.2 : 1 }}>
          <ChevronDown size={12} />
        </button>
      </div>
    </div>
  );
}

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
  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 9, color: '#fff', padding: '9px 12px', fontSize: 14, width: '100%',
  outline: 'none', fontFamily: FONT, boxSizing: 'border-box',
};
const SEL: React.CSSProperties = { ...INP, cursor: 'pointer' };

// ─── EditModal ─────────────────────────────────────────────────

interface EditModalProps {
  task: ScheduleTask;
  allPhases: string[];
  allVendors: string[];
  allHelperNames: string[];
  skipSundays: boolean;
  onSave: (updated: ScheduleTask) => void;
  onDelete: () => void;
  onClose: () => void;
}

function EditModal({ task, allPhases, allVendors, allHelperNames, skipSundays, onSave, onDelete, onClose }: EditModalProps) {
  const [draft, setDraft] = useState<ScheduleTask>({
    helpers: [], workerCount: 1, ...task,
  });
  const [newPhase, setNewPhase] = useState('');

  function addHelper() {
    setDraft(prev => ({ ...prev, helpers: [...(prev.helpers ?? []), { name: '', count: 1 }] }));
  }
  function updHelper(i: number, key: keyof Helper, val: string | number) {
    setDraft(prev => {
      const next = (prev.helpers ?? []).map((h, j) => j === i ? { ...h, [key]: val } : h);
      return { ...prev, helpers: next };
    });
  }
  function removeHelper(i: number) {
    setDraft(prev => ({ ...prev, helpers: (prev.helpers ?? []).filter((_, j) => j !== i) }));
  }

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
      <div style={{ background: '#1c1c1e', borderRadius: 18, padding: 24, width: '100%', maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.7)', fontFamily: FONT }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: '#fff', letterSpacing: '-0.02em' }}>工程を編集</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: A.t2, fontWeight: 600, fontFamily: FONT }}>工程名</label>
          <input style={INP} value={draft.name} onChange={e => upd('name', e.target.value)} placeholder="工程名を入力" autoFocus />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: A.t2, fontWeight: 600, fontFamily: FONT }}>段階（フェーズ）</label>
            <select style={SEL} value={draft.phase} onChange={e => upd('phase', e.target.value)}>
              {allPhases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input style={{ ...INP, fontSize: 12 }} value={newPhase} onChange={e => setNewPhase(e.target.value)} placeholder="新しい段階を追加..." onKeyDown={e => { if (e.key === 'Enter' && newPhase.trim()) { upd('phase', newPhase.trim()); setNewPhase(''); } }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: A.t2, fontWeight: 600, fontFamily: FONT }}>日数</label>
            <input type="number" min={1} style={INP} value={draft.days} onChange={e => upd('days', Number(e.target.value))} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: A.t2, fontWeight: 600, fontFamily: FONT }}>開始日（手動）</label>
            <input type="date" style={INP} value={draft.startDate} onChange={e => upd('startDate', e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: A.t2, fontWeight: 600, fontFamily: FONT }}>前工程との関係</label>
            <select style={SEL} value={draft.link} onChange={e => upd('link', e.target.value as 'sequential' | 'parallel')}>
              <option value="sequential">連続（前工程の翌日）</option>
              <option value="parallel">同時（前工程と同日）</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: A.t2, fontWeight: 600, fontFamily: FONT }}>担当業者</label>
            <select style={SEL} value={draft.vendor} onChange={e => upd('vendor', e.target.value)}>
              <option value="">（未設定）</option>
              {allVendors.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: A.t2, fontWeight: 600, fontFamily: FONT }}>ステータス</label>
            <select style={SEL} value={draft.status} onChange={e => upd('status', e.target.value as ScheduleStatus)}>
              {(Object.keys(STATUS_LABELS) as ScheduleStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: A.t2, fontWeight: 600, fontFamily: FONT }}>自社人員（人）</label>
            <input type="number" min={0} style={INP} value={draft.workerCount ?? 1}
              onChange={e => upd('workerCount', Math.max(0, Number(e.target.value)))} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: A.t2, fontWeight: 600, fontFamily: FONT }}>メモ</label>
            <textarea rows={1} style={{ ...INP, resize: 'none' }} value={draft.note} onChange={e => upd('note', e.target.value)} placeholder="特記事項" />
          </div>
        </div>

        {/* ─ 応援 ─ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: 11, color: A.orange, fontWeight: 700, fontFamily: FONT }}>🤝 応援</label>
            <button onClick={addHelper} style={ag()}>＋ 追加</button>
          </div>
          {(draft.helpers ?? []).length === 0 && (
            <div style={{ fontSize: 11, color: '#475569', padding: '4px 0' }}>応援なし（＋ 追加で登録）</div>
          )}
          {(draft.helpers ?? []).map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                list={`helper-names-${i}`}
                style={{ ...INP, flex: 1 }}
                value={h.name}
                onChange={e => updHelper(i, 'name', e.target.value)}
                placeholder="氏名・会社名"
              />
              <datalist id={`helper-names-${i}`}>
                {allHelperNames.map(n => <option key={n} value={n} />)}
              </datalist>
              <input
                type="number" min={1} max={99}
                style={{ ...INP, width: 52, textAlign: 'center', flexShrink: 0 }}
                value={h.count}
                onChange={e => updHelper(i, 'count', Math.max(1, Number(e.target.value)))}
              />
              <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>人</span>
              <button onClick={() => removeHelper(i)} style={{ background: 'none', border: '1px solid #334155', color: '#ef4444', padding: '4px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>×</button>
            </div>
          ))}
          {(draft.helpers ?? []).length > 0 && (
            <div style={{ fontSize: 11, color: '#fbbf24', paddingLeft: 2 }}>
              合計: {(draft.helpers ?? []).reduce((s, h) => s + (Number(h.count) || 0), 0)}人の応援
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 4 }}>
          <button onClick={onDelete} style={ab(A.s2, A.red)}>
            <Trash2 size={14} />削除
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={ag()}>キャンセル</button>
            <button onClick={handleSave} style={ab(A.blue)}>保存</button>
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
  const [colorBy, setColorBy] = useState<'status' | 'vendor' | 'helper'>('status');
  const [customerView, setCustomerView] = useState(false);
  const [postponeDays, setPostponeDays] = useState(1);
  const [showGantt, setShowGantt] = useState(true);
  const [rainOpen, setRainOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printMode, setPrintMode] = useState<'internal' | 'customer'>('internal');

  // ─── Drag state ────────────────────────────────────────────
  interface DragState {
    type: 'move' | 'resize';
    globalIdx: number;
    startX: number;
    origStartDate: string;
    origDays: number;
    hasMoved: boolean;
  }
  const draggingRef = useRef<DragState | null>(null);
  const tasksRef    = useRef<ScheduleTask[]>([]);
  const skipRef     = useRef(false);
  // 再render用に dragging を state にも持つ（カーソル切替に使う）
  const [dragActiveIdx, setDragActiveIdx] = useState<number | null>(null);

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

  const allPhases      = [...new Set(tasks.map(t => t.phase))];
  const allVendors     = [...new Set(tasks.map(t => t.vendor).filter(Boolean))];
  const allHelperNames = [...new Set(tasks.flatMap(t => (t.helpers ?? []).map(h => h.name)).filter(Boolean))];

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

  function moveTask(fromIdx: number, toIdx: number) {
    if (toIdx < 0 || toIdx >= tasks.length) return;
    const next = arrayMove(tasks, fromIdx, toIdx);
    updateTasks(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = tasks.findIndex(t => t.id === active.id);
    const toIdx   = tasks.findIndex(t => t.id === over.id);
    if (fromIdx !== -1 && toIdx !== -1) moveTask(fromIdx, toIdx);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function handlePrint(mode: 'internal' | 'customer') {
    setPrintMode(mode);
    setIsPrinting(true);
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

  // ref を最新 state に追従させる
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { skipRef.current = skipSundays; }, [skipSundays]);

  // ─── Drag: window-level pointer events ─────────────────────
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;
      const deltaPixels = e.clientX - drag.startX;
      const deltaDays = Math.round(deltaPixels / DAY_W);
      if (Math.abs(deltaPixels) > 3) drag.hasMoved = true;
      if (!drag.hasMoved) return;

      setTasks(prev => {
        const next = prev.map((t, i) => {
          if (i !== drag.globalIdx) return t;
          if (drag.type === 'move') {
            const newStart = addDaysToStr(drag.origStartDate, deltaDays);
            return { ...t, startDate: newStart };
          } else {
            return { ...t, days: Math.max(1, drag.origDays + deltaDays) };
          }
        });
        const cascaded = cascade(next, skipRef.current);
        tasksRef.current = cascaded;
        return cascaded;
      });
    };

    const onUp = (e: PointerEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;
      const wasMoved = drag.hasMoved;
      draggingRef.current = null;
      setDragActiveIdx(null);
      if (wasMoved) {
        // ドラッグ終了後に保存
        scheduleSave(tasksRef.current, skipRef.current);
      } else {
        // 動かなければクリック扱い → モーダルを開く
        setEditIndex(drag.globalIdx);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [scheduleSave]);

  function taskColor(t: ScheduleTask): string {
    if (colorBy === 'vendor') return vendorColor(t.vendor, allVendors);
    if (colorBy === 'helper') {
      const total = helperTotal(t.helpers ?? []);
      if (total === 0) return '#475569';
      if (total <= 1) return '#0ea5e9';
      if (total <= 3) return '#f59e0b';
      return '#ef4444'; // 4人以上は赤
    }
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
    <div style={{ fontFamily: FONT }}>

      {/* ─ 印刷専用スタイル ─ */}
      <style>{`
        @media print {
          .schedule-ui     { display: none !important; }
          .schedule-print  { display: block !important; }
          @page { size: A4 landscape; margin: 0mm; }
          html, body, #root, #root > * {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          html, body {
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
            mode={printMode}
            startPage={1}
            totalPages={printTotalPages}
          />
        </div>
      )}

      {/* ─ UI（印刷時非表示・黒背景はここに閉じ込める） ─ */}
      <div className="schedule-ui" style={{ minHeight: '100vh', background: A.bg, color: A.t1, paddingBottom: 60 }}>

      {/* ─ Header ─ */}
      <div style={{ background: 'rgba(28,28,30,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${A.sep}`, padding: '12px 16px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, position: 'sticky', top: 0, zIndex: 50 } as React.CSSProperties}>
        <button onClick={() => navigate(`/project/${id}`)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: A.blue, cursor: 'pointer', fontSize: 15, fontWeight: 500, fontFamily: FONT }}>
          <ArrowLeft size={16} />戻る
        </button>
        <div style={{ width: 1, height: 18, background: A.sep, margin: '0 4px' }} />
        <CalendarRange size={16} style={{ color: A.blue }} />
        <div style={{ fontWeight: 700, fontSize: 16, color: A.t1, letterSpacing: '-0.02em' }}>工程表</div>
        <div style={{ fontSize: 13, color: A.t2, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.projectName}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {saveStatus === 'saving' && <span style={{ fontSize: 12, color: A.t3 }}>保存中…</span>}
          {saveStatus === 'saved'  && <span style={{ fontSize: 12, color: A.green }}>✓ 保存済み</span>}
          {tasks.length > 0 && !isPrinting && (
            <>
              <button onClick={() => handlePrint('internal')} style={ab(A.s2, A.t1)}>
                🏠 自社用
              </button>
              <button onClick={() => handlePrint('customer')} style={ab(A.blue)}>
                🖨️ お客様用
              </button>
            </>
          )}
          {isPrinting && <span style={{ fontSize: 12, color: A.t3 }}>印刷準備中…</span>}
        </div>
      </div>

      {/* ─ Toolbar ─ */}
      <div style={{ background: A.s1, borderBottom: `1px solid ${A.sep}`, padding: '10px 16px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <button onClick={handleTemplate} style={ag()}>📋 ひな形</button>
        <button onClick={() => addTask()} style={ag()}>
          <Plus size={13} />工程追加
        </button>
        <button onClick={() => setRainOpen(v => !v)} style={ag(rainOpen)}>🌧 雨天順延</button>
        {rainOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={1} max={30} value={postponeDays}
              onChange={e => setPostponeDays(Number(e.target.value))}
              style={{ ...INP, width: 56, textAlign: 'center', fontSize: 13 }} />
            <span style={{ fontSize: 12, color: A.t2, fontFamily: FONT }}>日</span>
            <button onClick={handlePostpone} style={ab(A.blue, '#fff')}>実行</button>
          </div>
        )}

        <div style={{ flex: 1 }} />

        <button onClick={() => setColorBy(v => v === 'status' ? 'vendor' : v === 'vendor' ? 'helper' : 'status')}
          style={ag()}>
          🎨 {colorBy === 'status' ? '状態別' : colorBy === 'vendor' ? '業者別' : '応援別'}
        </button>
        <button onClick={() => setCustomerView(v => !v)} style={ag(customerView)}>
          👤 お客様ビュー
        </button>
        <button onClick={() => setShowGantt(v => !v)} style={ag(showGantt)}>
          <AlignLeft size={13} />
          {showGantt ? 'Gantt' : 'リスト'}
        </button>
        <button onClick={collapseAll} style={ag()}>畳む</button>
        <button onClick={expandAll}   style={ag()}>開く</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: A.t2, cursor: 'pointer', fontFamily: FONT }}>
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
                  <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, fontSize: 11, color: A.t3, padding: '6px 12px', fontWeight: 600, fontFamily: FONT }}>工程名</div>
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
                        style={{ display: 'flex', alignItems: 'center', background: A.s1, borderBottom: `1px solid ${A.sep}`, cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => togglePhase(phase)}
                      >
                        <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
                          {collapsed ? <ChevronRight size={13} style={{ color: A.blue }} /> : <ChevronDown size={13} style={{ color: A.blue }} />}
                          <span style={{ fontWeight: 700, fontSize: 13, color: A.blue, fontFamily: FONT }}>{phase}</span>
                          <span style={{ fontSize: 11, color: A.t3, fontFamily: FONT }}>（{pts.length}）</span>
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
                            {/* Task name + ↑↓ */}
                            <div style={{ width: LABEL_W, minWidth: LABEL_W, flexShrink: 0, padding: '3px 6px 3px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                                <button onClick={() => moveTask(globalIdx, globalIdx - 1)} disabled={globalIdx === 0}
                                  style={{ background: 'none', border: 'none', color: A.t3, cursor: 'pointer', padding: 0, lineHeight: 1, opacity: globalIdx === 0 ? 0.2 : 1 }}>
                                  <ChevronUp size={11} />
                                </button>
                                <button onClick={() => moveTask(globalIdx, globalIdx + 1)} disabled={globalIdx === tasks.length - 1}
                                  style={{ background: 'none', border: 'none', color: A.t3, cursor: 'pointer', padding: 0, lineHeight: 1, opacity: globalIdx === tasks.length - 1 ? 0.2 : 1 }}>
                                  <ChevronDown size={11} />
                                </button>
                              </div>
                              <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4, background: STATUS_BG[t.status], color: STATUS_COLORS[t.status], fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                {STATUS_LABELS[t.status]}
                              </span>
                              <span onClick={() => setEditIndex(globalIdx)} style={{ fontSize: 12, color: t.status === 'skip' ? A.t3 : A.t1, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.status === 'skip' ? 'line-through' : 'none', cursor: 'pointer' }}>
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
                                  width: Math.max(8, barWidth * DAY_W - 2),
                                  top: 5, bottom: 5,
                                  background: color,
                                  borderRadius: 4,
                                  opacity: t.status === 'skip' ? 0.3 : 0.85,
                                  cursor: dragActiveIdx === globalIdx ? 'grabbing' : 'grab',
                                  display: 'flex', alignItems: 'center',
                                  padding: '0 20px 0 6px',
                                  overflow: 'hidden',
                                  userSelect: 'none',
                                  touchAction: 'none',
                                }}
                                onPointerDown={e => {
                                  if (e.button !== 0) return;
                                  // リサイズハンドル以外ならバー移動
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const isHandle = e.clientX > rect.right - 14;
                                  if (isHandle) return; // リサイズハンドル側で処理
                                  e.preventDefault();
                                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                  const state: DragState = { type: 'move', globalIdx, startX: e.clientX, origStartDate: t.startDate, origDays: t.days, hasMoved: false };
                                  draggingRef.current = state;
                                  setDragActiveIdx(globalIdx);
                                }}
                              >
                                {!customerView && t.vendor && (
                                  <span style={{ fontSize: 9, color: '#fff', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                                    {t.vendor}
                                  </span>
                                )}
                                {helperTotal(t.helpers ?? []) > 0 && (
                                  <span style={{ fontSize: 9, background: 'rgba(251,191,36,0.9)', color: '#000', borderRadius: 3, padding: '0 4px', fontWeight: 700, flexShrink: 0, marginLeft: 2 }}>
                                    🤝{helperTotal(t.helpers ?? [])}人
                                  </span>
                                )}
                                {/* リサイズハンドル（右端） */}
                                <div
                                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 12, cursor: 'ew-resize', background: 'rgba(255,255,255,0.25)', borderRadius: '0 4px 4px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                  onPointerDown={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                    const state: DragState = { type: 'resize', globalIdx, startX: e.clientX, origStartDate: t.startDate, origDays: t.days, hasMoved: false };
                                    draggingRef.current = state;
                                    setDragActiveIdx(globalIdx);
                                  }}
                                >
                                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', lineHeight: 1 }}>⋮</span>
                                </div>
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
            // ─ List view（dnd-kit ドラッグ並び替え）─
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
            <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 0 }}>
              {phaseGroups.map(({ phase, tasks: pts }) => {
                const collapsed = collapsedPhases.has(phase);
                return (
                  <div key={phase} style={{ marginBottom: 8 }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: A.s1, borderRadius: 12, padding: '10px 16px', cursor: 'pointer' }}
                      onClick={() => togglePhase(phase)}
                    >
                      {collapsed ? <ChevronRight size={14} style={{ color: A.blue }} /> : <ChevronDown size={14} style={{ color: A.blue }} />}
                      <span style={{ fontWeight: 700, fontSize: 14, color: A.blue, fontFamily: FONT }}>{phase}</span>
                      <span style={{ fontSize: 12, color: A.t3, fontFamily: FONT }}>{pts.length}工程</span>
                    </div>

                    {!collapsed && (
                      <div style={{ borderLeft: `2px solid ${A.sep}`, marginLeft: 12, marginTop: 2, borderRadius: '0 0 0 8px' }}>
                        {pts.map(({ task: t, globalIdx }) => (
                          <SortableTaskRow
                            key={t.id}
                            task={t}
                            globalIdx={globalIdx}
                            totalTasks={tasks.length}
                            taskColor={taskColor(t)}
                            customerView={customerView}
                            onEdit={() => setEditIndex(globalIdx)}
                            onMove={moveTask}
                          />
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
                          style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: A.t3, padding: '8px 12px', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}
                        >
                          ＋ {phase} に工程を追加
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </SortableContext>
          </DndContext>
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
        <div style={{ margin: '12px 16px 0', padding: '12px 16px', background: A.s1, borderRadius: 12, display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: A.t2, fontFamily: FONT }}>
          <span>工程数: <b style={{ color: A.t1 }}>{tasks.length}</b></span>
          <span>期間: <b style={{ color: A.t1 }}>{fmtDate(ganttStart)} 〜 {fmtDate(ganttEnd)}</b></span>
          <span>日数: <b style={{ color: A.t1 }}>{totalGanttDays}日</b></span>
          <span>完了: <b style={{ color: A.green }}>{tasks.filter(t => t.status === 'done').length}</b> / {tasks.length}</span>
        </div>
      )}

      {/* ─ Edit modal ─ */}
      {editIndex !== null && tasks[editIndex] && (
        <EditModal
          task={tasks[editIndex]}
          allPhases={allPhases}
          allVendors={allVendors}
          allHelperNames={allHelperNames}
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
