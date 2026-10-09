export type StockTransactionType = "Buy" | "Sell";

export type StockTransaction = {
  id: string;
  shareTradingAccountId: string;
  scripCode: string;
  type: StockTransactionType;
  quantity: number;
  pricePerUnitMinor: number;
  occurredAt: string;
  description: string;
  trustStatus: "Confirmed" | "Imported";
  importBatchId: string | null;
  // The broker statement's own reference/order/contract-note number, when supplied — used for
  // Suspected Duplicate matching (CONTEXT.md). Optional: most callers have no such number.
  externalRef?: string | null;
  // Suspected Duplicate (CONTEXT.md) — set only by StockImportBatchRepository.create() at commit
  // time. Optional for the same reason: most callers constructing a StockTransaction don't need it.
  possibleDuplicateOfTransactionId?: string | null;
};

export class InvalidStockQuantityError extends Error {
  constructor() {
    super("Quantity must be a positive whole number of shares.");
    this.name = "InvalidStockQuantityError";
  }
}

export class InsufficientHoldingsError extends Error {
  constructor(scripCode: string, currentQuantity: number, saleQuantity: number) {
    super(`Only ${currentQuantity} share(s) of ${scripCode} are held; cannot sell ${saleQuantity}.`);
    this.name = "InsufficientHoldingsError";
  }
}

/** A Sell can never take a Holding negative — that isn't a real position, it's a data-entry mistake. */
export function assertSufficientHoldingsForSale(
  scripCode: string,
  currentQuantity: number,
  saleQuantity: number
): void {
  if (saleQuantity > currentQuantity) {
    throw new InsufficientHoldingsError(scripCode, currentQuantity, saleQuantity);
  }
}

/** Shared by the web Server Action and MCP stock import — quantity is always a decimal-shaped
 * string at the boundary (untrusted-caller convention, matching parseDecimalToMinorUnits), never
 * accepted as a pre-parsed number. Whole shares only — fractional shares are out of scope. */
export function parseWholeShareQuantity(input: string): number {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed) || Number(trimmed) <= 0) {
    throw new InvalidStockQuantityError();
  }
  return Number(trimmed);
}
