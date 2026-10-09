-- ADR-0011: per-Owner MCP cloud access token (one row per Owner, unlike loopback local mode which
-- needs no credential at all). Only the SHA-256 hash of the token is stored — never the plaintext
-- — the same trade-off as email_sync_settings' stored secrets, minus the plaintext itself.
create table mcp_access_tokens (
  owner_id uuid primary key,
  token_hash text not null,
  created_at text not null
);

create unique index mcp_access_tokens_token_hash_idx on mcp_access_tokens (token_hash);

alter table mcp_access_tokens enable row level security;

create policy "owner can access own mcp access token" on mcp_access_tokens
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on mcp_access_tokens to authenticated;
