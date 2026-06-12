/* ============================================================
   workdays.ts — 日付・祝日・営業日計算ユーティリティ
   工程表の休工日（日曜・祝日）判定はすべてこのモジュールに集約する。
   ロジックを変更した場合は workdays.test.ts も必ず更新すること。
   ============================================================ */

// ---------- 日付ユーティリティ ----------
export const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

export const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (date: Date, n: number) => {
  const x = new Date(date);
  x.setDate(x.getDate() + n);
  return x;
};

export const diffDays = (a: Date, b: Date) =>
  Math.round((a.getTime() - b.getTime()) / 86400000);

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// ---------- 日本の祝日（2025〜2027年・振替休日含む） ----------
export const HOLIDAY_YEAR_MIN = 2025;
export const HOLIDAY_YEAR_MAX = 2027;

export const HOLIDAYS: Record<string, string> = {
  // 2025
  "2025-01-01": "元日", "2025-01-13": "成人の日", "2025-02-11": "建国記念の日",
  "2025-02-23": "天皇誕生日", "2025-02-24": "振替休日", "2025-03-20": "春分の日",
  "2025-04-29": "昭和の日", "2025-05-03": "憲法記念日", "2025-05-04": "みどりの日",
  "2025-05-05": "こどもの日", "2025-05-06": "振替休日", "2025-07-21": "海の日",
  "2025-08-11": "山の日", "2025-09-15": "敬老の日", "2025-09-23": "秋分の日",
  "2025-10-13": "スポーツの日", "2025-11-03": "文化の日", "2025-11-23": "勤労感謝の日",
  "2025-11-24": "振替休日",
  // 2026
  "2026-01-01": "元日", "2026-01-12": "成人の日", "2026-02-11": "建国記念の日",
  "2026-02-23": "天皇誕生日", "2026-03-20": "春分の日", "2026-04-29": "昭和の日",
  "2026-05-03": "憲法記念日", "2026-05-04": "みどりの日", "2026-05-05": "こどもの日",
  "2026-05-06": "振替休日", "2026-07-20": "海の日", "2026-08-11": "山の日",
  "2026-09-21": "敬老の日", "2026-09-22": "国民の休日", "2026-09-23": "秋分の日",
  "2026-10-12": "スポーツの日", "2026-11-03": "文化の日", "2026-11-23": "勤労感謝の日",
  // 2027
  "2027-01-01": "元日", "2027-01-11": "成人の日", "2027-02-11": "建国記念の日",
  "2027-02-23": "天皇誕生日", "2027-03-21": "春分の日", "2027-03-22": "振替休日",
  "2027-04-29": "昭和の日", "2027-05-03": "憲法記念日", "2027-05-04": "みどりの日",
  "2027-05-05": "こどもの日", "2027-07-19": "海の日", "2027-08-11": "山の日",
  "2027-09-20": "敬老の日", "2027-09-23": "秋分の日", "2027-10-11": "スポーツの日",
  "2027-11-03": "文化の日", "2027-11-23": "勤労感謝の日",
};

export const holidayName = (date: Date) => HOLIDAYS[fmt(date)] || null;

// ---------- 休日（日曜・祝日）を除いた営業日計算 ----------

export interface WorkdayConfig {
  saturdayOff: boolean;
  customHolidays: string[]; // YYYY-MM-DD
}

export const DEFAULT_WORKDAY_CONFIG: WorkdayConfig = {
  saturdayOff: false,
  customHolidays: [],
};

/** 休工日かどうか（日曜 または 祝日）。休日判定はこの関数に一本化する。 */
export const isOff = (date: Date, config: WorkdayConfig = DEFAULT_WORKDAY_CONFIG) => {
  const dow = date.getDay();
  if (dow === 0) return true;
  if (config.saturdayOff && dow === 6) return true;
  if (holidayName(date)) return true;
  return config.customHolidays.includes(fmt(date));
};

/** date 以降（date 含む）で最初の営業日 */
export const nextWorkday = (date: Date, config: WorkdayConfig = DEFAULT_WORKDAY_CONFIG) => {
  let d = new Date(date);
  while (isOff(d, config)) d = addDays(d, 1);
  return d;
};

/** date 以前（date 含む）で最後の営業日 */
export const prevWorkday = (date: Date, config: WorkdayConfig = DEFAULT_WORKDAY_CONFIG) => {
  let d = new Date(date);
  while (isOff(d, config)) d = addDays(d, -1);
  return d;
};

/** 開始日から実働 workDays 日分の日付リスト（休日はスキップ）。workDays は 1 以上を渡すこと。 */
export const workdaySpan = (
  startDate: Date,
  workDays: number,
  config: WorkdayConfig = DEFAULT_WORKDAY_CONFIG
) => {
  const out: Date[] = [];
  let d = new Date(startDate);
  while (out.length < workDays) {
    if (!isOff(d, config)) out.push(new Date(d));
    d = addDays(d, 1);
  }
  return out;
};

/** from〜to（両端含む）の実働日数 */
export const countWorkdays = (
  from: Date,
  to: Date,
  config: WorkdayConfig = DEFAULT_WORKDAY_CONFIG
) => {
  let c = 0;
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) if (!isOff(d, config)) c++;
  return c;
};
