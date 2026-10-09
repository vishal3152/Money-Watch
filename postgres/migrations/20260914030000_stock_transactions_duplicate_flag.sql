-- ADR-0014: same Suspected Duplicate flag and statement reference number as transactions
-- (20260914010000, 20260914020000), mirrored onto stock_transactions.
alter table stock_transactions add column external_ref text;
alter table stock_transactions add column possible_duplicate_of_transaction_id text;

-- Needed for the self-referencing FK below — stock_transactions never got this constraint added
-- (unlike transactions, which got transactions_id_owner_id_key in 20260905111029_adjustments.sql).
alter table stock_transactions add constraint stock_transactions_id_owner_id_key unique (id, owner_id);

alter table stock_transactions
  add constraint stock_transactions_possible_duplicate_of_transaction_id_fkey
  foreign key (possible_duplicate_of_transaction_id, owner_id) references stock_transactions (id, owner_id)
  on delete set null (possible_duplicate_of_transaction_id);

create index stock_transactions_possible_duplicate_of_transaction_id_idx
  on stock_transactions (possible_duplicate_of_transaction_id)
  where possible_duplicate_of_transaction_id is not null;
