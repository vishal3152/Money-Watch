-- Same reasoning as accounts: compound FKs so a FixedDeposit can't reference
-- another Owner's Institution or Account.
alter table accounts add constraint accounts_id_owner_id_key unique (id, owner_id);

create table fixed_deposits (
  id text primary key,
  owner_id uuid not null,
  name text not null,
  account_number text,
  institution_id text not null,
  linked_account_id text not null,
  principal_minor bigint not null,
  original_principal_minor bigint not null,
  currency_code text not null,
  interest_rate_bps integer not null,
  opened_date text not null,
  maturity_date text not null,
  status text not null check (status in ('Open', 'Matured', 'PrematurelyClosed')),
  foreign key (institution_id, owner_id) references institutions (id, owner_id),
  foreign key (linked_account_id, owner_id) references accounts (id, owner_id)
);

alter table fixed_deposits enable row level security;

create policy "owner can access own fixed deposits" on fixed_deposits
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on fixed_deposits to authenticated;
