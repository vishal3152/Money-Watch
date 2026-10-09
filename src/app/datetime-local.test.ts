import { describe, expect, it } from "vitest";

import { toDateInputValue, toDatetimeLocalValue } from "@/app/datetime-local";

describe("toDatetimeLocalValue", () => {
  it("formats local wall-clock without timezone suffix", () => {
    const value = toDatetimeLocalValue(new Date(2026, 8, 5, 14, 7));
    expect(value).toBe("2026-09-05T14:07");
  });
});

describe("toDateInputValue", () => {
  it("formats the local calendar date for an <input type=\"date\"> default", () => {
    // Late-night local time must not roll over to the next UTC day (the bug
    // new Date().toISOString().slice(0, 10) has east of UTC — or the previous
    // day, west of UTC).
    const value = toDateInputValue(new Date(2026, 8, 5, 23, 50));
    expect(value).toBe("2026-09-05");
  });
});
