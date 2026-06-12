import { describe, it, expect } from "vitest";
import {
  fmt,
  parse,
  addDays,
  diffDays,
  holidayName,
  isOff,
  nextWorkday,
  prevWorkday,
  workdaySpan,
  countWorkdays,
} from "./workdays";

/* ============================================================
   営業日計算のユニットテスト
   仕様：休工日 = 日曜 + 日本の祝日（土曜は営業日）
   基準にしている事実：
   - 2026-06-12 は金曜、2026-06-14 は日曜
   - 2026年GW: 5/3(日)憲法記念日, 5/4(月)みどりの日, 5/5(火)こどもの日, 5/6(水)振替休日
     → 5/1(金), 5/2(土) は営業日、次の営業日は 5/7(木)
   ============================================================ */

describe("日付ユーティリティ", () => {
  it("fmt と parse が往復で一致する", () => {
    expect(fmt(parse("2026-06-12"))).toBe("2026-06-12");
    expect(fmt(parse("2025-01-01"))).toBe("2025-01-01");
  });

  it("addDays が月またぎを正しく処理する", () => {
    expect(fmt(addDays(parse("2026-01-31"), 1))).toBe("2026-02-01");
    expect(fmt(addDays(parse("2026-03-01"), -1))).toBe("2026-02-28");
  });

  it("diffDays が日数差を返す", () => {
    expect(diffDays(parse("2026-07-01"), parse("2026-06-01"))).toBe(30);
    expect(diffDays(parse("2026-06-01"), parse("2026-06-01"))).toBe(0);
  });
});

describe("休工日判定 isOff", () => {
  it("日曜は休工日", () => {
    expect(isOff(parse("2026-06-14"))).toBe(true); // 日曜
  });

  it("土曜は営業日（休工日ではない）", () => {
    expect(isOff(parse("2026-06-13"))).toBe(false); // 土曜
  });

  it("平日は営業日", () => {
    expect(isOff(parse("2026-06-12"))).toBe(false); // 金曜
  });

  it("平日の祝日は休工日", () => {
    expect(isOff(parse("2026-02-23"))).toBe(true); // 天皇誕生日（月曜）
    expect(holidayName(parse("2026-02-23"))).toBe("天皇誕生日");
  });

  it("振替休日・国民の休日も休工日", () => {
    expect(isOff(parse("2025-11-24"))).toBe(true); // 振替休日
    expect(isOff(parse("2026-09-22"))).toBe(true); // 国民の休日
  });
});

describe("nextWorkday / prevWorkday", () => {
  it("営業日を渡すとその日自身を返す", () => {
    expect(fmt(nextWorkday(parse("2026-06-12")))).toBe("2026-06-12");
    expect(fmt(prevWorkday(parse("2026-06-12")))).toBe("2026-06-12");
  });

  it("GW連休（5/3〜5/6）を渡すと連休明け・連休前の営業日へスナップする", () => {
    expect(fmt(nextWorkday(parse("2026-05-03")))).toBe("2026-05-07");
    expect(fmt(prevWorkday(parse("2026-05-06")))).toBe("2026-05-02"); // 土曜は営業日
  });

  it("日曜を渡すと月曜（または翌営業日）を返す", () => {
    expect(fmt(nextWorkday(parse("2026-06-14")))).toBe("2026-06-15");
  });
});

describe("workdaySpan（実働日リスト）", () => {
  it("日曜をスキップして実働日数分の日付を返す", () => {
    // 金・土は営業、日曜スキップ、月曜
    const span = workdaySpan(parse("2026-06-12"), 3);
    expect(span.map(fmt)).toEqual(["2026-06-12", "2026-06-13", "2026-06-15"]);
  });

  it("GW連休（祝日3日＋振替）をまとめてスキップする", () => {
    const span = workdaySpan(parse("2026-05-01"), 3);
    expect(span.map(fmt)).toEqual(["2026-05-01", "2026-05-02", "2026-05-07"]);
  });

  it("開始日が休日の場合、最初の営業日から開始する", () => {
    const span = workdaySpan(parse("2026-05-03"), 1);
    expect(span.map(fmt)).toEqual(["2026-05-07"]);
  });

  it("実働1日なら1要素を返す", () => {
    expect(workdaySpan(parse("2026-06-12"), 1)).toHaveLength(1);
  });
});

describe("countWorkdays（期間内の実働日数）", () => {
  it("日曜を除いて数える", () => {
    // 6/12(金)〜6/15(月): 金・土・月 = 3日（日曜除外）
    expect(countWorkdays(parse("2026-06-12"), parse("2026-06-15"))).toBe(3);
  });

  it("GWをまたぐ期間で祝日・振替を除外する", () => {
    // 5/1(金)〜5/7(木): 営業日は 5/1, 5/2, 5/7 の3日
    expect(countWorkdays(parse("2026-05-01"), parse("2026-05-07"))).toBe(3);
  });

  it("workdaySpan と整合する（spanの先頭〜末尾を数えるとduration に一致）", () => {
    const duration = 5;
    const span = workdaySpan(parse("2026-04-27"), duration); // GW直前開始
    expect(countWorkdays(span[0], span[span.length - 1])).toBe(duration);
  });

  it("from と to が同じ営業日なら1", () => {
    expect(countWorkdays(parse("2026-06-12"), parse("2026-06-12"))).toBe(1);
  });

  it("from と to が同じ休日なら0", () => {
    expect(countWorkdays(parse("2026-06-14"), parse("2026-06-14"))).toBe(0);
  });
});
