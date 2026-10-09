-- UI review follow-up (docs/specs/email-alert-sync.md): surface the last poll's outcome on
-- /settings so a broken mailbox connection or expired API key is visible instead of the Imports
-- queue silently starving. Nullable — never set until the first poll (manual "Check now" or the
-- Vercel Cron run) actually happens for this Owner. No RLS/grant changes: same policy as the rest
-- of email_sync_settings already covers these columns.
alter table email_sync_settings add column last_checked_at text;
alter table email_sync_settings add column last_result text;
alter table email_sync_settings add column last_error_message text;
