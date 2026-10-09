import { describe, expect, it } from "vitest";

import { nextDestinationAmountOnCurrencyChange } from "@/app/transfers/new/transfer-amount-sync";

describe("nextDestinationAmountOnCurrencyChange", () => {
  it("clears a stale mirrored amount when the legs stop sharing a currency", () => {
    expect(nextDestinationAmountOnCurrencyChange(true, false, "5000")).toBe("");
  });

  it("leaves the amount alone when the legs still share a currency", () => {
    expect(nextDestinationAmountOnCurrencyChange(true, true, "5000")).toBe("5000");
  });

  it("leaves a manually entered cross-currency amount alone on an unrelated change", () => {
    expect(nextDestinationAmountOnCurrencyChange(false, false, "4200")).toBe("4200");
  });

  it("leaves the amount alone when legs newly start sharing a currency", () => {
    expect(nextDestinationAmountOnCurrencyChange(false, true, "4200")).toBe("4200");
  });
});
