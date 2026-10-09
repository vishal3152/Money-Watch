import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  unique
} from "drizzle-orm/sqlite-core";

export const institutions = sqliteTable("institutions", {
  id: text("id").primaryKey(),
  name: text("name").notNull()
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id")
    .notNull()
    .references(() => institutions.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  accountNumber: text("account_number"),
  currencyCode: text("currency_code").notNull()
});

export const fixedDeposits = sqliteTable(
  "fixed_deposits",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    accountNumber: text("account_number"),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    linkedAccountId: text("linked_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    principalMinor: integer("principal_minor").notNull(),
    originalPrincipalMinor: integer("original_principal_minor").notNull(),
    currencyCode: text("currency_code").notNull(),
    interestRateBps: integer("interest_rate_bps").notNull(),
    openedDate: text("opened_date").notNull(),
    maturityDate: text("maturity_date").notNull(),
    status: text("status", { enum: ["Open", "Matured", "PrematurelyClosed"] }).notNull()
  },
  (table) => ({
    principalMinorIntegerCheck: check(
      "fixed_deposits_principal_minor_integer_check",
      sql`typeof(${table.principalMinor}) = 'integer'`
    ),
    originalPrincipalMinorIntegerCheck: check(
      "fixed_deposits_original_principal_minor_integer_check",
      sql`typeof(${table.originalPrincipalMinor}) = 'integer'`
    ),
    statusCheck: check(
      "fixed_deposits_status_check",
      sql`${table.status} in ('Open', 'Matured', 'PrematurelyClosed')`
    )
  })
);

export const shareTradingAccounts = sqliteTable("share_trading_accounts", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id")
    .notNull()
    .references(() => institutions.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  accountNumber: text("account_number"),
  currencyCode: text("currency_code").notNull()
});

export const stockImportBatches = sqliteTable("stock_import_batches", {
  id: text("id").primaryKey(),
  shareTradingAccountId: text("share_trading_account_id")
    .notNull()
    .references(() => shareTradingAccounts.id, { onDelete: "restrict" }),
  source: text("source").notNull(),
  createdAt: text("created_at").notNull(),
  confirmedAt: text("confirmed_at")
});

export const stockTransactions = sqliteTable(
  "stock_transactions",
  {
    id: text("id").primaryKey(),
    shareTradingAccountId: text("share_trading_account_id")
      .notNull()
      .references(() => shareTradingAccounts.id, { onDelete: "cascade" }),
    scripCode: text("scrip_code").notNull(),
    type: text("type", { enum: ["Buy", "Sell"] }).notNull(),
    quantity: integer("quantity").notNull(),
    pricePerUnitMinor: integer("price_per_unit_minor").notNull(),
    occurredAt: text("occurred_at").notNull(),
    description: text("description").notNull(),
    // .default() exists only so this NOT NULL column can be added to the already-shipped table via
    // a plain ALTER TABLE ADD COLUMN instead of drizzle-kit's table-rebuild strategy (which would
    // try to copy a column that doesn't exist yet on the old table) — every real insert passes
    // trustStatus explicitly (StockTransactionRepository.create()), the same pattern
    // `transfers.purpose` already uses.
    trustStatus: text("trust_status", { enum: ["Confirmed", "Imported"] })
      .notNull()
      .default("Confirmed"),
    importBatchId: text("import_batch_id").references(() => stockImportBatches.id, { onDelete: "cascade" }),
    // The broker statement's own reference/order/contract-note number for this line, when supplied —
    // preferred over the natural key for Suspected Duplicate matching (CONTEXT.md) when an existing
    // StockTransaction on the same ShareTradingAccount also has one.
    externalRef: text("external_ref"),
    // Set at import-commit time when this StockTransaction matches an earlier one on the same
    // ShareTradingAccount (Suspected Duplicate — CONTEXT.md). Cleared to null by an explicit
    // "not a duplicate" action, never by editing unrelated fields.
    possibleDuplicateOfTransactionId: text("possible_duplicate_of_transaction_id").references(
      (): AnySQLiteColumn => stockTransactions.id,
      { onDelete: "set null" }
    )
  },
  (table) => ({
    shareTradingAccountDateIdx: index("stock_transactions_share_trading_account_date_idx").on(
      table.shareTradingAccountId,
      table.occurredAt
    ),
    quantityIntegerCheck: check(
      "stock_transactions_quantity_integer_check",
      sql`typeof(${table.quantity}) = 'integer'`
    ),
    pricePerUnitMinorIntegerCheck: check(
      "stock_transactions_price_per_unit_minor_integer_check",
      sql`typeof(${table.pricePerUnitMinor}) = 'integer'`
    ),
    typeCheck: check("stock_transactions_type_check", sql`${table.type} in ('Buy', 'Sell')`),
    trustStatusCheck: check(
      "stock_transactions_trust_status_check",
      sql`${table.trustStatus} in ('Confirmed', 'Imported')`
    )
  })
);

export const transfers = sqliteTable(
  "transfers",
  {
    id: text("id").primaryKey(),
    sourceAccountId: text("source_account_id").references(() => accounts.id, { onDelete: "restrict" }),
    sourceFixedDepositId: text("source_fixed_deposit_id").references(() => fixedDeposits.id, {
      onDelete: "restrict"
    }),
    sourceAmountMinor: integer("source_amount_minor").notNull(),
    sourceCurrencyCode: text("source_currency_code").notNull(),
    destinationAccountId: text("destination_account_id").references(() => accounts.id, { onDelete: "restrict" }),
    destinationFixedDepositId: text("destination_fixed_deposit_id").references(() => fixedDeposits.id, {
      onDelete: "restrict"
    }),
    destinationAmountMinor: integer("destination_amount_minor").notNull(),
    destinationCurrencyCode: text("destination_currency_code").notNull(),
    occurredAt: text("occurred_at").notNull(),
    description: text("description").notNull(),
    purpose: text("purpose", {
      enum: [
        "general",
        "fixed-deposit-opening",
        "fixed-deposit-top-up",
        "fixed-deposit-withdrawal"
      ]
    })
      .notNull()
      .default("general")
  },
  (table) => ({
    sourceAmountMinorIntegerCheck: check(
      "transfers_source_amount_minor_integer_check",
      sql`typeof(${table.sourceAmountMinor}) = 'integer'`
    ),
    destinationAmountMinorIntegerCheck: check(
      "transfers_destination_amount_minor_integer_check",
      sql`typeof(${table.destinationAmountMinor}) = 'integer'`
    ),
    purposeCheck: check(
      "transfers_purpose_check",
      sql`${table.purpose} in ('general', 'fixed-deposit-opening', 'fixed-deposit-top-up', 'fixed-deposit-withdrawal')`
    )
  })
);

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    source: text("source").notNull(),
    createdAt: text("created_at").notNull(),
    closingBalanceMinor: integer("closing_balance_minor"),
    asOfDate: text("as_of_date"),
    confirmedAt: text("confirmed_at"),
    balanceSnapshotId: text("balance_snapshot_id").references(() => balanceSnapshots.id, {
      onDelete: "restrict"
    }),
    reconciliationId: text("reconciliation_id").references(() => reconciliations.id, {
      onDelete: "restrict"
    })
  },
  (table) => ({
    closingBalanceMinorIntegerCheck: check(
      "import_batches_closing_balance_minor_integer_check",
      sql`${table.closingBalanceMinor} is null or typeof(${table.closingBalanceMinor}) = 'integer'`
    )
  })
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    occurredAt: text("occurred_at").notNull(),
    description: text("description").notNull(),
    trustStatus: text("trust_status", {
      enum: ["Confirmed", "Imported"]
    }).notNull(),
    transferId: text("transfer_id").references(() => transfers.id, { onDelete: "cascade" }),
    category: text("category"),
    importBatchId: text("import_batch_id").references(() => importBatches.id, { onDelete: "cascade" }),
    // The statement's own reference/confirmation number for this line, when the assistant supplied
    // one — preferred over date+amount for Suspected Duplicate matching (CONTEXT.md) when both the
    // incoming line and an existing Transaction have one.
    externalRef: text("external_ref"),
    // Set at import-commit time when this Transaction matches an earlier one on the same Account
    // (Suspected Duplicate — CONTEXT.md). Cleared to null by an explicit "not a duplicate" action,
    // never by editing unrelated fields. `set null` on delete: if the earlier Transaction this one
    // points at is itself removed, there is nothing left to be a duplicate of.
    possibleDuplicateOfTransactionId: text("possible_duplicate_of_transaction_id").references(
      (): AnySQLiteColumn => transactions.id,
      { onDelete: "set null" }
    )
  },
  (table) => ({
    accountDateIdx: index("transactions_account_date_idx").on(table.accountId, table.occurredAt),
    amountMinorIntegerCheck: check(
      "transactions_amount_minor_integer_check",
      sql`typeof(${table.amountMinor}) = 'integer'`
    ),
    trustStatusCheck: check(
      "transactions_trust_status_check",
      sql`${table.trustStatus} in ('Confirmed', 'Imported')`
    ),
    categoryCheck: check(
      "transactions_category_check",
      sql`${table.category} is null or ${table.category} in (
        'Grocery', 'Dining', 'Education', 'Transport', 'Utilities', 'Rent', 'Health', 'Entertainment', 'Other',
        'Salary', 'Interest', 'Gift', 'Other Income'
      )`
    )
  })
);

export const balanceSnapshots = sqliteTable(
  "balance_snapshots",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    asOfDate: text("as_of_date").notNull(),
    balanceMinor: integer("balance_minor").notNull()
  },
  (table) => ({
    accountDateIdx: index("balance_snapshots_account_date_idx").on(table.accountId, table.asOfDate),
    balanceMinorIntegerCheck: check(
      "balance_snapshots_balance_minor_integer_check",
      sql`typeof(${table.balanceMinor}) = 'integer'`
    )
  })
);

export const reconciliations = sqliteTable(
  "reconciliations",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    balanceSnapshotId: text("balance_snapshot_id")
      .notNull()
      .references(() => balanceSnapshots.id, { onDelete: "restrict" }),
    computedBalanceMinor: integer("computed_balance_minor").notNull(),
    reconciledAt: text("reconciled_at").notNull()
  },
  (table) => ({
    computedBalanceMinorIntegerCheck: check(
      "reconciliations_computed_balance_minor_integer_check",
      sql`typeof(${table.computedBalanceMinor}) = 'integer'`
    )
  })
);

export const discrepancies = sqliteTable(
  "discrepancies",
  {
    id: text("id").primaryKey(),
    reconciliationId: text("reconciliation_id")
      .notNull()
      .references(() => reconciliations.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    resolution: text("resolution", { enum: ["corrected-my-record", "disputed-with-bank"] })
  },
  (table) => ({
    amountMinorIntegerCheck: check(
      "discrepancies_amount_minor_integer_check",
      sql`typeof(${table.amountMinor}) = 'integer'`
    ),
    resolutionCheck: check(
      "discrepancies_resolution_check",
      sql`${table.resolution} in ('corrected-my-record', 'disputed-with-bank')`
    )
  })
);

export const adjustments = sqliteTable("adjustments", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id")
    .notNull()
    .unique()
    .references(() => transactions.id, { onDelete: "cascade" }),
  discrepancyId: text("discrepancy_id")
    .notNull()
    .references(() => discrepancies.id, { onDelete: "restrict" })
});

export const processedEmailAlerts = sqliteTable(
  "processed_email_alerts",
  {
    id: text("id").primaryKey(),
    mailbox: text("mailbox").notNull(),
    messageUid: text("message_uid").notNull(),
    status: text("status", { enum: ["matched", "unresolved", "invalid"] }).notNull(),
    processedAt: text("processed_at").notNull(),
    importBatchId: text("import_batch_id").references(() => importBatches.id, { onDelete: "set null" }),
    // Nullable: matched rows leave it null; rows recorded before this column existed stay null.
    failureReason: text("failure_reason"),
    // JSON-serialized ParsedEmailAlert — written by polls before alert_draft_json existed, still
    // read as the draft for those older rows. Never written now.
    parsedAlertJson: text("parsed_alert_json"),
    // JSON-serialized EmailAlertDraft: the alert's fields exactly as the LLM produced them,
    // including any the owner still has to correct before this alert can be imported.
    alertDraftJson: text("alert_draft_json"),
    // JSON-serialized string[] naming the draft fields that failed validation — empty when the
    // alert parsed cleanly and only its Account could not be resolved.
    invalidFieldsJson: text("invalid_fields_json")
  },
  (table) => ({
    mailboxUidUnique: unique("processed_email_alerts_mailbox_uid_unique").on(table.mailbox, table.messageUid),
    statusCheck: check(
      "processed_email_alerts_status_check",
      sql`${table.status} in ('matched', 'unresolved', 'invalid')`
    )
  })
);

export const emailSyncCursors = sqliteTable("email_sync_cursors", {
  // One pointer per polled mailbox: every IMAP message up to lastMessageUid has been looked at,
  // whatever the outcome, so a later poll never re-reads it (docs/specs/email-alert-sync.md).
  mailbox: text("mailbox").primaryKey(),
  // Null when the IMAP server reported no UIDVALIDITY; a changed value means uids restarted.
  uidValidity: text("uid_validity"),
  lastMessageUid: integer("last_message_uid").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type InstitutionRow = typeof institutions.$inferSelect;
export type NewInstitutionRow = typeof institutions.$inferInsert;

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;

export type FixedDepositRow = typeof fixedDeposits.$inferSelect;
export type NewFixedDepositRow = typeof fixedDeposits.$inferInsert;

export type ShareTradingAccountRow = typeof shareTradingAccounts.$inferSelect;
export type NewShareTradingAccountRow = typeof shareTradingAccounts.$inferInsert;

export type StockTransactionRow = typeof stockTransactions.$inferSelect;
export type NewStockTransactionRow = typeof stockTransactions.$inferInsert;

export type StockImportBatchRow = typeof stockImportBatches.$inferSelect;
export type NewStockImportBatchRow = typeof stockImportBatches.$inferInsert;

export type TransferRow = typeof transfers.$inferSelect;
export type NewTransferRow = typeof transfers.$inferInsert;

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;

export type BalanceSnapshotRow = typeof balanceSnapshots.$inferSelect;
export type NewBalanceSnapshotRow = typeof balanceSnapshots.$inferInsert;

export type ReconciliationRow = typeof reconciliations.$inferSelect;
export type NewReconciliationRow = typeof reconciliations.$inferInsert;

export type DiscrepancyRow = typeof discrepancies.$inferSelect;
export type NewDiscrepancyRow = typeof discrepancies.$inferInsert;

export type AdjustmentRow = typeof adjustments.$inferSelect;
export type NewAdjustmentRow = typeof adjustments.$inferInsert;

export type ImportBatchRow = typeof importBatches.$inferSelect;
export type NewImportBatchRow = typeof importBatches.$inferInsert;

export type EmailSyncCursorRow = typeof emailSyncCursors.$inferSelect;
export type NewEmailSyncCursorRow = typeof emailSyncCursors.$inferInsert;

export type ProcessedEmailAlertRow = typeof processedEmailAlerts.$inferSelect;
export type NewProcessedEmailAlertRow = typeof processedEmailAlerts.$inferInsert;
