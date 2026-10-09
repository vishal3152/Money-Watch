-- ADR-0010: cloud-tier idempotency tracking for email alert sync, mirroring the local tier's
-- processed_email_alerts table (SQLite) — a Vercel Cron poll must not reprocess the same IMAP
-- message on its next invocation.
create table processed_email_alerts (
  id text primary key,
  owner_id uuid not null,
  mailbox text not null,
  message_uid text not null,
  status text not null check (status in ('matched', 'unresolved', 'invalid')),
  processed_at text not null,
  import_batch_id text,
  foreign key (import_batch_id, owner_id) references import_batches (id, owner_id)
);

create unique index processed_email_alerts_owner_mailbox_uid_key
  on processed_email_alerts (owner_id, mailbox, message_uid);

alter table processed_email_alerts enable row level security;

create policy "owner can access own processed email alerts" on processed_email_alerts
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on processed_email_alerts to authenticated;
