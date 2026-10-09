-- Owner-only-scoped list queries (institutions/accounts/fixed_deposits
-- listAll()) filter by owner_id alone with no other predicate. Owner
-- isolation is enforced in application code, not RLS (the app connects as
-- the table-owning role, see docs/adr/0006-drop-rls-for-app-layer-owner-filtering.md),
-- so without owner_id leading an index, one owner's listAll() sequentially
-- scans every other owner's rows too -- table size is the sum across all
-- tenants, not just the caller's. Trailing `id` matches each repository's
-- `ORDER BY id`, so the index also serves the sort.
-- IF NOT EXISTS: local/cloud DBs may already have these indexes from a prior
-- partial apply or schema sync without a schema_migrations row.
create index if not exists institutions_owner_id_id_idx on institutions (owner_id, id);
create index if not exists accounts_owner_id_id_idx on accounts (owner_id, id);
create index if not exists fixed_deposits_owner_id_id_idx on fixed_deposits (owner_id, id);

-- A compound foreign key does not auto-index its referencing (child) column
-- in Postgres -- only the referenced (unique/PK) side gets one. These
-- columns are filtered directly (getDependentCounts, dependent lookups) and
-- are cascade-delete/restrict targets.
create index if not exists accounts_institution_id_idx on accounts (institution_id);
create index if not exists fixed_deposits_institution_id_idx on fixed_deposits (institution_id);
create index if not exists fixed_deposits_linked_account_id_idx on fixed_deposits (linked_account_id);
create index if not exists reconciliations_balance_snapshot_id_idx on reconciliations (balance_snapshot_id);
create index if not exists discrepancies_reconciliation_id_idx on discrepancies (reconciliation_id);
create index if not exists adjustments_discrepancy_id_idx on adjustments (discrepancy_id);

-- Transfer.listByLeg() ORs across all four leg columns; each is NULL on most
-- rows (exactly one of {account, fixed deposit} is set per side), so partial
-- indexes let the planner BitmapOr the matches instead of scanning.
create index if not exists transfers_source_account_id_idx on transfers (source_account_id) where source_account_id is not null;
create index if not exists transfers_source_fixed_deposit_id_idx on transfers (source_fixed_deposit_id) where source_fixed_deposit_id is not null;
create index if not exists transfers_destination_account_id_idx on transfers (destination_account_id) where destination_account_id is not null;
create index if not exists transfers_destination_fixed_deposit_id_idx on transfers (destination_fixed_deposit_id) where destination_fixed_deposit_id is not null;

-- Transfer.delete() looks up its Transactions by transfer_id; most
-- Transactions have none.
create index if not exists transactions_transfer_id_idx on transactions (transfer_id) where transfer_id is not null;

-- Reconciliation.listByAccountId() orders by (reconciled_at, id); include
-- both trailing columns so the sort is served by the index too.
create index if not exists reconciliations_account_id_reconciled_at_id_idx on reconciliations (account_id, reconciled_at, id);
