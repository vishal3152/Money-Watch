-- Secret-bearing tables must not be reachable via Supabase PostgREST (anon/authenticated
-- Data API). The app reads them only through the table-owning role (ADR-0006 bypasses RLS).
-- Without this revoke, a browser session + NEXT_PUBLIC publishable key can SELECT
-- openrouter_api_key plaintext (and UPDATE imap_host toward attacker infra).

revoke all on table email_sync_settings from authenticated, anon;
revoke all on table mcp_access_tokens from authenticated, anon;
