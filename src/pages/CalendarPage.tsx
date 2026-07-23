import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, doc, getDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { ScheduleEvent, ScheduleEventType, UserSettings } from '../types';

// ── 定数 ─────────────────────────────────────────────────────────────────────
const C = {
  ink:    '#1c1f22',
  steel:  '#2f363d',
  ainezu: '#4a5560',
  kawara: '#6b7178',
  rust:   '#c0492f',
  paper:  '#f7f5f1',
  line:   '#d8d4cc',
};

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

const DEFAULT_TYPES: ScheduleEventType[] = [
  { id: 'jotou',     label: '新築上棟',   color: '#c0492f', order: 0 },
  { id: 'shinchiku', label: '新築工事',   color: '#4a5560', order: 1 },
  { id: 'shuri',     label: '修理',       color: '#5a7d52', order: 2 },
  { id: 'uchiawase', label: '打ち合わせ', color: '#b8860b', order: 3 },
  { id: 'sonota',    label: 'その他',     color: '#6b7178', order: 4 },
];

const TYPE_COLOR_PRESETS = [
  '#c0492f', '#4a5560', '#5a7d52', '#b8860b',
  '#6b7178', '#1e6a9e', '#7c3aed', '#b45309',
];

// ── ヘルパー ──────────────────────────────────────────────────────────────────
function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── モーダル用フォーム初期値 ──────────────────────────────────────────────────
interface FormState {
  title: string;
  typeId: string;
  date: string;
  time: string;
  projectId: string;
  projectName: string;
}
const emptyForm = (date: string, defaultTypeId: string): FormState => ({
  title: '', typeId: defaultTypeId, date, time: '', projectId: '', projectName: '',
});

// ── コンポーネント ────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const navigate = useNavigate();

  const today = toDateStr(new Date());
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [eventTypes, setEventTypes] = useState<ScheduleEventType[]>(DEFAULT_TYPES);
  const [events, setEvents]           = useState<ScheduleEvent[]>([]);
  const [filter, setFilter]           = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [loading, setLoading]         = useState(true);
  const [refreshKey, setRefreshKey]   = useState(0);

  // モーダル
  const [modalMode, setModalMode]     = useState<'add' | 'edit' | null>(null);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [form, setForm]               = useState<FormState>(emptyForm(today, DEFAULT_TYPES[0].id));
  const [saving, setSaving]           = useState(false);

  // 物件一覧（モーダル用・初回のみ読み込み）
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  // 種類管理モーダル
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [typeForm, setTypeForm] = useState({ id: '', label: '', color: TYPE_COLOR_PRESETS[0], isEditing: false });
  const [typeSaving, setTypeSaving] = useState(false);

  // ── ユーザー設定から予定種類を読み込む ──────────────────────────────────
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then(snap => {
      if (!snap.exists()) return;
      const data = snap.data() as UserSettings;
      if (data.scheduleEventTypes && data.scheduleEventTypes.length > 0) {
        setEventTypes([...data.scheduleEventTypes].sort((a, b) => a.order - b.order));
      }
    }).catch(() => {});
  }, []);

  // ── 当月の予定を読み込む ─────────────────────────────────────────────────
  const fetchEvents = useCallback(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoading(true);
    const yearMonth = toYearMonth(currentDate);
    const q = query(
      collection(db, 'scheduleEvents'),
      where('userId', '==', uid),
      where('yearMonth', '==', yearMonth),
    );
    getDocs(q)
      .then(snap => {
        const evs: ScheduleEvent[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as ScheduleEvent));
        evs.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
        setEvents(evs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentDate]);

  useEffect(() => { fetchEvents(); }, [fetchEvents, refreshKey]);

  // ── 物件一覧を読み込む（モーダル初回オープン時のみ） ─────────────────────
  const loadProjects = useCallback(() => {
    if (projectsLoaded) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const q = query(collection(db, 'projects'), where('userId', '==', uid));
    getDocs(q).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, name: (d.data() as { projectName?: string }).projectName ?? '' }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setProjects(list);
      setProjectsLoaded(true);
    }).catch(() => {});
  }, [projectsLoaded]);

  // ── カレンダー計算 ───────────────────────────────────────────────────────
  const year    = currentDate.getFullYear();
  const month   = currentDate.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const numDays  = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= numDays; d++) cells.push(d);

  const dateStrOf = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const eventsOfDate = (dateStr: string) =>
    events.filter(e => e.date === dateStr && (!filter || e.typeId === filter));

  const typeOf = (typeId: string): ScheduleEventType =>
    eventTypes.find(t => t.id === typeId) ?? { id: '', label: 'その他', color: C.kawara, order: 99 };

  const selectedEvents = eventsOfDate(selectedDate);

  const goPrev = () => {
    const d = new Date(year, month - 1, 1);
    setCurrentDate(d);
    setSelectedDate(toDateStr(d));
  };
  const goNext = () => {
    const d = new Date(year, month + 1, 1);
    setCurrentDate(d);
    setSelectedDate(toDateStr(d));
  };

  const [selYear, selMonth, selDay] = selectedDate.split('-').map(Number);
  const selDow = new Date(selYear, selMonth - 1, selDay).getDay();

  // ── モーダル操作 ─────────────────────────────────────────────────────────
  const openAdd = () => {
    loadProjects();
    setForm(emptyForm(selectedDate, eventTypes[0]?.id ?? ''));
    setEditingEvent(null);
    setModalMode('add');
  };

  const openEdit = (e: ScheduleEvent) => {
    loadProjects();
    setForm({
      title: e.title,
      typeId: e.typeId,
      date: e.date,
      time: e.time ?? '',
      projectId: e.projectId ?? '',
      projectName: e.projectName ?? '',
    });
    setEditingEvent(e);
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingEvent(null);
  };

  const handleProjectChange = (id: string) => {
    const p = projects.find(p => p.id === id);
    setForm(f => ({ ...f, projectId: id, projectName: p?.name ?? '' }));
  };

  // ── 保存 ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !form.title.trim() || !form.typeId || !form.date) return;
    setSaving(true);
    try {
      const yearMonth = form.date.slice(0, 7);
      const payload: Omit<ScheduleEvent, 'id'> = {
        userId: uid,
        yearMonth,
        date: form.date,
        title: form.title.trim(),
        typeId: form.typeId,
        createdAt: editingEvent?.createdAt ?? new Date().toISOString(),
        ...(form.time     ? { time: form.time }                           : {}),
        ...(form.projectId ? { projectId: form.projectId, projectName: form.projectName } : {}),
      };
      if (modalMode === 'add') {
        await addDoc(collection(db, 'scheduleEvents'), payload);
      } else if (editingEvent?.id) {
        await updateDoc(doc(db, 'scheduleEvents', editingEvent.id), payload);
      }
      // 保存した日付が当月でない場合は当月に切り替える
      const savedMonth = new Date(form.date.slice(0, 7) + '-01');
      if (toYearMonth(savedMonth) !== toYearMonth(currentDate)) {
        setCurrentDate(new Date(savedMonth.getFullYear(), savedMonth.getMonth(), 1));
      }
      setSelectedDate(form.date);
      setRefreshKey(k => k + 1);
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  // ── 削除 ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!editingEvent?.id) return;
    if (!window.confirm('この予定を削除しますか？')) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'scheduleEvents', editingEvent.id));
      setRefreshKey(k => k + 1);
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  // ── 種類管理 ─────────────────────────────────────────────────────────────
  const resetTypeForm = () =>
    setTypeForm({ id: '', label: '', color: TYPE_COLOR_PRESETS[0], isEditing: false });

  const openTypeModal = () => { resetTypeForm(); setTypeModalOpen(true); };

  const startEditType = (t: ScheduleEventType) =>
    setTypeForm({ id: t.id, label: t.label, color: t.color, isEditing: true });

  const handleSaveType = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !typeForm.label.trim()) return;
    setTypeSaving(true);
    try {
      let updated: ScheduleEventType[];
      if (typeForm.isEditing) {
        updated = eventTypes.map(t =>
          t.id === typeForm.id ? { ...t, label: typeForm.label.trim(), color: typeForm.color } : t
        );
      } else {
        const newType: ScheduleEventType = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          label: typeForm.label.trim(),
          color: typeForm.color,
          order: eventTypes.length,
        };
        updated = [...eventTypes, newType];
      }
      await updateDoc(doc(db, 'users', uid), { scheduleEventTypes: updated });
      setEventTypes(updated);
      resetTypeForm();
    } finally {
      setTypeSaving(false);
    }
  };

  const handleDeleteType = async (typeId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (!window.confirm('この種類を削除しますか？\n（この種類の予定の色はグレーになります）')) return;
    const updated = eventTypes
      .filter(t => t.id !== typeId)
      .map((t, i) => ({ ...t, order: i }));
    await updateDoc(doc(db, 'users', uid), { scheduleEventTypes: updated });
    setEventTypes(updated);
    if (typeForm.id === typeId) resetTypeForm();
  };

  // ── 描画 ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: C.steel, minHeight: '100vh', paddingBottom: 40,
      fontFamily: '"Hiragino Sans","Hiragino Kaku Gothic ProN",-apple-system,sans-serif',
    }}>
      <style>{`
        .cal-btn  { font-family: inherit; cursor: pointer; border: none; background: transparent; padding: 0; }
        .cal-cell { font-family: inherit; background: transparent; text-align: left; }
        .cal-cell:active { opacity: .7; }
        .cal-filter:active { opacity: .8; }
        .cal-input {
          width: 100%; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.14);
          border-radius: 8px; color: #f0ede8; font-size: 15px; padding: 10px 12px;
          font-family: inherit; outline: none; box-sizing: border-box;
        }
        .cal-input:focus { border-color: #c0492f; }
        .cal-select {
          width: 100%; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.14);
          border-radius: 8px; color: #f0ede8; font-size: 15px; padding: 10px 12px;
          font-family: inherit; outline: none; appearance: none; box-sizing: border-box;
        }
        .cal-select:focus { border-color: #c0492f; }
        .cal-select option { background: #1c1f22; color: #f0ede8; }
      `}</style>

      {/* ── ヘッダー ── */}
      <div style={{ background: C.ink, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="cal-btn" onClick={() => navigate('/')}
          style={{ background: 'rgba(255,255,255,.08)', borderRadius: 8,
            padding: '6px 10px', color: '#9aa3ac', fontSize: 13, fontWeight: 800 }}>
          ← 戻る
        </button>
        <div style={{ width: 5, height: 30, background: C.rust, borderRadius: 2 }} />
        <div>
          <div style={{ fontSize: 9, letterSpacing: '.2em', color: '#9aa3ac', fontWeight: 800 }}>スケジュール</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: C.paper }}>{year}年 {month + 1}月</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="cal-btn" onClick={goPrev}
            style={{ background: 'rgba(255,255,255,.08)', borderRadius: 8,
              width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#9aa3ac' }}>
            <ChevronLeft size={18} />
          </button>
          <button className="cal-btn" onClick={goNext}
            style={{ background: 'rgba(255,255,255,.08)', borderRadius: 8,
              width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#9aa3ac' }}>
            <ChevronRight size={18} />
          </button>
          <button className="cal-btn" onClick={openAdd}
            style={{ background: C.rust, color: '#fff', borderRadius: 8,
              padding: '8px 14px', fontSize: 13, fontWeight: 800 }}>
            ＋ 予定追加
          </button>
        </div>
      </div>

      {/* ── 種類フィルタ ── */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px', overflowX: 'auto',
        background: 'rgba(28,31,34,.6)' }}>
        {eventTypes.map(t => (
          <button key={t.id} className="cal-btn cal-filter"
            onClick={() => setFilter(filter === t.id ? null : t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, borderRadius: 20,
              padding: '5px 12px', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap',
              background: filter === t.id ? t.color : 'rgba(255,255,255,.08)',
              color: filter === t.id ? '#fff' : '#c9ced4' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: t.color, display: 'inline-block' }} />
            {t.label}
          </button>
        ))}
        <button className="cal-btn cal-filter" onClick={openTypeModal}
          style={{ borderRadius: 20, padding: '5px 12px', fontSize: 11.5, fontWeight: 800,
            background: 'rgba(255,255,255,.08)', color: '#9aa3ac', whiteSpace: 'nowrap' }}>
          ＋ 種類を追加
        </button>
      </div>

      {/* ── 月間カレンダー ── */}
      <div style={{ margin: '10px 12px', background: C.paper, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)',
          borderBottom: `2px solid ${C.ink}` }}>
          {DAYS.map((d, i) => (
            <div key={d} style={{ textAlign: 'center', padding: '7px 0', fontSize: 11, fontWeight: 800,
              color: i === 0 ? C.rust : i === 6 ? C.ainezu : C.kawara }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {cells.map((d, i) => {
            const col     = i % 7;
            const dateStr = d ? dateStrOf(d) : '';
            const evs     = d ? eventsOfDate(dateStr) : [];
            const isSel   = dateStr === selectedDate;
            const isToday = dateStr === today;
            return (
              <button key={i} className="cal-cell"
                onClick={() => { if (d) setSelectedDate(dateStr); }}
                style={{
                  minHeight: 58, padding: '4px 3px', cursor: d ? 'pointer' : 'default',
                  background: isSel ? '#eee9df' : 'transparent',
                  borderTop: 'none', borderLeft: 'none',
                  borderRight: col < 6 ? `1px solid ${C.line}` : 'none',
                  borderBottom: `1px solid ${C.line}`,
                  outline: isSel ? `2px solid ${C.rust}` : 'none',
                  outlineOffset: -2,
                }}>
                {d && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800,
                      color: col === 0 ? C.rust : col === 6 ? C.ainezu : C.ink,
                      textDecoration: isToday ? 'underline' : 'none', textUnderlineOffset: 2 }}>
                      {d}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                      {evs.slice(0, 2).map((e, j) => (
                        <div key={j} style={{ fontSize: 8, fontWeight: 700, color: '#fff',
                          background: typeOf(e.typeId).color, borderRadius: 3,
                          padding: '1px 3px', overflow: 'hidden', whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis' }}>
                          {e.title}
                        </div>
                      ))}
                      {evs.length > 2 && (
                        <div style={{ fontSize: 8, color: C.kawara, fontWeight: 700 }}>
                          +{evs.length - 2}件
                        </div>
                      )}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 選択日の予定リスト ── */}
      <div style={{ margin: '0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 2px' }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: C.paper }}>{selMonth}/{selDay}</span>
          <span style={{ fontSize: 12, color: '#9aa3ac', fontWeight: 700 }}>({DAYS[selDow]}) の予定</span>
        </div>

        {loading ? (
          <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: 10, padding: 18,
            textAlign: 'center', color: '#9aa3ac', fontSize: 13 }}>読込中...</div>
        ) : selectedEvents.length === 0 ? (
          <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: 10, padding: 18,
            textAlign: 'center', color: '#9aa3ac', fontSize: 13 }}>予定なし</div>
        ) : (
          selectedEvents.map((e, i) => {
            const t = typeOf(e.typeId);
            return (
              <button key={e.id ?? i} className="cal-btn" onClick={() => openEdit(e)}
                style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center',
                  background: C.paper, borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                  textAlign: 'left' }}>
                <div style={{ width: 5, alignSelf: 'stretch', background: t.color, borderRadius: 3, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#fff',
                      background: t.color, borderRadius: 4, padding: '2px 8px' }}>
                      {t.label}
                    </span>
                    {e.time && <span style={{ fontSize: 12, color: C.kawara, fontWeight: 700 }}>{e.time}</span>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: C.ink, marginTop: 4 }}>{e.title}</div>
                  {e.projectId && e.projectName && (
                    <button className="cal-btn"
                      onClick={ev => { ev.stopPropagation(); navigate(`/project/${e.projectId}`); }}
                      style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: C.ainezu,
                        background: '#e7e3da', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                      📁 {e.projectName} の台帳・工程表を開く →
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.kawara, flexShrink: 0 }}>編集</div>
              </button>
            );
          })
        )}
      </div>

      {/* ── 予定追加・編集モーダル ── */}
      {modalMode && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          {/* 背景 */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} onClick={closeModal} />
          {/* パネル */}
          <div style={{ position: 'relative', background: C.ink, borderRadius: '16px 16px 0 0',
            maxHeight: '90vh', overflowY: 'auto', padding: '20px 16px 40px' }}>
            {/* タイトルバー */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: C.paper }}>
                {modalMode === 'add' ? '予定を追加' : '予定を編集'}
              </div>
              <button className="cal-btn" onClick={closeModal}
                style={{ color: '#9aa3ac', display: 'flex', alignItems: 'center' }}>
                <X size={22} />
              </button>
            </div>

            {/* 種類 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#9aa3ac',
                letterSpacing: '.1em', marginBottom: 8 }}>種類 *</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {eventTypes.map(t => (
                  <button key={t.id} className="cal-btn"
                    onClick={() => setForm(f => ({ ...f, typeId: t.id }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, borderRadius: 20,
                      padding: '6px 14px', fontSize: 12, fontWeight: 800,
                      background: form.typeId === t.id ? t.color : 'rgba(255,255,255,.08)',
                      color: form.typeId === t.id ? '#fff' : '#c9ced4',
                      border: form.typeId === t.id ? 'none' : '1px solid rgba(255,255,255,.1)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: t.color, display: 'inline-block' }} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* タイトル */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#9aa3ac',
                letterSpacing: '.1em', marginBottom: 6 }}>タイトル *</div>
              <input className="cal-input" type="text" placeholder="例：山田様邸 上棟"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>

            {/* 日付・時刻 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#9aa3ac',
                  letterSpacing: '.1em', marginBottom: 6 }}>日付 *</div>
                <input className="cal-input" type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#9aa3ac',
                  letterSpacing: '.1em', marginBottom: 6 }}>時刻（任意）</div>
                <input className="cal-input" type="time"
                  value={form.time}
                  onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
              </div>
            </div>

            {/* 物件 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#9aa3ac',
                letterSpacing: '.1em', marginBottom: 6 }}>物件（任意）</div>
              <select className="cal-select"
                value={form.projectId}
                onChange={e => handleProjectChange(e.target.value)}>
                <option value="">紐付けなし</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* ボタン行 */}
            <div style={{ display: 'flex', gap: 10 }}>
              {modalMode === 'edit' && (
                <button className="cal-btn" onClick={handleDelete} disabled={saving}
                  style={{ flex: '0 0 auto', padding: '13px 18px', borderRadius: 10,
                    background: 'rgba(192,73,47,.18)', color: '#f87171',
                    fontSize: 14, fontWeight: 800, border: '1px solid rgba(192,73,47,.35)' }}>
                  削除
                </button>
              )}
              <button className="cal-btn" onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.typeId || !form.date}
                style={{ flex: 1, padding: '13px 0', borderRadius: 10,
                  background: (saving || !form.title.trim() || !form.typeId || !form.date)
                    ? 'rgba(192,73,47,.4)' : C.rust,
                  color: '#fff', fontSize: 14, fontWeight: 900 }}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── 種類管理モーダル ── */}
      {typeModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }}
            onClick={() => { setTypeModalOpen(false); resetTypeForm(); }} />
          <div style={{ position: 'relative', background: C.ink, borderRadius: '16px 16px 0 0',
            maxHeight: '85vh', overflowY: 'auto', padding: '20px 16px 40px' }}>
            {/* タイトルバー */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: C.paper }}>予定の種類</div>
              <button className="cal-btn" onClick={() => { setTypeModalOpen(false); resetTypeForm(); }}
                style={{ color: '#9aa3ac', display: 'flex', alignItems: 'center' }}>
                <X size={22} />
              </button>
            </div>

            {/* 種類リスト */}
            {eventTypes.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10, marginBottom: 6,
                background: typeForm.isEditing && typeForm.id === t.id
                  ? 'rgba(192,73,47,.12)' : 'rgba(255,255,255,.05)' }}>
                <span style={{ width: 12, height: 12, borderRadius: 6, background: t.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.paper }}>{t.label}</span>
                <button className="cal-btn" onClick={() => startEditType(t)}
                  style={{ fontSize: 11, fontWeight: 800, color: C.ainezu, padding: '4px 10px',
                    background: 'rgba(74,85,96,.25)', borderRadius: 6 }}>
                  編集
                </button>
                <button className="cal-btn" onClick={() => handleDeleteType(t.id)}
                  style={{ fontSize: 11, fontWeight: 800, color: '#f87171', padding: '4px 10px',
                    background: 'rgba(192,73,47,.15)', borderRadius: 6 }}>
                  削除
                </button>
              </div>
            ))}

            {/* 追加・編集フォーム */}
            <div style={{ marginTop: 18, paddingTop: 16,
              borderTop: '1px solid rgba(255,255,255,.1)' }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#9aa3ac',
                letterSpacing: '.05em', marginBottom: 10 }}>
                {typeForm.isEditing ? `「${typeForm.label || '…'}」を編集` : '新しい種類を追加'}
              </div>
              <input className="cal-input" type="text" placeholder="種類名（例：新築上棟）"
                value={typeForm.label}
                onChange={e => setTypeForm(f => ({ ...f, label: e.target.value }))}
                style={{ marginBottom: 12 }} />
              {/* カラープリセット */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {TYPE_COLOR_PRESETS.map(c => (
                  <button key={c} className="cal-btn"
                    onClick={() => setTypeForm(f => ({ ...f, color: c }))}>
                    <span style={{ display: 'block', width: 30, height: 30, borderRadius: 15,
                      background: c, outline: typeForm.color === c ? '3px solid #fff' : 'none',
                      outlineOffset: 2 }} />
                  </button>
                ))}
              </div>
              {/* ボタン行 */}
              <div style={{ display: 'flex', gap: 8 }}>
                {typeForm.isEditing && (
                  <button className="cal-btn" onClick={resetTypeForm}
                    style={{ flex: '0 0 auto', padding: '11px 16px', borderRadius: 10,
                      background: 'rgba(255,255,255,.06)', color: '#9aa3ac',
                      fontSize: 13, fontWeight: 800 }}>
                    キャンセル
                  </button>
                )}
                <button className="cal-btn" onClick={handleSaveType}
                  disabled={typeSaving || !typeForm.label.trim()}
                  style={{ flex: 1, padding: '11px 0', borderRadius: 10,
                    fontSize: 13, fontWeight: 900, color: '#fff',
                    background: (typeSaving || !typeForm.label.trim())
                      ? 'rgba(192,73,47,.4)' : C.rust }}>
                  {typeSaving ? '保存中...' : typeForm.isEditing ? '更新' : '追加'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
