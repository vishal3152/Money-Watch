alter table transactions add constraint transactions_id_owner_id_key unique (id, owner_id);
alter table discrepancies add constraint discrepancies_id_owner_id_key unique (id, owner_id);

create table adjustments (
  id text primary key,
  owner_id uuid not null,
  transaction_id text not null unique,
  discrepancy_id text not null,
  foreign key (transaction_id, owner_id) references transactions (id, owner_id) on delete cascade,
  foreign key (discrepancy_id, owner_id) references discrepancies (id, owner_id)
);

alter table adjustments enable row level security;

create policy "owner can access own adjustments" on adjustments
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on adjustments to authenticated;
