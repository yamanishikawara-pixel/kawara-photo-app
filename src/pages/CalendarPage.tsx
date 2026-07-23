import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
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

// ── ヘルパー ──────────────────────────────────────────────────────────────────
function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

  // 予定の種類をユーザー設定から読み込む
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

  // 当月の予定を読み込む（月が変わるたびに再取得）
  useEffect(() => {
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

  // ── カレンダー計算 ───────────────────────────────────────────────────────
  const year    = currentDate.getFullYear();
  const month   = currentDate.getMonth(); // 0-indexed
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

  // ── 選択日のヘッダー表示用 ───────────────────────────────────────────────
  const [selYear, selMonth, selDay] = selectedDate.split('-').map(Number);
  const selDow = new Date(selYear, selMonth - 1, selDay).getDay();

  // ── 描画 ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: C.steel, minHeight: '100vh', paddingBottom: 40,
      fontFamily: '"Hiragino Sans","Hiragino Kaku Gothic ProN",-apple-system,sans-serif',
    }}>
      <style>{`
        .cal-btn { font-family: inherit; cursor: pointer; border: none; background: transparent; padding: 0; }
        .cal-cell { font-family: inherit; background: transparent; text-align: left; }
        .cal-cell:active { opacity: .7; }
        .cal-filter:active { opacity: .8; }
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
          {/* 段階③で有効化 */}
          <button className="cal-btn"
            style={{ background: C.rust, color: '#fff', borderRadius: 8,
              padding: '8px 14px', fontSize: 13, fontWeight: 800, opacity: .5, cursor: 'default' }}>
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
        {/* 段階④で有効化 */}
        <button className="cal-btn"
          style={{ borderRadius: 20, padding: '5px 12px', fontSize: 11.5, fontWeight: 800,
            background: 'rgba(255,255,255,.08)', color: '#9aa3ac', whiteSpace: 'nowrap',
            opacity: .5, cursor: 'default' }}>
          ＋ 種類を追加
        </button>
      </div>

      {/* ── 月間カレンダー ── */}
      <div style={{ margin: '10px 12px', background: C.paper, borderRadius: 10, overflow: 'hidden' }}>
        {/* 曜日ヘッダー */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)',
          borderBottom: `2px solid ${C.ink}` }}>
          {DAYS.map((d, i) => (
            <div key={d} style={{ textAlign: 'center', padding: '7px 0', fontSize: 11, fontWeight: 800,
              color: i === 0 ? C.rust : i === 6 ? C.ainezu : C.kawara }}>
              {d}
            </div>
          ))}
        </div>
        {/* 日付グリッド */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {cells.map((d, i) => {
            const col = i % 7;
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
                      textDecoration: isToday ? 'underline' : 'none',
                      textUnderlineOffset: 2 }}>
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
          <span style={{ fontSize: 20, fontWeight: 900, color: C.paper }}>
            {selMonth}/{selDay}
          </span>
          <span style={{ fontSize: 12, color: '#9aa3ac', fontWeight: 700 }}>
            ({DAYS[selDow]}) の予定
          </span>
        </div>

        {loading ? (
          <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: 10, padding: 18,
            textAlign: 'center', color: '#9aa3ac', fontSize: 13 }}>
            読込中...
          </div>
        ) : selectedEvents.length === 0 ? (
          <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: 10, padding: 18,
            textAlign: 'center', color: '#9aa3ac', fontSize: 13 }}>
            予定なし
          </div>
        ) : (
          selectedEvents.map((e, i) => {
            const t = typeOf(e.typeId);
            return (
              <div key={e.id ?? i} style={{ background: C.paper, borderRadius: 10,
                padding: '12px 14px', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 5, alignSelf: 'stretch', background: t.color, borderRadius: 3, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#fff',
                      background: t.color, borderRadius: 4, padding: '2px 8px' }}>
                      {t.label}
                    </span>
                    {e.time && (
                      <span style={{ fontSize: 12, color: C.kawara, fontWeight: 700 }}>{e.time}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: C.ink, marginTop: 4 }}>
                    {e.title}
                  </div>
                  {e.projectId && e.projectName && (
                    <button className="cal-btn"
                      onClick={() => navigate(`/project/${e.projectId}`)}
                      style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: C.ainezu,
                        background: '#e7e3da', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                      📁 {e.projectName} の台帳・工程表を開く →
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
