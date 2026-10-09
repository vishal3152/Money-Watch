-- Fixture table used only to prove the RLS-scoping mechanism (src/db/postgres/run-as-owner.ts)
-- independent of any real domain table. Not part of the application schema.
create table rls_scope_fixture (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  label text not null
);

alter table rls_scope_fixture enable row level security;

create policy "owner can access own rows" on rls_scope_fixture
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on rls_scope_fixture to authenticated;
