-- No transfer_id or import_batch_id yet: transfers doesn't exist until the next
-- migration (Transfer writes directly into this table), and ImportBatch is
-- deferred for the cloud tier entirely (BUILD_PLAN_CLOUD.md Decision 4).
create table transactions (
  id text primary key,
  owner_id uuid not null,
  account_id text not null,
  amount_minor bigint not null,
  occurred_at text not null,
  description text not null,
  trust_status text not null check (trust_status in ('Confirmed', 'Imported')),
  category text check (
    category is null or category in (
      'Grocery', 'Dining', 'Education', 'Transport', 'Utilities', 'Rent', 'Health', 'Entertainment', 'Other',
      'Salary', 'Interest', 'Gift', 'Other Income'
    )
  ),
  foreign key (account_id, owner_id) references accounts (id, owner_id)
);

create index transactions_account_date_idx on transactions (account_id, occurred_at);

alter table transactions enable row level security;

create policy "owner can access own transactions" on transactions
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on transactions to authenticated;
