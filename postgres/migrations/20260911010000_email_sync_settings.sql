-- ADR-0010: per-Owner email alert sync credentials for the cloud tier (one row per Owner,
-- unlike the local tier's single-owner settings.json). Plaintext, app-layer-filtered like every
-- other cloud table (ADR-0006) — the accepted trade-off is documented in
-- docs/specs/email-alert-sync.md's "Cloud credentials" note.
create table email_sync_settings (
  owner_id uuid primary key,
  imap_host text not null,
  imap_port integer not null,
  imap_user text not null,
  imap_password text not null,
  openrouter_api_key text not null,
  poll_interval_minutes integer not null default 5
);

alter table email_sync_settings enable row level security;

create policy "owner can access own email sync settings" on email_sync_settings
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on email_sync_settings to authenticated;
