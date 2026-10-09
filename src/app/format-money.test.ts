import { describe, expect, it } from "vitest";

import { formatRealizedFxRate } from "@/app/format-money";

describe("formatRealizedFxRate", () => {
  it("formats a finite rate with up to 6 fraction digits", () => {
    expect(formatRealizedFxRate(83.123456789)).toBe("83.123457");
  });

  it("renders a degenerate 0/0 rate as an em dash instead of NaN", () => {
    expect(formatRealizedFxRate(NaN)).toBe("—");
  });

  it("renders an infinite rate as an em dash instead of Infinity", () => {
    expect(formatRealizedFxRate(Infinity)).toBe("—");
  });
});
