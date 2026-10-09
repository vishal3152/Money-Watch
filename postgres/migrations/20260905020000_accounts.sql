-- A plain FK on institution_id would only check the row exists, not that it
-- belongs to the same owner. Add a uniqueness constraint on (id, owner_id) so
-- accounts can target a compound FK that enforces same-owner references.
alter table institutions add constraint institutions_id_owner_id_key unique (id, owner_id);

create table accounts (
  id text primary key,
  owner_id uuid not null,
  institution_id text not null,
  name text not null,
  account_number text,
  currency_code text not null,
  foreign key (institution_id, owner_id) references institutions (id, owner_id)
);

alter table accounts enable row level security;

create policy "owner can access own accounts" on accounts
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on accounts to authenticated;
