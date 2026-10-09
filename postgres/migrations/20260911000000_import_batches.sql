-- ADR-0010: ImportBatch gets a Postgres port, for cloud email alert sync.
create table import_batches (
  id text primary key,
  owner_id uuid not null,
  account_id text not null,
  source text not null,
  created_at text not null,
  closing_balance_minor bigint,
  as_of_date text,
  confirmed_at text,
  balance_snapshot_id text,
  reconciliation_id text,
  foreign key (account_id, owner_id) references accounts (id, owner_id),
  foreign key (balance_snapshot_id, owner_id) references balance_snapshots (id, owner_id),
  foreign key (reconciliation_id, owner_id) references reconciliations (id, owner_id)
);

alter table import_batches enable row level security;

create policy "owner can access own import batches" on import_batches
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on import_batches to authenticated;

alter table import_batches add constraint import_batches_id_owner_id_key unique (id, owner_id);

-- Bootstrap completion, same shape as transfer_id in 20260905050000_transfers.sql:
-- transactions was created before import_batches existed.
alter table transactions add column import_batch_id text;
alter table transactions
  add constraint transactions_import_batch_id_owner_id_fkey
  foreign key (import_batch_id, owner_id) references import_batches (id, owner_id);

create index transactions_import_batch_id_idx on transactions (import_batch_id) where import_batch_id is not null;
