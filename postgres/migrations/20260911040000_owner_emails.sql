-- Owner id -> email mapping for admin/debug lookups directly against the app DB (e.g. via the
-- Supabase SQL editor or psql), without going through the Supabase Auth API. Populated by the app
-- at sign-in/sign-up (src/db/postgres/repositories/owner-email-repository.ts), not a DB trigger
-- on auth.users, because self-hosted/plain-Postgres deployments (Aiven) have no real auth.users
-- table for a trigger to attach to (src/db/postgres/supabase-compat.ts stubs only auth.uid()).
--
-- Deliberately not named "owners" and never referenced by a foreign key: rows appear only once an
-- Owner signs in again after this table exists, so an owner_id with real data elsewhere can be
-- legitimately missing here. This is an attestation of what the auth provider says an Owner's
-- email is, not a source of truth other tables may depend on — so, unlike every other cloud
-- table, Owners get read-only access to their own row and no write grant at all (the app's own
-- writes go through the table-owning connection, which bypasses RLS regardless — ADR-0006).
create table owner_emails (
  id uuid primary key,
  email text not null
);

alter table owner_emails enable row level security;

create policy "owner can read own row" on owner_emails
  for select
  using (id = auth.uid());

grant select on owner_emails to authenticated;
