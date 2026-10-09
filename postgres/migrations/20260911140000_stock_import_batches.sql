-- StockImportBatch: mirrors import_batches but for StockTransaction line items on a
-- ShareTradingAccount, deliberately with no closing-balance/Reconciliation columns (share-trading.md:
-- no Reconciliation equivalent exists for share holdings).
create table stock_import_batches (
  id text primary key,
  owner_id uuid not null,
  share_trading_account_id text not null,
  source text not null,
  created_at text not null,
  confirmed_at text,
  foreign key (share_trading_account_id, owner_id) references share_trading_accounts (id, owner_id)
);

alter table stock_import_batches enable row level security;

create policy "owner can access own stock import batches" on stock_import_batches
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on stock_import_batches to authenticated;

alter table stock_import_batches add constraint stock_import_batches_id_owner_id_key unique (id, owner_id);

-- Bootstrap completion, same shape as transactions.import_batch_id in
-- 20260911000000_import_batches.sql: stock_transactions was created before stock_import_batches
-- existed.
alter table stock_transactions add column trust_status text not null default 'Confirmed'
  check (trust_status in ('Confirmed', 'Imported'));
alter table stock_transactions add column import_batch_id text;
alter table stock_transactions
  add constraint stock_transactions_import_batch_id_owner_id_fkey
  foreign key (import_batch_id, owner_id) references stock_import_batches (id, owner_id);

create index stock_transactions_import_batch_id_idx on stock_transactions (import_batch_id) where import_batch_id is not null;
