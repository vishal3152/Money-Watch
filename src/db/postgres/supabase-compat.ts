/**
 * Historical `postgres/migrations/*.sql` files reference Supabase Auth
 * primitives (`auth.uid()`, roles `authenticated` / `anon`). Those exist on
 * Supabase Postgres but not on plain hosts (e.g. Aiven). App isolation is
 * app-layer owner filtering (ADR-0006); these stubs only let CREATE POLICY /
 * GRANT / REVOKE statements apply. Table owners still bypass RLS.
 *
 * On Supabase, `auth` is not writable by the app role — skip installing
 * `auth.uid()` when `to_regprocedure('auth.uid()')` is already set.
 */
export const SUPABASE_COMPAT_BOOTSTRAP_SQL = `
do $bootstrap$
begin
  -- Real Supabase already has auth.uid(); the app role cannot CREATE in schema auth
  -- (permission denied). Skip stubs when present; install only on plain Postgres.
  if to_regprocedure('auth.uid()') is not null then
    null;
  else
    create schema if not exists auth;

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $fn$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $fn$;
  end if;
end
$bootstrap$;

do $bootstrap$
begin
  create role authenticated;
exception
  when duplicate_object then null;
end
$bootstrap$;

do $bootstrap$
begin
  create role anon;
exception
  when duplicate_object then null;
end
$bootstrap$;
`;
