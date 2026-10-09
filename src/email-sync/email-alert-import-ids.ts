import { uuidFromHash } from "@/domain/deterministic-id";

/**
 * Stable ImportBatch / Transaction ids for one IMAP message so a crash between create and
 * markProcessed cannot produce a second ledger write on retry — the same primary key is reused
 * and `create` is treated as idempotent on conflict.
 *
 * `ownerId` is folded into the hash material because `import_batches.id`/`transactions.id` are a
 * single global primary key, not scoped per-owner at the schema level (unlike every other column
 * on those tables): without it, two Owners polling mailboxes that happen to share an `imapUser`
 * (no cross-owner uniqueness constraint on that field) and receive a message with the same IMAP
 * UID would compute the same id and collide on the second owner's insert.
 */
export function emailAlertImportBatchId(ownerId: string | null, mailbox: string, messageUid: string): string {
  return uuidFromHash(`email-alert-batch:${ownerId ?? ""}:${mailbox}:${messageUid}`);
}

export function emailAlertTransactionId(ownerId: string | null, mailbox: string, messageUid: string): string {
  return uuidFromHash(`email-alert-txn:${ownerId ?? ""}:${mailbox}:${messageUid}`);
}
