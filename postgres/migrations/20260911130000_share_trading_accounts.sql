-- ShareTradingAccount: top-level, Institution-owned, not linked to a cash
-- Account (CONTEXT.md). Same compound-FK reasoning as accounts/fixed_deposits.
create table share_trading_accounts (
  id text primary key,
  owner_id uuid not null,
  institution_id text not null,
  name text not null,
  account_number text,
  currency_code text not null,
  foreign key (institution_id, owner_id) references institutions (id, owner_id)
);

alter table share_trading_accounts enable row level security;

create policy "owner can access own share trading accounts" on share_trading_accounts
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on share_trading_accounts to authenticated;

alter table share_trading_accounts add constraint share_trading_accounts_id_owner_id_key unique (id, owner_id);

-- StockTransaction: a Buy/Sell of one company's shares (scrip_code) against a
-- ShareTradingAccount. No cash-leg bookkeeping and no oversell rejection —
-- see CONTEXT.md's Holding entry.
create table stock_transactions (
  id text primary key,
  owner_id uuid not null,
  share_trading_account_id text not null,
  scrip_code text not null,
  type text not null check (type in ('Buy', 'Sell')),
  quantity integer not null,
  price_per_unit_minor bigint not null,
  occurred_at text not null,
  description text not null,
  foreign key (share_trading_account_id, owner_id) references share_trading_accounts (id, owner_id)
);

create index stock_transactions_share_trading_account_date_idx
  on stock_transactions (share_trading_account_id, occurred_at);

alter table stock_transactions enable row level security;

create policy "owner can access own stock transactions" on stock_transactions
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on stock_transactions to authenticated;
