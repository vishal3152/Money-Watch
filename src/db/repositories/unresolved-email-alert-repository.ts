import { and, desc, eq } from "drizzle-orm";

import type { DrizzleDb } from "@/db/client";
import { runDatabaseWrite } from "@/db/errors";
import {
  deserializeEmailAlertDraft,
  deserializeInvalidFields
} from "@/db/repositories/email-alert-draft-json";
import type { UnresolvedEmailAlert, UnresolvedEmailAlertRepositoryPort } from "@/db/repositories/ports";
import { processedEmailAlerts } from "@/db/schema";

export type { UnresolvedEmailAlert };

/**
 * The owner's review queue of bank alert emails that could not be imported automatically
 * (docs/specs/email-alert-sync.md). Idempotency against re-reading a mailbox lives in
 * `EmailSyncCursorRepository`, not here — this table only ever holds alerts still waiting on the
 * owner, and a row is deleted once its alert becomes an ImportBatch.
 *
 * Still backed by the `processed_email_alerts` table, which older polls also used for matched and
 * invalid rows; those rows are never written or listed now.
 */
export class UnresolvedEmailAlertRepository implements UnresolvedEmailAlertRepositoryPort {
  constructor(private readonly db: DrizzleDb) {}

  async save(alert: UnresolvedEmailAlert): Promise<void> {
    await runDatabaseWrite(() =>
      this.db.insert(processedEmailAlerts).values({
        id: alert.id,
        mailbox: alert.mailbox,
        messageUid: alert.messageUid,
        status: "unresolved",
        processedAt: alert.detectedAt,
        importBatchId: null,
        failureReason: alert.failureReason,
        parsedAlertJson: null,
        alertDraftJson: JSON.stringify(alert.draft),
        invalidFieldsJson: JSON.stringify(alert.invalidFields)
      })
    );
  }

  async listAll(): Promise<UnresolvedEmailAlert[]> {
    const rows = await this.db.query.processedEmailAlerts.findMany({
      where: eq(processedEmailAlerts.status, "unresolved"),
      orderBy: [desc(processedEmailAlerts.processedAt)]
    });

    return rows.map((row) => toUnresolvedEmailAlert(row));
  }

  async getById(id: string): Promise<UnresolvedEmailAlert | null> {
    const row = await this.db.query.processedEmailAlerts.findFirst({
      where: and(eq(processedEmailAlerts.id, id), eq(processedEmailAlerts.status, "unresolved"))
    });

    return row ? toUnresolvedEmailAlert(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await runDatabaseWrite(() =>
      this.db
        .delete(processedEmailAlerts)
        .where(and(eq(processedEmailAlerts.id, id), eq(processedEmailAlerts.status, "unresolved")))
        .returning({ id: processedEmailAlerts.id })
    );

    return deleted.length > 0;
  }
}

function toUnresolvedEmailAlert(row: {
  id: string;
  mailbox: string;
  messageUid: string;
  processedAt: string;
  failureReason: string | null;
  parsedAlertJson: string | null;
  alertDraftJson: string | null;
  invalidFieldsJson: string | null;
}): UnresolvedEmailAlert {
  return {
    id: row.id,
    mailbox: row.mailbox,
    messageUid: row.messageUid,
    detectedAt: row.processedAt,
    failureReason: row.failureReason,
    draft: deserializeEmailAlertDraft(row.alertDraftJson, row.parsedAlertJson),
    invalidFields: deserializeInvalidFields(row.invalidFieldsJson)
  };
}
