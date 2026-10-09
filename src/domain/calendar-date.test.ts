import { describe, expect, it } from "vitest";

import { assertValidCalendarDate, InvalidCalendarDateError } from "@/domain/calendar-date";

describe("assertValidCalendarDate", () => {
  it("accepts a valid YYYY-MM-DD date", () => {
    expect(() => assertValidCalendarDate("2026-09-05")).not.toThrow();
  });

  it("rejects a non-date string", () => {
    expect(() => assertValidCalendarDate("not-a-date")).toThrow(InvalidCalendarDateError);
  });

  it("rejects an out-of-range month or day", () => {
    expect(() => assertValidCalendarDate("2026-13-45")).toThrow(InvalidCalendarDateError);
  });

  it("rejects an empty string", () => {
    expect(() => assertValidCalendarDate("")).toThrow(InvalidCalendarDateError);
  });
});
