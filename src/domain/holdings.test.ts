import { describe, expect, it } from "vitest";

import { computeHoldings } from "@/domain/holdings";
import type { StockTransaction } from "@/domain/stock-transaction";

describe("computeHoldings", () => {
  it("returns quantity held for a single company from a single Buy", () => {
    const stockTransactions: StockTransaction[] = [
      {
        id: "stxn-1",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Initial buy",
        trustStatus: "Confirmed",
        importBatchId: null
      }
    ];

    const holdings = computeHoldings(stockTransactions);

    expect(holdings).toEqual([{ scripCode: "AAPL", quantity: 10 }]);
  });

  it("tracks each company's net quantity separately, netting Buy against Sell", () => {
    const stockTransactions: StockTransaction[] = [
      {
        id: "stxn-1",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Buy AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      },
      {
        id: "stxn-2",
        shareTradingAccountId: "sta-1",
        scripCode: "MSFT",
        type: "Buy",
        quantity: 5,
        pricePerUnitMinor: 30_000,
        occurredAt: "2026-01-02T10:00:00.000Z",
        description: "Buy MSFT",
        trustStatus: "Confirmed",
        importBatchId: null
      },
      {
        id: "stxn-3",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Sell",
        quantity: 4,
        pricePerUnitMinor: 16_000,
        occurredAt: "2026-01-03T10:00:00.000Z",
        description: "Sell AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      }
    ];

    const holdings = computeHoldings(stockTransactions);

    expect(holdings).toEqual([
      { scripCode: "AAPL", quantity: 6 },
      { scripCode: "MSFT", quantity: 5 }
    ]);
  });

  it("returns an empty list for no transactions", () => {
    expect(computeHoldings([])).toEqual([]);
  });

  it("keeps a fully-exited company visible at zero quantity rather than dropping it", () => {
    const stockTransactions: StockTransaction[] = [
      {
        id: "stxn-1",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "Buy AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      },
      {
        id: "stxn-2",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Sell",
        quantity: 10,
        pricePerUnitMinor: 16_000,
        occurredAt: "2026-01-02T10:00:00.000Z",
        description: "Sell AAPL",
        trustStatus: "Confirmed",
        importBatchId: null
      }
    ];

    expect(computeHoldings(stockTransactions)).toEqual([{ scripCode: "AAPL", quantity: 0 }]);
  });

  it("includes Imported stock transactions in Holdings, matching computeAccountBalance's treatment of Transactions", () => {
    const stockTransactions: StockTransaction[] = [
      {
        id: "stxn-1",
        shareTradingAccountId: "sta-1",
        scripCode: "AAPL",
        type: "Buy",
        quantity: 10,
        pricePerUnitMinor: 15_000,
        occurredAt: "2026-01-01T10:00:00.000Z",
        description: "MCP import",
        trustStatus: "Imported",
        importBatchId: "batch-1"
      }
    ];

    expect(computeHoldings(stockTransactions)).toEqual([{ scripCode: "AAPL", quantity: 10 }]);
  });
});
