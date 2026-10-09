import { describe, expect, it } from "vitest";

import {
  assertValidTransferAmounts,
  assertValidTransferLegs,
  assertValidTransferPurpose,
  InvalidTransferAmountsError,
  InvalidTransferLegsError,
  InvalidTransferPurposeError,
  realizedFxRate
} from "@/domain/transfer";
import type { Transfer } from "@/domain/transfer";

function makeTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: "transfer-1",
    sourceAccountId: "acc-1",
    sourceFixedDepositId: null,
    sourceAmountMinor: 100_000,
    sourceCurrencyCode: "USD",
    destinationAccountId: "acc-2",
    destinationFixedDepositId: null,
    destinationAmountMinor: 8_300_000,
    destinationCurrencyCode: "INR",
    occurredAt: "2026-01-01T00:00:00.000Z",
    description: "USD to INR transfer",
    purpose: "general",
    ...overrides
  };
}

describe("assertValidTransferLegs", () => {
  it("accepts a transfer with exactly one account or fixed deposit per side", () => {
    expect(() => assertValidTransferLegs(makeTransfer())).not.toThrow();
  });

  it("rejects a source leg with neither an account nor a fixed deposit", () => {
    expect(() =>
      assertValidTransferLegs(makeTransfer({ sourceAccountId: null, sourceFixedDepositId: null }))
    ).toThrow(InvalidTransferLegsError);
  });

  it("rejects a source leg with both an account and a fixed deposit", () => {
    expect(() =>
      assertValidTransferLegs(makeTransfer({ sourceAccountId: "acc-1", sourceFixedDepositId: "fd-1" }))
    ).toThrow(InvalidTransferLegsError);
  });

  it("rejects a Transfer whose source and destination Account are the same", () => {
    expect(() =>
      assertValidTransferLegs(makeTransfer({ sourceAccountId: "acc-1", destinationAccountId: "acc-1" }))
    ).toThrow(InvalidTransferLegsError);
  });

  it("rejects a Transfer whose source and destination FixedDeposit are the same", () => {
    expect(() =>
      assertValidTransferLegs(
        makeTransfer({
          sourceAccountId: null,
          sourceFixedDepositId: "fd-1",
          destinationAccountId: null,
          destinationFixedDepositId: "fd-1"
        })
      )
    ).toThrow(InvalidTransferLegsError);
  });
});

describe("assertValidTransferPurpose", () => {
  it("accepts general purpose for account-to-account transfers", () => {
    expect(() => assertValidTransferPurpose(makeTransfer())).not.toThrow();
  });

  it("rejects non-general purpose for account-to-account transfers", () => {
    expect(() =>
      assertValidTransferPurpose(makeTransfer({ purpose: "fixed-deposit-opening" }))
    ).toThrow(InvalidTransferPurposeError);
  });

  it("accepts opening and top-up purposes for account-to-fixed-deposit transfers", () => {
    const base = makeTransfer({
      sourceAccountId: "acc-1",
      sourceFixedDepositId: null,
      destinationAccountId: null,
      destinationFixedDepositId: "fd-1"
    });

    expect(() =>
      assertValidTransferPurpose({ ...base, purpose: "fixed-deposit-opening" })
    ).not.toThrow();
    expect(() =>
      assertValidTransferPurpose({ ...base, purpose: "fixed-deposit-top-up" })
    ).not.toThrow();
  });

  it("requires withdrawal purpose for fixed-deposit-to-account transfers", () => {
    const base = makeTransfer({
      sourceAccountId: null,
      sourceFixedDepositId: "fd-1",
      destinationAccountId: "acc-2",
      destinationFixedDepositId: null
    });

    expect(() =>
      assertValidTransferPurpose({ ...base, purpose: "fixed-deposit-withdrawal" })
    ).not.toThrow();
    expect(() => assertValidTransferPurpose({ ...base, purpose: "general" })).toThrow(
      InvalidTransferPurposeError
    );
  });
});

describe("assertValidTransferAmounts", () => {
  it("rejects same-currency transfers whose leg amounts differ", () => {
    expect(() =>
      assertValidTransferAmounts(
        makeTransfer({
          sourceAmountMinor: 100_000,
          sourceCurrencyCode: "INR",
          destinationAmountMinor: 1,
          destinationCurrencyCode: "INR"
        })
      )
    ).toThrow(InvalidTransferAmountsError);
  });

  it("allows cross-currency transfers with different leg amounts", () => {
    expect(() => assertValidTransferAmounts(makeTransfer())).not.toThrow();
  });

  it("rejects non-positive amounts on FixedDeposit Transfers", () => {
    expect(() =>
      assertValidTransferAmounts(
        makeTransfer({
          sourceAccountId: "acc-1",
          sourceFixedDepositId: null,
          destinationAccountId: null,
          destinationFixedDepositId: "fd-1",
          sourceAmountMinor: 0,
          sourceCurrencyCode: "INR",
          destinationAmountMinor: 0,
          destinationCurrencyCode: "INR",
          purpose: "fixed-deposit-top-up"
        })
      )
    ).toThrow(InvalidTransferAmountsError);

    expect(() =>
      assertValidTransferAmounts(
        makeTransfer({
          sourceAccountId: null,
          sourceFixedDepositId: "fd-1",
          destinationAccountId: "acc-2",
          destinationFixedDepositId: null,
          sourceAmountMinor: -1_000,
          sourceCurrencyCode: "INR",
          destinationAmountMinor: -1_000,
          destinationCurrencyCode: "INR",
          purpose: "fixed-deposit-withdrawal"
        })
      )
    ).toThrow(InvalidTransferAmountsError);
  });

  it("rejects non-positive amounts on general Transfers too", () => {
    // A zero-amount same-currency Transfer would otherwise pass the equality
    // check above and persist with a 0/0 realized FX rate, which renders as
    // the literal string "NaN" on the Transfer detail page.
    expect(() =>
      assertValidTransferAmounts(
        makeTransfer({
          sourceAmountMinor: 0,
          sourceCurrencyCode: "INR",
          destinationAmountMinor: 0,
          destinationCurrencyCode: "INR",
          purpose: "general"
        })
      )
    ).toThrow(InvalidTransferAmountsError);
  });
});

describe("realizedFxRate", () => {
  it("returns the ratio of destination to source units for same-decimal currencies", () => {
    const transfer = makeTransfer({
      sourceAmountMinor: 100_000,
      sourceCurrencyCode: "USD",
      destinationAmountMinor: 8_300_000,
      destinationCurrencyCode: "INR"
    });

    expect(realizedFxRate(transfer)).toBeCloseTo(83, 10);
  });

  it("returns 1 for a same-currency transfer", () => {
    const transfer = makeTransfer({
      sourceAmountMinor: 50_000,
      sourceCurrencyCode: "USD",
      destinationAmountMinor: 50_000,
      destinationCurrencyCode: "USD"
    });

    expect(realizedFxRate(transfer)).toBe(1);
  });
});
