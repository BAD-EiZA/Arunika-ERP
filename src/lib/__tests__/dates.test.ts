import {
  addDays,
  endOfDayUtc,
  formatDateId,
  formatDateTimeId,
  nowUtc,
  startOfDayUtc,
  yearMonth,
} from "@/lib/dates";

describe("dates", () => {
  it("nowUtc returns Date", () => {
    expect(nowUtc()).toBeInstanceOf(Date);
  });

  it("start and end of day utc", () => {
    const d = new Date("2026-07-14T15:30:00.000Z");
    const s = startOfDayUtc(d);
    const e = endOfDayUtc(d);
    expect(s.getUTCHours()).toBe(0);
    expect(s.getUTCMinutes()).toBe(0);
    expect(e.getUTCHours()).toBe(23);
    expect(e.getUTCMilliseconds()).toBe(999);
    expect(startOfDayUtc().getUTCHours()).toBe(0);
    expect(endOfDayUtc().getUTCHours()).toBe(23);
  });

  it("formatDateId handles empty and values", () => {
    expect(formatDateId(null)).toBe("-");
    expect(formatDateId(undefined)).toBe("-");
    expect(formatDateId("")).toBe("-");
    const s = formatDateId(new Date("2026-07-14T00:00:00.000Z"));
    expect(s).not.toBe("-");
    expect(formatDateId("2026-07-14T00:00:00.000Z")).not.toBe("-");
  });

  it("formatDateTimeId handles empty and values", () => {
    expect(formatDateTimeId(null)).toBe("-");
    expect(formatDateTimeId(undefined)).toBe("-");
    expect(formatDateTimeId(new Date("2026-07-14T10:15:00.000Z"))).not.toBe("-");
    expect(formatDateTimeId("2026-07-14T10:15:00.000Z")).not.toBe("-");
  });

  it("addDays", () => {
    const d = new Date("2026-07-14T00:00:00.000Z");
    expect(addDays(d, 2).getUTCDate()).toBe(16);
  });

  it("yearMonth formats YYYYMM", () => {
    const ym = yearMonth(new Date("2026-07-14T00:00:00.000Z"), "UTC");
    expect(ym).toBe("202607");
    expect(yearMonth()).toMatch(/^\d{6}$/);
  });

  });
