/**
 * Mirrors ImportBatch (src/domain/import-batch.ts) but for StockTransaction line items on a
 * ShareTradingAccount, deliberately with no closingBalanceMinor/asOfDate/balanceSnapshotId/
 * reconciliationId — a stock trade has no closing-balance concept, and share-trading.md already
 * documents that no Reconciliation/BalanceSnapshot equivalent exists for share holdings. A
 * separate type from a polymorphic ImportBatch, matching ADR-0003's reasoning for keeping
 * FixedDeposit out of Account: forcing one shared entity to serve two different shapes makes the
 * shared one worse, not simpler.
 */
export type StockImportBatch = {
  id: string;
  shareTradingAccountId: string;
  source: string;
  createdAt: string;
  confirmedAt: string | null;
};

export class EmptyStockImportBatchError extends Error {
  constructor() {
    super("A stock import batch must contain at least one line item.");
    this.name = "EmptyStockImportBatchError";
  }
}
