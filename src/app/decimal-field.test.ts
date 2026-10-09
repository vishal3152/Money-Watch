import { describe, expect, it } from "vitest";

import { sanitizeDecimalInput } from "@/app/decimal-field";

describe("sanitizeDecimalInput", () => {
  it("keeps a plain decimal amount", () => {
    expect(sanitizeDecimalInput("1234.56")).toBe("1234.56");
  });

  it("strips letters and other non-decimal characters", () => {
    expect(sanitizeDecimalInput("12abc.3def")).toBe("12.3");
    expect(sanitizeDecimalInput("₹1,000.50")).toBe("1000.50");
  });

  it("keeps only the first decimal point", () => {
    expect(sanitizeDecimalInput("12.3.4")).toBe("12.34");
  });

  it("allows a leading minus when signed amounts are enabled", () => {
    expect(sanitizeDecimalInput("-12.5", { allowNegative: true })).toBe("-12.5");
    expect(sanitizeDecimalInput("12-5", { allowNegative: true })).toBe("125");
    expect(sanitizeDecimalInput("--12", { allowNegative: true })).toBe("-12");
  });

  it("strips minus signs when signed amounts are disabled", () => {
    expect(sanitizeDecimalInput("-12.5")).toBe("12.5");
  });

  it("preserves in-progress values like a lone dot or trailing dot", () => {
    expect(sanitizeDecimalInput(".")).toBe(".");
    expect(sanitizeDecimalInput("0.")).toBe("0.");
    expect(sanitizeDecimalInput("")).toBe("");
  });
});
