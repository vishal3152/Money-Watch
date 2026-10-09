alter table balance_snapshots add constraint balance_snapshots_id_owner_id_key unique (id, owner_id);

create table reconciliations (
  id text primary key,
  owner_id uuid not null,
  account_id text not null,
  balance_snapshot_id text not null,
  computed_balance_minor bigint not null,
  reconciled_at text not null,
  foreign key (account_id, owner_id) references accounts (id, owner_id),
  foreign key (balance_snapshot_id, owner_id) references balance_snapshots (id, owner_id)
);

alter table reconciliations enable row level security;

create policy "owner can access own reconciliations" on reconciliations
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on reconciliations to authenticated;

alter table reconciliations add constraint reconciliations_id_owner_id_key unique (id, owner_id);

create table discrepancies (
  id text primary key,
  owner_id uuid not null,
  reconciliation_id text not null,
  amount_minor bigint not null,
  resolution text check (
    resolution is null or resolution in ('corrected-my-record', 'disputed-with-bank')
  ),
  foreign key (reconciliation_id, owner_id) references reconciliations (id, owner_id) on delete cascade
);

alter table discrepancies enable row level security;

create policy "owner can access own discrepancies" on discrepancies
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on discrepancies to authenticated;
