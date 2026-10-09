-- ADR-0014: Suspected Duplicate flag (docs/adr/0014-duplicate-imports-flagged-and-gated-at-confirm-not-blocked-at-commit.md).
-- Nullable, additive: rows written before this column existed stay null. `on delete set null` —
-- if the Transaction this one points at is itself removed, there is nothing left to be a
-- duplicate of. Mirrors the SQLite schema's self-referencing `onDelete: "set null"` column.
alter table transactions add column possible_duplicate_of_transaction_id text;

alter table transactions
  add constraint transactions_possible_duplicate_of_transaction_id_owner_id_fkey
  foreign key (possible_duplicate_of_transaction_id, owner_id) references transactions (id, owner_id)
  on delete set null (possible_duplicate_of_transaction_id);

create index transactions_possible_duplicate_of_transaction_id_idx
  on transactions (possible_duplicate_of_transaction_id)
  where possible_duplicate_of_transaction_id is not null;
