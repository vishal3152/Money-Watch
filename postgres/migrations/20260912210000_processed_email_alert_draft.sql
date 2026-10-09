-- Unresolved alerts now carry the alert's fields exactly as the LLM produced them, plus the fields
-- that failed validation, so the owner can correct them while assigning an Account
-- (docs/specs/email-alert-sync.md). Additive and nullable: rows written before this change keep
-- their parsed_alert_json, which is still read as the draft.
alter table processed_email_alerts add column if not exists alert_draft_json text;
alter table processed_email_alerts add column if not exists invalid_fields_json text;
