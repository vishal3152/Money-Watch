create table institutions (
  id text primary key,
  owner_id uuid not null,
  name text not null
);

alter table institutions enable row level security;

create policy "owner can access own institutions" on institutions
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on institutions to authenticated;
