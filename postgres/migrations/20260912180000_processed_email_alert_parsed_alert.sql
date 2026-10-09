-- Persist ParsedEmailAlert JSON on unresolved rows so the owner can assign an Account by hand
-- without re-fetching/re-parsing the email (docs/specs/email-alert-sync.md).
-- Nullable — matched/invalid rows leave it null; unresolved rows recorded before this column
-- existed stay null and cannot be assigned until a later poll re-records them with a payload.
alter table processed_email_alerts add column if not exists parsed_alert_json text;
