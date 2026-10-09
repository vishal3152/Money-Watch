-- Surface why an email alert was left unresolved/invalid on /imports (docs/specs/email-alert-sync.md).
-- Nullable — matched rows leave it null, and rows recorded before this column existed stay null.
alter table processed_email_alerts add column failure_reason text;
