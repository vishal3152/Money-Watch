import type { Account } from "@/domain/account";
import type { Adjustment } from "@/domain/adjustment";
import type { BalanceSnapshot } from "@/domain/balance-snapshot";
import type { Discrepancy, DiscrepancyResolution } from "@/domain/discrepancy";
import type { EmailAlertDraft } from "@/domain/email-alert";
import type { EmailSyncCursor } from "@/domain/email-sync-cursor";
import type { FixedDeposit } from "@/domain/fixed-deposit";
import type { ImportBatch } from "@/domain/import-batch";
import type { Institution } from "@/domain/institution";
import type { Reconciliation } from "@/domain/reconciliation";
import type { ShareTradingAccount } from "@/domain/share-trading-account";
import type { StockImportBatch } from "@/domain/stock-import-batch";
import type { StockTransaction, StockTransactionType } from "@/domain/stock-transaction";
import type { Transaction } from "@/domain/transaction";
import type { TransactionCategory } from "@/domain/transaction-category";
import type { Transfer } from "@/domain/transfer";

export type InstitutionDependentCounts = {
  accounts: number;
  fixedDeposits: number;
  shareTradingAccounts: number;
};

export type InstitutionUpdateInput = {
  name?: string;
};

export type InstitutionRepositoryPort = {
  create(input: Institution): Promise<Institution>;
  getById(institutionId: string): Promise<Institution | null>;
  listAll(): Promise<Institution[]>;
  update(institutionId: string, fields: InstitutionUpdateInput): Promise<Institution>;
  getDependentCounts(institutionId: string): Promise<InstitutionDependentCounts>;
  delete(institutionId: string): Promise<void>;
};

export type AccountDependentCounts = {
  transactions: number;
  reconciliations: number;
  fixedDeposits: number;
};

export type AccountUpdateInput = {
  name?: string;
  accountNumber?: string | null;
};

export type AccountRepositoryPort = {
  create(input: Account): Promise<Account>;
  getById(accountId: string): Promise<Account | null>;
  listAll(): Promise<Account[]>;
  // Selective form of listAll() for a single Institution's detail screen — avoids loading the
  // Owner's whole Account list just to filter it down in JS (docs/qa/cloud-db-operations-audit.md).
  listByInstitutionId(institutionId: string): Promise<Account[]>;
  update(accountId: string, fields: AccountUpdateInput): Promise<Account>;
  getDependentCounts(accountId: string): Promise<AccountDependentCounts>;
  delete(accountId: string): Promise<void>;
  // Bypasses the getDependentCounts()/EntityHasDependentsError guard above and cascades through
  // this Account's Transactions, Reconciliations (with their Discrepancies/Adjustments), and any
  // Transfer touching it (removing the whole Transfer and both linked Transactions) — except a
  // linked FixedDeposit, which is never cascaded, and a Transfer whose other-side Account has
  // already reconciled a period covering it, which blocks the whole operation instead
  // (AccountHardDeleteBlockedError). See docs/specs/accounts.md.
  hardDelete(accountId: string): Promise<void>;
};

export type FixedDepositOpeningDebit = {
  transferId: string;
  transactionId: string;
  description: string;
};

export type FixedDepositRepositoryPort = {
  create(input: FixedDeposit, openingDebit?: FixedDepositOpeningDebit): Promise<FixedDeposit>;
  getById(fixedDepositId: string): Promise<FixedDeposit | null>;
  listAll(): Promise<FixedDeposit[]>;
  // Selective form of listAll() for a single Institution's detail screen — see
  // AccountRepositoryPort.listByInstitutionId().
  listByInstitutionId(institutionId: string): Promise<FixedDeposit[]>;
};

export type ShareTradingAccountDependentCounts = {
  stockTransactions: number;
  stockImportBatches: number;
};

export type ShareTradingAccountUpdateInput = {
  name?: string;
  accountNumber?: string | null;
};

export type ShareTradingAccountRepositoryPort = {
  create(input: ShareTradingAccount): Promise<ShareTradingAccount>;
  getById(shareTradingAccountId: string): Promise<ShareTradingAccount | null>;
  listAll(): Promise<ShareTradingAccount[]>;
  // Selective form of listAll() for a single Institution's detail screen — see
  // AccountRepositoryPort.listByInstitutionId().
  listByInstitutionId(institutionId: string): Promise<ShareTradingAccount[]>;
  update(
    shareTradingAccountId: string,
    fields: ShareTradingAccountUpdateInput
  ): Promise<ShareTradingAccount>;
  getDependentCounts(shareTradingAccountId: string): Promise<ShareTradingAccountDependentCounts>;
  delete(shareTradingAccountId: string): Promise<void>;
};

export type StockTransactionUpdateInput = {
  scripCode?: string;
  type?: StockTransactionType;
  quantity?: number;
  pricePerUnitMinor?: number;
  occurredAt?: string;
  description?: string;
};

export type StockTransactionRepositoryPort = {
  create(input: StockTransaction): Promise<StockTransaction>;
  getById(stockTransactionId: string): Promise<StockTransaction | null>;
  listByShareTradingAccountId(shareTradingAccountId: string): Promise<StockTransaction[]>;
  // Batch form of listByShareTradingAccountId(), one query for several
  // ShareTradingAccounts instead of one per Account — the dashboard's portfolio
  // snapshot needs every Account's StockTransactions to compute holdings.
  // Ordered by shareTradingAccountId first so callers can group in one pass.
  listByShareTradingAccountIds(shareTradingAccountIds: string[]): Promise<StockTransaction[]>;
  // The stock-import batch detail screen's line items — one batch's rows instead of the whole
  // ShareTradingAccount ledger filtered in JS (docs/qa/cloud-db-operations-audit.md).
  listByImportBatchId(importBatchId: string): Promise<StockTransaction[]>;
  // Net signed quantity (Buy adds, Sell subtracts) for one scrip in one ShareTradingAccount —
  // the Sell-sufficiency check's only actual need, computed in SQL instead of loading every
  // StockTransaction to run computeHoldings() over them. `excludeId` omits one row (the
  // transaction being edited) from the sum.
  sumQuantityByScripCode(
    shareTradingAccountId: string,
    scripCode: string,
    options?: { excludeId?: string }
  ): Promise<number>;
  // Unlike Transaction, a StockTransaction has no Transfer/Adjustment-shaped linkage that would
  // make it non-editable — no assertEditable() gate here. Editing/deleting an Imported row (still
  // part of an unconfirmed StockImportBatch) is safe: StockImportBatchRepository.confirmAll()/
  // delete() both act by importBatchId, so a row that no longer matches its original data, or is
  // gone, is simply not touched.
  update(stockTransactionId: string, fields: StockTransactionUpdateInput): Promise<StockTransaction>;
  delete(stockTransactionId: string): Promise<void>;
  // Clears possibleDuplicateOfTransactionId (Suspected Duplicate — CONTEXT.md) without touching
  // any other field — mirrors TransactionRepositoryPort.dismissSuspectedDuplicate().
  dismissSuspectedDuplicate(stockTransactionId: string): Promise<StockTransaction>;
};

export type CreateStockImportBatchInput = {
  id: string;
  shareTradingAccountId: string;
  source: string;
  createdAt: string;
};

export type StockImportBatchLineItemInput = {
  id: string;
  scripCode: string;
  type: StockTransactionType;
  /** Decimal string, whole shares only — parsed/validated server-side (parseWholeShareQuantity), never a pre-parsed number. */
  quantity: string;
  /** Decimal string in the ShareTradingAccount's currency, e.g. "150.00" — parsed server-side. */
  price: string;
  /** Calendar date (`YYYY-MM-DD`) the trade occurred on — statements carry dates, not times, same as ImportBatchTransactionInput. */
  occurredAt: string;
  description: string;
  /** The broker statement's own reference/order/contract-note number for this line, when supplied —
   * preferred over the natural key for Suspected Duplicate matching (CONTEXT.md) when an existing
   * StockTransaction on the same ShareTradingAccount also has one. */
  externalRef?: string | null;
};

export type StockImportBatchRepositoryPort = {
  create(
    input: CreateStockImportBatchInput,
    lineItems: StockImportBatchLineItemInput[]
  ): Promise<StockImportBatch>;
  getById(id: string): Promise<StockImportBatch | null>;
  listAll(): Promise<StockImportBatch[]>;
  // Flips every batch StockTransaction to Confirmed. No BalanceSnapshot/Reconciliation branch —
  // unlike ImportBatchRepository.confirmAll(), a stock trade has no closing-balance concept
  // (docs/specs/share-trading.md).
  confirmAll(id: string): Promise<StockImportBatch>;
  delete(id: string): Promise<void>;
};

export type AccountBalanceTotal = {
  accountId: string;
  balanceMinor: number;
};

export type TransactionPageQuery = {
  limit: number;
  offset: number;
  /** Case-insensitive substring match on description; empty matches every row. */
  search?: string;
  /** Calendar month (`YYYY-MM`) of `occurredAt`; empty matches every row. */
  month?: string;
};

export type TransactionPage = {
  rows: Transaction[];
  /** Rows matching the same filters ignoring limit/offset — the scroll gate needs it to know when to stop. */
  total: number;
};

export type TransactionUpdateInput = {
  amountMinor?: number;
  description?: string;
  category?: TransactionCategory | null;
  occurredAt?: string;
};

export type TransactionRepositoryPort = {
  create(input: Transaction): Promise<Transaction>;
  getById(transactionId: string): Promise<Transaction | null>;
  listByAccountId(accountId: string): Promise<Transaction[]>;
  // Row count only, for the Account delete page's danger-zone copy — avoids loading the whole
  // ledger just to read `.length` (docs/qa/cloud-db-operations-audit.md).
  countByAccountId(accountId: string): Promise<number>;
  // One filtered, ordered slice of an Account's ledger plus the matching total,
  // in a single statement (`count(*) over ()`). The account detail ledger reads
  // through this instead of `listByAccountId` so an Account with years of
  // history does not ship its whole Transaction list on every render — the
  // filters live here rather than in the client for the same reason: a search
  // must match rows that were never fetched. Same chronological ordering as
  // `listByAccountId` (docs/specs/transactions.md).
  listPageByAccountId(accountId: string, query: TransactionPageQuery): Promise<TransactionPage>;
  // Distinct `YYYY-MM` months an Account has Transactions in, most recent
  // first — the ledger's month filter options, which cannot be derived from a
  // single loaded page.
  listMonthsByAccountId(accountId: string): Promise<string[]>;
  // Batch balance for a set of Accounts in one query (SUM ... GROUP BY),
  // instead of calling listByAccountId() per Account and summing in JS. An
  // Account with no Transactions has no entry in the result.
  sumAmountsByAccountIds(accountIds: string[]): Promise<AccountBalanceTotal[]>;
  // Editable/deletable only when Imported, or Confirmed with no transferId and
  // no Adjustment referencing it — see TransactionRepository.assertEditable().
  update(transactionId: string, fields: TransactionUpdateInput): Promise<Transaction>;
  delete(transactionId: string): Promise<void>;
  // Clears possibleDuplicateOfTransactionId (Suspected Duplicate — CONTEXT.md) without touching
  // any other field. No editability guard: unlike update()/delete(), this never changes what a
  // Transaction represents, only whether it's still flagged for review.
  dismissSuspectedDuplicate(transactionId: string): Promise<Transaction>;
};

export type BalanceSnapshotRepositoryPort = {
  create(input: BalanceSnapshot): Promise<BalanceSnapshot>;
  getById(snapshotId: string): Promise<BalanceSnapshot | null>;
  listByAccountId(accountId: string): Promise<BalanceSnapshot[]>;
};

export type CreateReconciliationInput = {
  id: string;
  accountId: string;
  balanceSnapshotId: string;
  reconciledAt: string;
};

// trustStatus is forced to "Confirmed" and transferId to null: an Adjustment
// is by definition owner-authored and is never itself a Transfer leg.
export type CreateAdjustmentTransactionInput = {
  id: string;
  accountId: string;
  amountMinor: number;
  occurredAt: string;
  description: string;
};

export type AccountOpenDiscrepancyCount = {
  accountId: string;
  openDiscrepancies: number;
};

export type AdjustmentLink = {
  transactionId: string;
  reconciliationId: string;
};

export type ReconciliationRepositoryPort = {
  create(input: CreateReconciliationInput): Promise<Reconciliation>;
  getById(reconciliationId: string): Promise<Reconciliation | null>;
  listByAccountId(accountId: string): Promise<Reconciliation[]>;
  // The dashboard's per-Account "open discrepancies" badge, counted in SQL by
  // joining Reconciliation to Discrepancy. Replaces fetching every
  // Reconciliation and then every Discrepancy just to count the unresolved
  // ones — two sequential round trips collapsed into one. An Account with no
  // open Discrepancy has no entry in the result.
  countOpenDiscrepanciesByAccountIds(accountIds: string[]): Promise<AccountOpenDiscrepancyCount[]>;
  getDiscrepancyByReconciliationId(reconciliationId: string): Promise<Discrepancy | null>;
  // Batch form of getDiscrepancyByReconciliationId(), one query for several
  // Reconciliations' Discrepancies instead of one query per Reconciliation.
  listDiscrepanciesByReconciliationIds(reconciliationIds: string[]): Promise<Discrepancy[]>;
  // Which of an Account's Transactions are Adjustments, and the Reconciliation
  // each one came from — the account-detail ledger's "Adjustment" link.
  // Resolved in one join (adjustment -> discrepancy -> reconciliation) keyed on
  // accountId, so it no longer has to wait on the Transaction and
  // Reconciliation id lists the two-step lookup previously needed.
  listAdjustmentLinksByAccountId(accountId: string): Promise<AdjustmentLink[]>;
  resolveDiscrepancy(discrepancyId: string, resolution: DiscrepancyResolution): Promise<Discrepancy>;
  resolveWithAdjustment(discrepancyId: string, transaction: CreateAdjustmentTransactionInput): Promise<Adjustment>;
};

export type AdjustmentRepositoryPort = {
  create(transaction: CreateAdjustmentTransactionInput, discrepancyId: string): Promise<Adjustment>;
  getByDiscrepancyId(discrepancyId: string): Promise<Adjustment | null>;
  getByTransactionId(transactionId: string): Promise<Adjustment | null>;
  // Batch form of getByTransactionId(), one query for several Transactions'
  // Adjustments instead of one query per Transaction.
  listByTransactionIds(transactionIds: string[]): Promise<Adjustment[]>;
};

export type CreateImportBatchInput = {
  id: string;
  accountId: string;
  source: string;
  createdAt: string;
  /** Decimal string in the Account's currency, e.g. "50000.00" — parsed against the Account's actual currency, never trusted as pre-scaled minor units. */
  closingBalance: string | null;
  asOfDate: string | null;
};

export type ImportBatchTransactionInput = {
  id: string;
  /** Decimal string in the Account's currency, e.g. "-1500.00" — parsed against the Account's actual currency. */
  amount: string;
  /** Calendar date (`YYYY-MM-DD`) the line item occurred on — statements carry dates, not times. */
  occurredAt: string;
  description: string;
  category: TransactionCategory | null;
  /** The statement's own reference/confirmation number for this line, when the assistant supplied
   * one — preferred over date+amount for Suspected Duplicate matching (CONTEXT.md) when an
   * existing Transaction on the same Account also has one. Optional: most callers (and every
   * pre-existing statement without a ref column) have none. */
  externalRef?: string | null;
};

export type ImportBatchRepositoryPort = {
  create(input: CreateImportBatchInput, lineItems: ImportBatchTransactionInput[]): Promise<ImportBatch>;
  getById(id: string): Promise<ImportBatch | null>;
  /** Most recent first (`docs/specs/import.md`), for the `/imports` review list. */
  listAll(): Promise<ImportBatch[]>;
  // Flips every batch Transaction to Confirmed and, only if a closing balance was stashed,
  // creates the BalanceSnapshot/Reconciliation — see ImportBatchRepository.confirmAll() for why
  // this is deliberately not one atomic write (docs/specs/import.md).
  confirmAll(id: string): Promise<ImportBatch>;
  delete(id: string): Promise<void>;
  // Only usable once confirmed (ImportBatchNotConfirmedError otherwise — use delete() before
  // confirmation instead). Blocked (ImportBatchUndoBlockedError) if the batch's Reconciliation
  // already has a Discrepancy with an owner-authored Adjustment, or if a later Reconciliation
  // exists for the same Account — see docs/specs/import.md.
  undoConfirmed(id: string): Promise<void>;
};

export type EmailSyncCursorRepositoryPort = {
  get(mailbox: string): Promise<EmailSyncCursor | null>;
  /** Upserts the mailbox's pointer — one row per mailbox, overwritten as the poll advances. */
  save(cursor: EmailSyncCursor): Promise<void>;
};

/**
 * A bank alert email the poll could not import on its own — either some of the LLM's fields failed
 * validation or no single Account matched. Only these rows are stored: everything else the poll
 * reads (non-bank mail, alerts that imported cleanly) is accounted for by the mailbox's
 * `EmailSyncCursor` alone, so the table stays the size of the owner's actual review queue
 * (docs/specs/email-alert-sync.md).
 */
export type UnresolvedEmailAlert = {
  id: string;
  mailbox: string;
  messageUid: string;
  /** When the poll recorded it. */
  detectedAt: string;
  /** Why it could not be imported (an Account-match reason, or the failed validation), for display
   * on `/imports`. Null for rows recorded before this field existed. */
  failureReason: string | null;
  /** The alert's fields exactly as the LLM produced them — the starting point for the owner's
   * corrections, never trusted as valid. */
  draft: EmailAlertDraft;
  /** Draft fields that failed validation, so `/imports` can flag exactly what needs fixing. Empty
   * when the alert parsed cleanly and only its Account could not be resolved. */
  invalidFields: string[];
};

export type UnresolvedEmailAlertRepositoryPort = {
  save(alert: UnresolvedEmailAlert): Promise<void>;
  /** Most recently detected first — the owner's review queue on `/imports`. */
  listAll(): Promise<UnresolvedEmailAlert[]>;
  getById(id: string): Promise<UnresolvedEmailAlert | null>;
  /** Drops a resolved alert: the ImportBatch it became is its record from then on. False when the
   * row was already gone (a double submit). */
  delete(id: string): Promise<boolean>;
};

export type AccountTransferImpact = {
  transferCount: number;
  // Distinct names of the Accounts on the other leg of a Transfer touching this Account — a
  // Transfer whose other leg is a FixedDeposit contributes to transferCount but not a name.
  counterpartyAccountNames: string[];
};

export type TransferRepositoryPort = {
  create(input: Transfer): Promise<Transfer>;
  getById(transferId: string): Promise<Transfer | null>;
  listByLeg(accountOrFixedDepositId: string): Promise<Transfer[]>;
  // One-shot summary for the Account delete page's hard-delete danger-zone copy: how many
  // Transfers touch this Account and which Accounts are on the other side — replaces
  // listByLeg() plus one getById() per counterparty (docs/qa/cloud-db-operations-audit.md).
  getTransferImpactByAccountId(accountId: string): Promise<AccountTransferImpact>;
  delete(transferId: string): Promise<void>;
  // Full re-edit: revalidates legs/purpose/amounts/currency exactly like
  // create(), then atomically replaces the linked Transactions and recomputes
  // any FixedDeposit(s) touched by the old or new legs. Rejects (does not
  // change anything) when the existing or requested purpose is
  // fixed-deposit-opening — see TransferNotEditableError.
  update(transferId: string, input: Omit<Transfer, "id">): Promise<Transfer>;
};
