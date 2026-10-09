create table balance_snapshots (
  id text primary key,
  owner_id uuid not null,
  account_id text not null,
  as_of_date text not null,
  balance_minor bigint not null,
  foreign key (account_id, owner_id) references accounts (id, owner_id) on delete cascade
);

create index balance_snapshots_account_date_idx on balance_snapshots (account_id, as_of_date);

alter table balance_snapshots enable row level security;

create policy "owner can access own balance snapshots" on balance_snapshots
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on balance_snapshots to authenticated;
