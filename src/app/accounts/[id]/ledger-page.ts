import type { Transaction } from "@/domain/transaction";
import type { TransactionCategory } from "@/domain/transaction-category";

/**
 * One ledger row as it crosses to the client. Plain data rather than the
 * server-rendered `ReactNode` the ledger used to pass, because rows fetched
 * mid-scroll arrive from a Server Action and are rendered by the client.
 */
export type LedgerRow = {
  id: string;
  description: string;
  occurredAt: string;
  amountMinor: number;
  trustStatus: Transaction["trustStatus"];
  category: TransactionCategory | null;
  transferId: string | null;
  possibleDuplicateOfTransactionId: string | null;
};

export type LedgerPage = {
  rows: LedgerRow[];
  /** Rows matching the current filters, not the number returned. */
  total: number;
};

export type LedgerPageRequest = {
  accountId: string;
  offset: number;
  search: string;
  month: string;
};
