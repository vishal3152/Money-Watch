-- How far email alert sync has read each Owner's mailbox: every IMAP message up to
-- last_message_uid has been looked at, whatever the outcome (docs/specs/email-alert-sync.md).
-- Replaces the per-message processed_email_alerts row as the idempotency mechanism, so a mailbox
-- full of non-bank mail costs one row per mailbox instead of one row per email.
create table email_sync_cursors (
  owner_id uuid not null,
  mailbox text not null,
  -- Null when the IMAP server reported no UIDVALIDITY; a changed value means uids restarted from 1.
  uid_validity text,
  last_message_uid bigint not null,
  updated_at text not null,
  primary key (owner_id, mailbox)
);

alter table email_sync_cursors enable row level security;

create policy "owner can access own email sync cursors" on email_sync_cursors
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on email_sync_cursors to authenticated;
