import { sql } from "drizzle-orm";
import {
  bigint,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn
} from "drizzle-orm/pg-core";

// Compound FK: a plain FK on the referencing column alone would only check the row
// exists, not that it belongs to the same owner. See the migration.
function ownerScopedForeignKey(
  column: AnyPgColumn,
  ownerColumn: AnyPgColumn,
  foreignColumn: AnyPgColumn,
  foreignOwnerColumn: AnyPgColumn
) {
  return foreignKey({
    columns: [column, ownerColumn],
    foreignColumns: [foreignColumn, foreignOwnerColumn]
  });
}

export const institutions = pgTable(
  "institutions",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    name: text("name").notNull()
  },
  (table) => [index("institutions_owner_id_id_idx").on(table.ownerId, table.id)]
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    institutionId: text("institution_id").notNull(),
    name: text("name").notNull(),
    accountNumber: text("account_number"),
    currencyCode: text("currency_code").notNull()
  },
  (table) => [
    ownerScopedForeignKey(table.institutionId, table.ownerId, institutions.id, institutions.ownerId),
    index("accounts_owner_id_id_idx").on(table.ownerId, table.id),
    index("accounts_institution_id_idx").on(table.institutionId)
  ]
);

export const fixedDeposits = pgTable(
  "fixed_deposits",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    name: text("name").notNull(),
    accountNumber: text("account_number"),
    institutionId: text("institution_id").notNull(),
    linkedAccountId: text("linked_account_id").notNull(),
    principalMinor: bigint("principal_minor", { mode: "number" }).notNull(),
    originalPrincipalMinor: bigint("original_principal_minor", { mode: "number" }).notNull(),
    currencyCode: text("currency_code").notNull(),
    interestRateBps: integer("interest_rate_bps").notNull(),
    openedDate: text("opened_date").notNull(),
    maturityDate: text("maturity_date").notNull(),
    status: text("status", { enum: ["Open", "Matured", "PrematurelyClosed"] }).notNull()
  },
  (table) => [
    ownerScopedForeignKey(table.institutionId, table.ownerId, institutions.id, institutions.ownerId),
    ownerScopedForeignKey(table.linkedAccountId, table.ownerId, accounts.id, accounts.ownerId),
    index("fixed_deposits_owner_id_id_idx").on(table.ownerId, table.id),
    index("fixed_deposits_institution_id_idx").on(table.institutionId),
    index("fixed_deposits_linked_account_id_idx").on(table.linkedAccountId)
  ]
);

export const shareTradingAccounts = pgTable(
  "share_trading_accounts",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    institutionId: text("institution_id").notNull(),
    name: text("name").notNull(),
    accountNumber: text("account_number"),
    currencyCode: text("currency_code").notNull()
  },
  (table) => [
    ownerScopedForeignKey(table.institutionId, table.ownerId, institutions.id, institutions.ownerId),
    index("share_trading_accounts_owner_id_id_idx").on(table.ownerId, table.id),
    index("share_trading_accounts_institution_id_idx").on(table.institutionId)
  ]
);

export const stockImportBatches = pgTable(
  "stock_import_batches",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    shareTradingAccountId: text("share_trading_account_id").notNull(),
    source: text("source").notNull(),
    createdAt: text("created_at").notNull(),
    confirmedAt: text("confirmed_at")
  },
  (table) => [
    ownerScopedForeignKey(
      table.shareTradingAccountId,
      table.ownerId,
      shareTradingAccounts.id,
      shareTradingAccounts.ownerId
    ),
    index("stock_import_batches_owner_id_id_idx").on(table.ownerId, table.id)
  ]
);

export const stockTransactions = pgTable(
  "stock_transactions",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    shareTradingAccountId: text("share_trading_account_id").notNull(),
    scripCode: text("scrip_code").notNull(),
    type: text("type", { enum: ["Buy", "Sell"] }).notNull(),
    quantity: integer("quantity").notNull(),
    pricePerUnitMinor: bigint("price_per_unit_minor", { mode: "number" }).notNull(),
    occurredAt: text("occurred_at").notNull(),
    description: text("description").notNull(),
    trustStatus: text("trust_status", { enum: ["Confirmed", "Imported"] }).notNull(),
    importBatchId: text("import_batch_id"),
    externalRef: text("external_ref"),
    possibleDuplicateOfTransactionId: text("possible_duplicate_of_transaction_id")
  },
  (table) => [
    ownerScopedForeignKey(
      table.shareTradingAccountId,
      table.ownerId,
      shareTradingAccounts.id,
      shareTradingAccounts.ownerId
    ),
    ownerScopedForeignKey(table.importBatchId, table.ownerId, stockImportBatches.id, stockImportBatches.ownerId),
    ownerScopedForeignKey(table.possibleDuplicateOfTransactionId, table.ownerId, table.id, table.ownerId),
    index("stock_transactions_share_trading_account_date_idx").on(
      table.shareTradingAccountId,
      table.occurredAt
    ),
    index("stock_transactions_import_batch_id_idx")
      .on(table.importBatchId)
      .where(sql`${table.importBatchId} is not null`),
    index("stock_transactions_possible_duplicate_of_transaction_id_idx")
      .on(table.possibleDuplicateOfTransactionId)
      .where(sql`${table.possibleDuplicateOfTransactionId} is not null`)
  ]
);

export const transfers = pgTable(
  "transfers",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    sourceAccountId: text("source_account_id"),
    sourceFixedDepositId: text("source_fixed_deposit_id"),
    sourceAmountMinor: bigint("source_amount_minor", { mode: "number" }).notNull(),
    sourceCurrencyCode: text("source_currency_code").notNull(),
    destinationAccountId: text("destination_account_id"),
    destinationFixedDepositId: text("destination_fixed_deposit_id"),
    destinationAmountMinor: bigint("destination_amount_minor", { mode: "number" }).notNull(),
    destinationCurrencyCode: text("destination_currency_code").notNull(),
    occurredAt: text("occurred_at").notNull(),
    description: text("description").notNull(),
    purpose: text("purpose", {
      enum: ["general", "fixed-deposit-opening", "fixed-deposit-top-up", "fixed-deposit-withdrawal"]
    })
      .notNull()
      .default("general")
  },
  (table) => [
    ownerScopedForeignKey(table.sourceAccountId, table.ownerId, accounts.id, accounts.ownerId),
    ownerScopedForeignKey(table.sourceFixedDepositId, table.ownerId, fixedDeposits.id, fixedDeposits.ownerId),
    ownerScopedForeignKey(table.destinationAccountId, table.ownerId, accounts.id, accounts.ownerId),
    ownerScopedForeignKey(
      table.destinationFixedDepositId,
      table.ownerId,
      fixedDeposits.id,
      fixedDeposits.ownerId
    ),
    // listByLeg() ORs across all four; each is NULL on most rows (exactly one
    // of {account, fixed deposit} is set per side), so partial indexes let
    // the planner BitmapOr the matches instead of scanning.
    index("transfers_source_account_id_idx")
      .on(table.sourceAccountId)
      .where(sql`${table.sourceAccountId} is not null`),
    index("transfers_source_fixed_deposit_id_idx")
      .on(table.sourceFixedDepositId)
      .where(sql`${table.sourceFixedDepositId} is not null`),
    index("transfers_destination_account_id_idx")
      .on(table.destinationAccountId)
      .where(sql`${table.destinationAccountId} is not null`),
    index("transfers_destination_fixed_deposit_id_idx")
      .on(table.destinationFixedDepositId)
      .where(sql`${table.destinationFixedDepositId} is not null`)
  ]
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    accountId: text("account_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    occurredAt: text("occurred_at").notNull(),
    description: text("description").notNull(),
    trustStatus: text("trust_status", { enum: ["Confirmed", "Imported"] }).notNull(),
    transferId: text("transfer_id"),
    category: text("category"),
    importBatchId: text("import_batch_id"),
    // The statement's own reference/confirmation number for this line, when the assistant supplied
    // one — preferred over date+amount for Suspected Duplicate matching (CONTEXT.md) when both the
    // incoming line and an existing Transaction have one.
    externalRef: text("external_ref"),
    // Set at import-commit time when this Transaction matches an earlier one on the same Account
    // (Suspected Duplicate — CONTEXT.md). Cleared to null by an explicit "not a duplicate" action,
    // never by editing unrelated fields.
    possibleDuplicateOfTransactionId: text("possible_duplicate_of_transaction_id")
  },
  (table) => [
    ownerScopedForeignKey(table.accountId, table.ownerId, accounts.id, accounts.ownerId),
    ownerScopedForeignKey(table.transferId, table.ownerId, transfers.id, transfers.ownerId),
    ownerScopedForeignKey(
      table.possibleDuplicateOfTransactionId,
      table.ownerId,
      table.id,
      table.ownerId
    ),
    // importBatches is declared further down (it needs balanceSnapshots/reconciliations, which
    // are declared after this table) — its own extraConfig carries this reverse FK instead,
    // mirroring the SQL migration's own "add the column now, the constraint once the referenced
    // table exists" bootstrap order (see 20260911000000_import_batches.sql).
    index("transactions_account_date_idx").on(table.accountId, table.occurredAt),
    // Transfer.delete() looks up its Transactions by transfer_id; most
    // Transactions have none.
    index("transactions_transfer_id_idx").on(table.transferId).where(sql`${table.transferId} is not null`),
    index("transactions_import_batch_id_idx")
      .on(table.importBatchId)
      .where(sql`${table.importBatchId} is not null`),
    index("transactions_possible_duplicate_of_transaction_id_idx")
      .on(table.possibleDuplicateOfTransactionId)
      .where(sql`${table.possibleDuplicateOfTransactionId} is not null`)
  ]
);

export const balanceSnapshots = pgTable(
  "balance_snapshots",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    accountId: text("account_id").notNull(),
    asOfDate: text("as_of_date").notNull(),
    balanceMinor: bigint("balance_minor", { mode: "number" }).notNull()
  },
  (table) => [
    ownerScopedForeignKey(table.accountId, table.ownerId, accounts.id, accounts.ownerId).onDelete("cascade"),
    index("balance_snapshots_account_date_idx").on(table.accountId, table.asOfDate)
  ]
);

export const reconciliations = pgTable(
  "reconciliations",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    accountId: text("account_id").notNull(),
    balanceSnapshotId: text("balance_snapshot_id").notNull(),
    computedBalanceMinor: bigint("computed_balance_minor", { mode: "number" }).notNull(),
    reconciledAt: text("reconciled_at").notNull()
  },
  (table) => [
    ownerScopedForeignKey(table.accountId, table.ownerId, accounts.id, accounts.ownerId),
    ownerScopedForeignKey(table.balanceSnapshotId, table.ownerId, balanceSnapshots.id, balanceSnapshots.ownerId),
    // listByAccountId() orders by (reconciledAt, id); include both trailing
    // columns so the sort is served by the index too.
    index("reconciliations_account_id_reconciled_at_id_idx").on(
      table.accountId,
      table.reconciledAt,
      table.id
    ),
    index("reconciliations_balance_snapshot_id_idx").on(table.balanceSnapshotId)
  ]
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    accountId: text("account_id").notNull(),
    source: text("source").notNull(),
    createdAt: text("created_at").notNull(),
    closingBalanceMinor: bigint("closing_balance_minor", { mode: "number" }),
    asOfDate: text("as_of_date"),
    confirmedAt: text("confirmed_at"),
    balanceSnapshotId: text("balance_snapshot_id"),
    reconciliationId: text("reconciliation_id")
  },
  (table) => [
    ownerScopedForeignKey(table.accountId, table.ownerId, accounts.id, accounts.ownerId),
    ownerScopedForeignKey(table.balanceSnapshotId, table.ownerId, balanceSnapshots.id, balanceSnapshots.ownerId),
    ownerScopedForeignKey(table.reconciliationId, table.ownerId, reconciliations.id, reconciliations.ownerId),
    // The reverse side of transactions.import_batch_id (declared on transactions above, without
    // an inline FK — importBatches didn't exist yet at that point in the file).
    ownerScopedForeignKey(transactions.importBatchId, transactions.ownerId, table.id, table.ownerId),
    index("import_batches_created_at_idx").on(table.createdAt)
  ]
);

export const processedEmailAlerts = pgTable(
  "processed_email_alerts",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    mailbox: text("mailbox").notNull(),
    messageUid: text("message_uid").notNull(),
    status: text("status", { enum: ["matched", "unresolved", "invalid"] }).notNull(),
    processedAt: text("processed_at").notNull(),
    importBatchId: text("import_batch_id"),
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
  (table) => [
    // Live constraint is `on delete set null (import_batch_id)`
    // (postgres/migrations/20260914000000_processed_email_alerts_import_batch_set_null.sql) —
    // ownerScopedForeignKey's plain foreignKey() can't express a column-scoped ON DELETE, and
    // .onDelete("set null") would null out the NOT NULL owner_id column too, so this stays the
    // default NO ACTION; a schema regenerated from this file would need the migration re-applied.
    ownerScopedForeignKey(table.importBatchId, table.ownerId, importBatches.id, importBatches.ownerId),
    // Matches the live constraint (postgres/migrations/20260911020000_processed_email_alerts.sql's
    // processed_email_alerts_owner_mailbox_uid_key) — this must stay a uniqueIndex, not a plain
    // index, or a schema regenerated from this file would drop the idempotency guarantee.
    uniqueIndex("processed_email_alerts_owner_mailbox_uid_idx").on(table.ownerId, table.mailbox, table.messageUid)
  ]
);

// Per-Owner email alert sync credentials (docs/specs/email-alert-sync.md, ADR-0010) — one row per
// Owner, unlike the local tier's single-owner settings.json. App-layer-filtered like every other
// cloud table (ADR-0006); imap_user/imap_password are encrypted at rest
// (docs/adr/0012-imap-credentials-encrypted-at-rest-with-app-layer-key.md) — llm_api_key remains
// plaintext (out of that ADR's scope). See the spec's "Cloud credentials" note for the trade-off.
export const emailSyncCursors = pgTable(
  "email_sync_cursors",
  {
    ownerId: uuid("owner_id").notNull(),
    mailbox: text("mailbox").notNull(),
    // Null when the IMAP server reported no UIDVALIDITY; a changed value means uids restarted.
    uidValidity: text("uid_validity"),
    lastMessageUid: bigint("last_message_uid", { mode: "number" }).notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.mailbox] })]
);

export const emailSyncSettings = pgTable("email_sync_settings", {
  ownerId: uuid("owner_id").primaryKey(),
  imapHost: text("imap_host").notNull(),
  imapPort: integer("imap_port").notNull(),
  imapUser: text("imap_user").notNull(),
  imapPassword: text("imap_password").notNull(),
  // Provider-agnostic LLM call (docs/adr/0013-provider-agnostic-llm-config-with-cloud-only-host-
  // safety.md): any OpenAI-compatible chat-completions host, not just OpenRouter. llmApiKey stays
  // plaintext (out of ADR-0012's scope, same as the openrouter_api_key column it replaces) and
  // nullable — a self-hosted host like Ollama needs no auth.
  llmBaseUrl: text("llm_base_url").notNull(),
  llmApiKey: text("llm_api_key"),
  llmModel: text("llm_model").notNull(),
  pollIntervalMinutes: integer("poll_interval_minutes").notNull().default(5),
  // Status of the most recent poll (manual "Check now" or the Vercel Cron run), surfaced on
  // /settings so a silently broken mailbox connection is visible instead of the Imports queue just
  // never growing (docs/specs/email-alert-sync.md). Added via ALTER TABLE ADD COLUMN — nullable,
  // same reasoning as every other additive column in this codebase (no rebuild needed on Postgres).
  lastCheckedAt: text("last_checked_at"),
  lastResult: text("last_result"),
  lastErrorMessage: text("last_error_message"),
  // Nullable: never polled yet. The cron route orders listAllEmailSyncCredentials by this
  // ascending (nulls/never-polled first) so a run that hits its time budget partway through
  // rotates to the Owners it skipped last time, instead of always starving the same tail of the
  // table (docs/specs/email-alert-sync.md).
  lastPolledAt: text("last_polled_at")
});

// Per-Owner MCP cloud access token (docs/adr/0011-mcp-cloud-auth-static-bearer-token.md) — one
// active token per Owner, unlike loopback local mode which needs none; regenerating replaces it
// (the old token stops working immediately). Only the SHA-256 hash is ever stored — never the
// plaintext token — since a DB read must not hand over a live credential.
export const mcpAccessTokens = pgTable(
  "mcp_access_tokens",
  {
    ownerId: uuid("owner_id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => [uniqueIndex("mcp_access_tokens_token_hash_idx").on(table.tokenHash)]
);

// Owner id -> email mapping for admin/debug lookups against the app DB directly (see
// postgres/migrations/20260911040000_owner_emails.sql for why this isn't a trigger on
// auth.users). Populated at sign-in/sign-up (src/app/login/actions.ts,
// src/app/auth/callback/handle-callback.ts). Deliberately not referenced by any foreign key.
export const ownerEmails = pgTable("owner_emails", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull()
});

export const discrepancies = pgTable(
  "discrepancies",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    reconciliationId: text("reconciliation_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    resolution: text("resolution", { enum: ["corrected-my-record", "disputed-with-bank"] })
  },
  (table) => [
    ownerScopedForeignKey(table.reconciliationId, table.ownerId, reconciliations.id, reconciliations.ownerId),
    index("discrepancies_reconciliation_id_idx").on(table.reconciliationId)
  ]
);

export const adjustments = pgTable(
  "adjustments",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    transactionId: text("transaction_id").notNull().unique(),
    discrepancyId: text("discrepancy_id").notNull()
  },
  (table) => [
    ownerScopedForeignKey(table.transactionId, table.ownerId, transactions.id, transactions.ownerId),
    ownerScopedForeignKey(table.discrepancyId, table.ownerId, discrepancies.id, discrepancies.ownerId),
    index("adjustments_discrepancy_id_idx").on(table.discrepancyId)
  ]
);

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

export type EmailSyncSettingsRow = typeof emailSyncSettings.$inferSelect;
export type NewEmailSyncSettingsRow = typeof emailSyncSettings.$inferInsert;

export type EmailSyncCursorRow = typeof emailSyncCursors.$inferSelect;
export type NewEmailSyncCursorRow = typeof emailSyncCursors.$inferInsert;

export type ProcessedEmailAlertRow = typeof processedEmailAlerts.$inferSelect;
export type NewProcessedEmailAlertRow = typeof processedEmailAlerts.$inferInsert;

export type OwnerEmailRow = typeof ownerEmails.$inferSelect;
export type NewOwnerEmailRow = typeof ownerEmails.$inferInsert;

export type McpAccessTokenRow = typeof mcpAccessTokens.$inferSelect;
export type NewMcpAccessTokenRow = typeof mcpAccessTokens.$inferInsert;
