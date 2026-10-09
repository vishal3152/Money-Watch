-- Deleting an ImportBatch (directly, or via cascading account deletion) must not be blocked by a
-- processed_email_alerts row that only points at it for provenance — mirrors the SQLite schema's
-- `onDelete: "set null"` on the same column (src/db/schema.ts). The original FK
-- (20260911020000_processed_email_alerts.sql) had no ON DELETE clause, so Postgres defaulted to
-- NO ACTION and every ImportBatch/Account delete with a matching alert row failed with a foreign
-- key violation instead of leaving the alert's import_batch_id null.
alter table processed_email_alerts
  drop constraint processed_email_alerts_import_batch_id_owner_id_fkey;

alter table processed_email_alerts
  add constraint processed_email_alerts_import_batch_id_owner_id_fkey
  foreign key (import_batch_id, owner_id) references import_batches (id, owner_id)
  on delete set null (import_batch_id);
