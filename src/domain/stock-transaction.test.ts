import { describe, expect, it } from "vitest";

import {
  assertSufficientHoldingsForSale,
  InsufficientHoldingsError,
  InvalidStockQuantityError,
  parseWholeShareQuantity
} from "@/domain/stock-transaction";

describe("parseWholeShareQuantity", () => {
  it("parses a positive whole-number string", () => {
    expect(parseWholeShareQuantity("10")).toBe(10);
  });

  it("rejects zero", () => {
    expect(() => parseWholeShareQuantity("0")).toThrow(InvalidStockQuantityError);
  });

  it("rejects a fractional quantity", () => {
    expect(() => parseWholeShareQuantity("10.5")).toThrow(InvalidStockQuantityError);
  });

  it("rejects a negative quantity", () => {
    expect(() => parseWholeShareQuantity("-10")).toThrow(InvalidStockQuantityError);
  });

  it("rejects non-numeric input", () => {
    expect(() => parseWholeShareQuantity("ten")).toThrow(InvalidStockQuantityError);
  });
});

describe("assertSufficientHoldingsForSale", () => {
  it("accepts a Sell quantity equal to the current holding", () => {
    expect(() => assertSufficientHoldingsForSale("RELIANCE", 10, 10)).not.toThrow();
  });

  it("accepts a Sell quantity less than the current holding", () => {
    expect(() => assertSufficientHoldingsForSale("RELIANCE", 10, 4)).not.toThrow();
  });

  it("rejects a Sell quantity greater than the current holding", () => {
    expect(() => assertSufficientHoldingsForSale("RELIANCE", 10, 11)).toThrow(InsufficientHoldingsError);
  });

  it("rejects any Sell when nothing is currently held", () => {
    expect(() => assertSufficientHoldingsForSale("RELIANCE", 0, 1)).toThrow(InsufficientHoldingsError);
  });
});
