import { afterEach, describe, expect, it } from "vitest";

import { formatCalendarDate } from "@/app/format-calendar-date";

describe("formatCalendarDate", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("does not shift a plain calendar date into the previous day west of UTC", () => {
    // Naively doing new Date("2027-01-01").toLocaleDateString() in a
    // negative-UTC-offset zone renders "12/31/2026" — the UTC-midnight
    // instant reinterpreted in local time. formatCalendarDate must not.
    process.env.TZ = "Pacific/Honolulu"; // UTC-10
    const result = formatCalendarDate("2027-01-01");
    expect(result).not.toContain("2026");
    expect(result).toContain("2027");
  });

  it("does not shift a plain calendar date into the next day east of UTC", () => {
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14
    const result = formatCalendarDate("2026-12-31");
    expect(result).not.toContain("2027");
    expect(result).toContain("2026");
  });
});
