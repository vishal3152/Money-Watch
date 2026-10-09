import { describe, expect, it } from "vitest";

import { parseDecimalToMinorUnits, parsePercentageToBps } from "@/domain/decimal-input";
import { InvalidMinorUnitsError } from "@/domain/money";

describe("parseDecimalToMinorUnits", () => {
  it("parses a two-decimal currency amount exactly", () => {
    expect(parseDecimalToMinorUnits("-1234.56", "INR")).toBe(-123456);
  });

  it("parses a zero-decimal currency amount", () => {
    expect(parseDecimalToMinorUnits("1234", "JPY")).toBe(1234);
  });

  it("rejects too many decimal places for the currency", () => {
    expect(() => parseDecimalToMinorUnits("1.001", "USD")).toThrow(InvalidMinorUnitsError);
  });

  it("rejects non-numeric and overflowing input", () => {
    expect(() => parseDecimalToMinorUnits("12x", "USD")).toThrow(InvalidMinorUnitsError);
    expect(() => parseDecimalToMinorUnits("9007199254740992", "JPY")).toThrow(
      InvalidMinorUnitsError
    );
  });
});

describe("parsePercentageToBps", () => {
  it("parses a percentage into basis points", () => {
    expect(parsePercentageToBps("6.25")).toBe(625);
  });

  it("rejects negative and non-numeric percentages", () => {
    expect(() => parsePercentageToBps("-0.01")).toThrow(InvalidMinorUnitsError);
    expect(() => parsePercentageToBps("six")).toThrow(InvalidMinorUnitsError);
  });
});
